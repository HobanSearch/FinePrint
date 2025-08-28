#!/usr/bin/env python3
"""
LoRA Fine-tuning Script for GPT-OSS 20B Model
Trains the model on privacy policy analysis dataset
"""

import json
import os
import sys
import argparse
import torch
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple
import logging
from dataclasses import dataclass
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    TrainingArguments,
    Trainer,
    DataCollatorForLanguageModeling,
    BitsAndBytesConfig
)
from peft import (
    LoraConfig,
    get_peft_model,
    prepare_model_for_kbit_training,
    TaskType
)
from datasets import Dataset
import bitsandbytes as bnb
from accelerate import Accelerator

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('training.log')
    ]
)
logger = logging.getLogger(__name__)

@dataclass
class ModelConfig:
    """Configuration for the GPT-OSS model"""
    model_name: str = "gpt-oss-20b"  # Will be mapped to HuggingFace model
    model_path: str = "EleutherAI/gpt-neox-20b"  # Actual HF model path
    max_length: int = 2048
    temperature: float = 0.7
    top_p: float = 0.9
    use_8bit: bool = True
    use_4bit: bool = False

@dataclass
class LoRAConfig:
    """LoRA specific configuration"""
    r: int = 64  # Rank
    lora_alpha: int = 128
    target_modules: List[str] = None
    lora_dropout: float = 0.1
    bias: str = "none"
    task_type: str = "CAUSAL_LM"
    
    def __post_init__(self):
        if self.target_modules is None:
            # Target modules for GPT-NeoX architecture
            self.target_modules = [
                "query_key_value",
                "dense",
                "dense_h_to_4h",
                "dense_4h_to_h"
            ]

@dataclass
class TrainingConfig:
    """Training hyperparameters"""
    batch_size: int = 4
    gradient_accumulation_steps: int = 4
    num_epochs: int = 3
    learning_rate: float = 2e-4
    warmup_steps: int = 100
    logging_steps: int = 10
    save_steps: int = 500
    eval_steps: int = 100
    save_total_limit: int = 3
    fp16: bool = True
    gradient_checkpointing: bool = True
    output_dir: str = "./gpt-oss-privacy-lora"
    hub_model_id: str = "fine-print-ai/gpt-oss-privacy-analyzer"

class PrivacyDatasetProcessor:
    """Process the privacy analysis dataset for training"""
    
    def __init__(self, tokenizer, max_length: int = 2048):
        self.tokenizer = tokenizer
        self.max_length = max_length
        
    def load_dataset(self, file_path: str) -> List[Dict]:
        """Load JSONL dataset"""
        logger.info(f"Loading dataset from {file_path}")
        data = []
        with open(file_path, 'r') as f:
            for line in f:
                data.append(json.loads(line.strip()))
        logger.info(f"Loaded {len(data)} examples")
        return data
    
    def format_prompt(self, example: Dict) -> str:
        """Format training example into prompt"""
        prompt = f"""### Instruction:
{example['instruction']}

### Input:
{example['input']}

### Response:
{example['output']}"""
        return prompt
    
    def tokenize_function(self, examples: Dict) -> Dict:
        """Tokenize examples for training"""
        texts = [self.format_prompt(ex) for ex in examples['data']]
        
        model_inputs = self.tokenizer(
            texts,
            max_length=self.max_length,
            padding="max_length",
            truncation=True,
            return_tensors="pt"
        )
        
        # Set labels same as input_ids for causal LM
        model_inputs["labels"] = model_inputs["input_ids"].clone()
        
        return model_inputs
    
    def prepare_dataset(self, data: List[Dict]) -> Dataset:
        """Prepare dataset for training"""
        # Convert to HuggingFace Dataset
        dataset_dict = {"data": data}
        dataset = Dataset.from_dict(dataset_dict)
        
        # Split into train and validation
        split_dataset = dataset.train_test_split(test_size=0.1, seed=42)
        
        logger.info(f"Train set size: {len(split_dataset['train'])}")
        logger.info(f"Validation set size: {len(split_dataset['test'])}")
        
        return split_dataset

