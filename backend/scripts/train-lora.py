#!/usr/bin/env python3
"""
Fine Print AI - LoRA Fine-tuning Script
Uses Unsloth for efficient LoRA training on privacy policy analysis
"""

import os
import json
import torch
from datetime import datetime
from typing import Dict, List, Any
import argparse
from datasets import Dataset, DatasetDict
from transformers import TrainingArguments
from trl import SFTTrainer
from unsloth import FastLanguageModel
import wandb

def load_dataset(data_path: str) -> Dataset:
    """Load and format dataset for training"""
    with open(data_path, 'r') as f:
        data = json.load(f)
    
    # Format for training
    formatted_data = []
    for item in data:
        if isinstance(item, list):  # Conversational format
            # Convert to single string
            conversation = ""
            for msg in item:
                conversation += f"{msg['role']}: {msg['content']}\n\n"
            formatted_data.append({"text": conversation.strip()})
        else:  # Alpaca format
            text = f"### Instruction:\n{item['instruction']}\n\n"
            if item.get('input'):
                text += f"### Input:\n{item['input']}\n\n"
            text += f"### Response:\n{item['output']}"
            formatted_data.append({"text": text})
    
    return Dataset.from_list(formatted_data)

def train_lora_model(args):
    """Main training function"""
    
    print("🚀 Fine Print AI - LoRA Training")
    print("=" * 50)
    
    # Initialize wandb for experiment tracking
    if args.use_wandb:
        wandb.init(
            project="fineprintai-lora",
            name=f"{args.model_name}-{datetime.now().strftime('%Y%m%d-%H%M%S')}",
            config=vars(args)
        )
    
    # Load model and tokenizer
    print(f"\n📦 Loading base model: {args.base_model}")
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=args.base_model,
        max_seq_length=args.max_seq_length,
        dtype=torch.float16 if args.use_fp16 else torch.float32,
        load_in_4bit=args.use_4bit,
    )
    
    # Configure LoRA
    print(f"\n🔧 Configuring LoRA with rank={args.lora_rank}")
    model = FastLanguageModel.get_peft_model(
        model,
        r=args.lora_rank,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                       "gate_proj", "up_proj", "down_proj"],
        lora_alpha=args.lora_alpha,
        lora_dropout=args.lora_dropout,
        bias="none",
        use_gradient_checkpointing=True,
        random_state=3407,
        max_seq_length=args.max_seq_length,
    )
    
    # Load datasets
    print(f"\n📚 Loading training data from {args.data_dir}")
    train_dataset = load_dataset(os.path.join(args.data_dir, 'train.json'))
    val_dataset = None
    
    val_path = os.path.join(args.data_dir, 'validation.json')
    if os.path.exists(val_path):
        val_dataset = load_dataset(val_path)
        print(f"✅ Loaded {len(train_dataset)} training samples")
        print(f"✅ Loaded {len(val_dataset)} validation samples")
    else:
        print(f"✅ Loaded {len(train_dataset)} training samples")
        print("⚠️  No validation set found")
    
    # Training arguments
    output_dir = os.path.join(args.output_dir, args.model_name)
    training_args = TrainingArguments(
        output_dir=output_dir,
        num_train_epochs=args.num_epochs,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.gradient_accumulation_steps,
        warmup_steps=args.warmup_steps,
        learning_rate=args.learning_rate,
        fp16=args.use_fp16,
        logging_steps=args.logging_steps,
        save_strategy="epoch",
        evaluation_strategy="epoch" if val_dataset else "no",
        save_total_limit=3,
        load_best_model_at_end=True if val_dataset else False,
        report_to="wandb" if args.use_wandb else "none",
        run_name=args.model_name,
    )
    
    # Initialize trainer
    print(f"\n🏋️ Initializing trainer")
    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=train_dataset,
        eval_dataset=val_dataset,
        args=training_args,
        dataset_text_field="text",
        max_seq_length=args.max_seq_length,
        packing=False,
    )
    
    # Start training
    print(f"\n🔥 Starting training for {args.num_epochs} epochs")
    print(f"💾 Models will be saved to: {output_dir}")
    
    trainer.train()
    
    # Save final model
    print(f"\n💾 Saving final model")
    trainer.save_model()
    
    # Save LoRA adapter separately
    lora_dir = os.path.join(output_dir, "lora_adapter")
    model.save_pretrained(lora_dir)
    tokenizer.save_pretrained(lora_dir)
    
    # Save training metadata
    metadata = {
        "base_model": args.base_model,
        "model_name": args.model_name,
        "training_completed": datetime.now().isoformat(),
        "num_epochs": args.num_epochs,
        "lora_rank": args.lora_rank,
        "training_samples": len(train_dataset),
        "validation_samples": len(val_dataset) if val_dataset else 0,
        "final_loss": trainer.state.log_history[-1].get("loss", "N/A"),
        "dataset_type": args.dataset_type
    }
    
    with open(os.path.join(output_dir, "training_metadata.json"), "w") as f:
        json.dump(metadata, f, indent=2)
    
    print(f"\n✅ Training complete!")
    print(f"📁 Model saved to: {output_dir}")
    print(f"📊 Final loss: {metadata['final_loss']}")
    
    if args.use_wandb:
        wandb.finish()
    
    return output_dir

def main():
    parser = argparse.ArgumentParser(description='Fine-tune LoRA adapters for Fine Print AI')
    
    # Model arguments
    parser.add_argument('--base-model', default='unsloth/Phi-3-mini-4k-instruct', 
                       help='Base model to fine-tune')
    parser.add_argument('--model-name', required=True, 
                       help='Name for the fine-tuned model (e.g., privacy-analyzer-v1)')
    parser.add_argument('--max-seq-length', type=int, default=2048, 
                       help='Maximum sequence length')
    
    # Data arguments
    parser.add_argument('--data-dir', required=True, 
                       help='Directory containing train.json and validation.json')
    parser.add_argument('--dataset-type', default='general',
                       choices=['general', 'social_media', 'ecommerce', 'financial', 'streaming'],
                       help='Type of dataset being trained on')
    
    # LoRA arguments
    parser.add_argument('--lora-rank', type=int, default=16, 
                       help='LoRA rank (higher = more parameters)')
    parser.add_argument('--lora-alpha', type=int, default=16, 
                       help='LoRA alpha parameter')
    parser.add_argument('--lora-dropout', type=float, default=0.05, 
                       help='LoRA dropout rate')
    
    # Training arguments
    parser.add_argument('--num-epochs', type=int, default=3, 
                       help='Number of training epochs')
    parser.add_argument('--batch-size', type=int, default=4, 
                       help='Training batch size')
    parser.add_argument('--gradient-accumulation-steps', type=int, default=4, 
                       help='Gradient accumulation steps')
    parser.add_argument('--learning-rate', type=float, default=2e-4, 
                       help='Learning rate')
    parser.add_argument('--warmup-steps', type=int, default=100, 
                       help='Warmup steps')
    parser.add_argument('--logging-steps', type=int, default=25, 
                       help='Logging frequency')
    
    # Other arguments
    parser.add_argument('--output-dir', default='../models/lora', 
                       help='Output directory for models')
    parser.add_argument('--use-fp16', action='store_true', 
                       help='Use FP16 training')
    parser.add_argument('--use-4bit', action='store_true', 
                       help='Use 4-bit quantization')
    parser.add_argument('--use-wandb', action='store_true', 
                       help='Use Weights & Biases for tracking')
    
    args = parser.parse_args()
    
    # Create output directory
    os.makedirs(args.output_dir, exist_ok=True)
    
    # Train model
    output_path = train_lora_model(args)
    
    print("\n🎯 Next steps:")
    print(f"1. Test the model: python test-lora.py --model-path {output_path}")
    print(f"2. Deploy to LoRA service: cp -r {output_path} ../services/lora/models/")
    print(f"3. Update model registry with new adapter")

if __name__ == "__main__":
    main()