class GPTOSSLoRATrainer:
    """Main trainer class for GPT-OSS LoRA fine-tuning"""
    
    def __init__(
        self,
        model_config: ModelConfig,
        lora_config: LoRAConfig,
        training_config: TrainingConfig
    ):
        self.model_config = model_config
        self.lora_config = lora_config
        self.training_config = training_config
        self.accelerator = Accelerator()
        
    def setup_model_and_tokenizer(self):
        """Load model and tokenizer with quantization"""
        logger.info("Loading tokenizer...")
        self.tokenizer = AutoTokenizer.from_pretrained(
            self.model_config.model_path,
            trust_remote_code=True
        )
        self.tokenizer.pad_token = self.tokenizer.eos_token
        
        # Quantization config
        bnb_config = None
        if self.model_config.use_8bit:
            bnb_config = BitsAndBytesConfig(
                load_in_8bit=True,
                bnb_8bit_compute_dtype=torch.float16
            )
        elif self.model_config.use_4bit:
            bnb_config = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_compute_dtype=torch.float16,
                bnb_4bit_use_double_quant=True
            )
        
        logger.info("Loading model...")
        self.model = AutoModelForCausalLM.from_pretrained(
            self.model_config.model_path,
            quantization_config=bnb_config,
            device_map="auto",
            trust_remote_code=True,
            torch_dtype=torch.float16
        )
        
        # Prepare model for k-bit training
        self.model = prepare_model_for_kbit_training(self.model)
        
        # Apply LoRA
        logger.info("Applying LoRA configuration...")
        peft_config = LoraConfig(
            r=self.lora_config.r,
            lora_alpha=self.lora_config.lora_alpha,
            target_modules=self.lora_config.target_modules,
            lora_dropout=self.lora_config.lora_dropout,
            bias=self.lora_config.bias,
            task_type=TaskType.CAUSAL_LM
        )
        
        self.model = get_peft_model(self.model, peft_config)
        self.model.print_trainable_parameters()
        
    def train(self, train_dataset: Dataset, eval_dataset: Dataset):
        """Run the training loop"""
        # Training arguments
        training_args = TrainingArguments(
            output_dir=self.training_config.output_dir,
            num_train_epochs=self.training_config.num_epochs,
            per_device_train_batch_size=self.training_config.batch_size,
            per_device_eval_batch_size=self.training_config.batch_size,
            gradient_accumulation_steps=self.training_config.gradient_accumulation_steps,
            gradient_checkpointing=self.training_config.gradient_checkpointing,
            warmup_steps=self.training_config.warmup_steps,
            logging_steps=self.training_config.logging_steps,
            save_steps=self.training_config.save_steps,
            eval_steps=self.training_config.eval_steps,
            save_total_limit=self.training_config.save_total_limit,
            evaluation_strategy="steps",
            save_strategy="steps",
            load_best_model_at_end=True,
            fp16=self.training_config.fp16,
            bf16=False,
            learning_rate=self.training_config.learning_rate,
            logging_dir=f"{self.training_config.output_dir}/logs",
            report_to=["tensorboard"],
            push_to_hub=False,
            hub_model_id=self.training_config.hub_model_id,
            hub_strategy="every_save"
        )
        
        # Data collator
        data_collator = DataCollatorForLanguageModeling(
            tokenizer=self.tokenizer,
            mlm=False
        )
        
        # Create trainer
        trainer = Trainer(
            model=self.model,
            args=training_args,
            train_dataset=train_dataset,
            eval_dataset=eval_dataset,
            data_collator=data_collator,
            tokenizer=self.tokenizer
        )
        
        # Start training
        logger.info("Starting training...")
        trainer.train()
        
        # Save the final model
        logger.info("Saving final model...")
        trainer.save_model(f"{self.training_config.output_dir}/final")
        
        return trainer
    
    def create_ollama_adapter(self, adapter_path: str):
        """Create Ollama-compatible LoRA adapter"""
        logger.info("Creating Ollama adapter...")
        
        # Create Modelfile for Ollama
        modelfile_content = f"""FROM gpt-oss:20b
ADAPTER {adapter_path}/adapter_model.bin
PARAMETER temperature {self.model_config.temperature}
PARAMETER top_p {self.model_config.top_p}
PARAMETER max_length {self.model_config.max_length}

TEMPLATE \"\"\"
### Instruction:
{{{{ .Prompt }}}}

### Response:
\"\"\"

SYSTEM \"\"\"
You are Fine Print AI, an expert at analyzing privacy policies and terms of service documents.
Your task is to identify privacy concerns, assign risk scores, and provide clear explanations.
Always be thorough, accurate, and user-friendly in your analysis.
\"\"\"
"""
        
        modelfile_path = f"{adapter_path}/Modelfile"
        with open(modelfile_path, 'w') as f:
            f.write(modelfile_content)
        
        logger.info(f"Created Modelfile at {modelfile_path}")
        
        # Create adapter info
        adapter_info = {
            "base_model": "gpt-oss:20b",
            "adapter_type": "lora",
            "training_date": datetime.now().isoformat(),
            "dataset": "fine-print-privacy-analysis",
            "parameters": {
                "r": self.lora_config.r,
                "alpha": self.lora_config.lora_alpha,
                "dropout": self.lora_config.lora_dropout
            }
        }
        
        with open(f"{adapter_path}/adapter_info.json", 'w') as f:
            json.dump(adapter_info, f, indent=2)
        
        return modelfile_path

def main():
    parser = argparse.ArgumentParser(description="Train GPT-OSS 20B with LoRA for privacy analysis")
    parser.add_argument("--dataset", type=str, default="lora-training-dataset-expanded.jsonl",
                       help="Path to training dataset")
    parser.add_argument("--output-dir", type=str, default="./gpt-oss-privacy-lora",
                       help="Output directory for model")
    parser.add_argument("--epochs", type=int, default=3,
                       help="Number of training epochs")
    parser.add_argument("--batch-size", type=int, default=4,
                       help="Training batch size")
    parser.add_argument("--learning-rate", type=float, default=2e-4,
                       help="Learning rate")
    parser.add_argument("--lora-r", type=int, default=64,
                       help="LoRA rank")
    parser.add_argument("--use-4bit", action="store_true",
                       help="Use 4-bit quantization instead of 8-bit")
    
    args = parser.parse_args()
    
    # Configure models
    model_config = ModelConfig(use_4bit=args.use_4bit, use_8bit=not args.use_4bit)
    lora_config = LoRAConfig(r=args.lora_r)
    training_config = TrainingConfig(
        output_dir=args.output_dir,
        num_epochs=args.epochs,
        batch_size=args.batch_size,
        learning_rate=args.learning_rate
    )
    
    # Initialize trainer
    trainer = GPTOSSLoRATrainer(model_config, lora_config, training_config)
    
    # Setup model and tokenizer
    trainer.setup_model_and_tokenizer()
    
    # Process dataset
    processor = PrivacyDatasetProcessor(trainer.tokenizer)
    raw_data = processor.load_dataset(args.dataset)
    dataset = processor.prepare_dataset(raw_data)
    
    # Tokenize datasets
    tokenized_train = dataset['train'].map(
        lambda x: processor.tokenize_function({"data": [x]}),
        batched=False,
        remove_columns=dataset['train'].column_names
    )
    
    tokenized_eval = dataset['test'].map(
        lambda x: processor.tokenize_function({"data": [x]}),
        batched=False,
        remove_columns=dataset['test'].column_names
    )
    
    # Train the model
    trainer.train(tokenized_train, tokenized_eval)
    
    # Create Ollama adapter
    adapter_path = f"{args.output_dir}/ollama-adapter"
    os.makedirs(adapter_path, exist_ok=True)
    modelfile_path = trainer.create_ollama_adapter(adapter_path)
    
    logger.info("Training complete!")
    logger.info(f"To use with Ollama, run:")
    logger.info(f"  ollama create fine-print-gpt-oss -f {modelfile_path}")
    logger.info(f"  ollama run fine-print-gpt-oss")

if __name__ == "__main__":
    main()