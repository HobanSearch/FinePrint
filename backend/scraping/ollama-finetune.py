#!/usr/bin/env python3
"""
Ollama Fine-tuning Script for GPT-OSS 20B
Uses Ollama's native fine-tuning capabilities
"""

import json
import os
import subprocess
import time
from pathlib import Path
from typing import Dict, List
import requests
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class OllamaFineTuner:
    """Fine-tune models using Ollama"""
    
    def __init__(self, base_model: str = "gpt-oss:20b"):
        self.base_model = base_model
        self.ollama_url = "http://localhost:11434"
        
    def check_ollama_status(self) -> bool:
        """Check if Ollama is running"""
        try:
            response = requests.get(f"{self.ollama_url}/api/tags")
            return response.status_code == 200
        except:
            return False
    
    def pull_model(self) -> bool:
        """Pull the base model if not available"""
        logger.info(f"Checking if {self.base_model} is available...")
        
        try:
            # Check if model exists
            response = requests.get(f"{self.ollama_url}/api/tags")
            models = response.json().get('models', [])
            
            if not any(model['name'] == self.base_model for model in models):
                logger.info(f"Pulling {self.base_model}...")
                result = subprocess.run(
                    ['ollama', 'pull', self.base_model],
                    capture_output=True,
                    text=True
                )
                
                if result.returncode != 0:
                    logger.error(f"Failed to pull model: {result.stderr}")
                    return False
                    
            logger.info(f"Model {self.base_model} is ready")
            return True
            
        except Exception as e:
            logger.error(f"Error checking/pulling model: {e}")
            return False
    
    def prepare_training_data(self, jsonl_path: str) -> str:
        """Convert JSONL to Ollama training format"""
        logger.info("Preparing training data...")
        
        training_examples = []
        with open(jsonl_path, 'r') as f:
            for line in f:
                data = json.loads(line.strip())
                
                # Format for Ollama fine-tuning
                example = {
                    "prompt": f"{data['instruction']}\n\n{data['input']}",
                    "completion": data['output']
                }
                training_examples.append(example)
        
        # Save in Ollama format
        output_path = jsonl_path.replace('.jsonl', '-ollama.json')
        with open(output_path, 'w') as f:
            json.dump({"examples": training_examples}, f, indent=2)
        
        logger.info(f"Prepared {len(training_examples)} training examples")
        return output_path
    
    def create_modelfile(self, training_data_path: str, output_dir: str) -> str:
        """Create Modelfile for fine-tuning"""
        modelfile_content = f"""# Fine-tuned GPT-OSS for Privacy Analysis
FROM {self.base_model}

# Training data
PARAMETER training_data {training_data_path}

# Model parameters
PARAMETER temperature 0.7
PARAMETER top_p 0.9
PARAMETER top_k 40
PARAMETER num_predict 2048
PARAMETER stop "### Instruction:"
PARAMETER stop "### Input:"

# System prompt
SYSTEM \"\"\"You are Fine Print AI, an advanced privacy policy analyzer. You excel at:
1. Identifying privacy risks and concerning clauses in legal documents
2. Assigning accurate risk scores (0-100) based on privacy implications
3. Detecting patterns like data sharing, arbitration clauses, and liability waivers
4. Providing clear, actionable explanations for users
5. Grading documents from A (excellent privacy) to F (poor privacy)

Always be thorough, accurate, and user-friendly in your analysis.\"\"\"

# Response template
TEMPLATE \"\"\"### Instruction:
{{{{ .Prompt }}}}

### Response:
{{{{ .Response }}}}\"\"\"
"""
        
        modelfile_path = os.path.join(output_dir, "Modelfile")
        os.makedirs(output_dir, exist_ok=True)
        
        with open(modelfile_path, 'w') as f:
            f.write(modelfile_content)
        
        logger.info(f"Created Modelfile at {modelfile_path}")
        return modelfile_path
    
    def create_adapter_model(self, output_dir: str) -> str:
        """Create a LoRA adapter Modelfile"""
        adapter_content = f"""# LoRA Adapter for Privacy Analysis
FROM {self.base_model}

# This creates a LoRA adapter layer
ADAPTER ./lora-adapter

# Adapter parameters
PARAMETER adapter_type lora
PARAMETER lora_rank 64
PARAMETER lora_alpha 128
PARAMETER lora_dropout 0.1

# Target modules for GPT-OSS architecture
PARAMETER lora_targets query_key_value,dense,dense_h_to_4h,dense_4h_to_h

# Training parameters
PARAMETER learning_rate 2e-4
PARAMETER batch_size 4
PARAMETER gradient_accumulation_steps 4
PARAMETER num_epochs 3
PARAMETER warmup_ratio 0.03

# Model behavior
PARAMETER temperature 0.7
PARAMETER top_p 0.9
PARAMETER max_tokens 2048

SYSTEM \"\"\"You are Fine Print AI, specialized in analyzing privacy policies and terms of service.
Focus on identifying privacy risks, data collection practices, and user rights.\"\"\"
"""
        
        adapter_path = os.path.join(output_dir, "Modelfile.adapter")
        with open(adapter_path, 'w') as f:
            f.write(adapter_content)
        
        return adapter_path
    
    def fine_tune_with_examples(self, jsonl_path: str, model_name: str = "fine-print-gpt-oss"):
        """Fine-tune using example-based approach"""
        logger.info("Starting fine-tuning process...")
        
        # Prepare output directory
        output_dir = f"./fine-tuned-{model_name}"
        os.makedirs(output_dir, exist_ok=True)
        
        # Load and format examples
        examples = []
        with open(jsonl_path, 'r') as f:
            for i, line in enumerate(f):
                if i >= 50:  # Limit examples for initial training
                    break
                data = json.loads(line.strip())
                examples.append(data)
        
        # Create a prompt-based Modelfile with examples
        modelfile_content = f"""FROM {self.base_model}

# Fine-tuning for privacy analysis
PARAMETER temperature 0.7
PARAMETER top_p 0.9
PARAMETER num_ctx 4096

SYSTEM \"\"\"You are Fine Print AI, an expert privacy policy analyzer trained on extensive examples of document analysis.\"\"\"

# Training examples embedded in the model
"""
        
        # Add a few examples directly to the Modelfile
        for i, example in enumerate(examples[:5]):
            modelfile_content += f"""
# Example {i+1}
MESSAGE user {json.dumps(example['instruction'] + ' ' + example['input'])}
MESSAGE assistant {json.dumps(example['output'])}
"""
        
        modelfile_path = os.path.join(output_dir, "Modelfile")
        with open(modelfile_path, 'w') as f:
            f.write(modelfile_content)
        
        # Create the fine-tuned model
        logger.info(f"Creating fine-tuned model: {model_name}")
        result = subprocess.run(
            ['ollama', 'create', model_name, '-f', modelfile_path],
            capture_output=True,
            text=True
        )
        
        if result.returncode == 0:
            logger.info(f"Successfully created model: {model_name}")
            logger.info("To test the model, run:")
            logger.info(f"  ollama run {model_name}")
        else:
            logger.error(f"Failed to create model: {result.stderr}")
        
        return model_name
    
    def test_model(self, model_name: str, test_prompt: str):
        """Test the fine-tuned model"""
        logger.info(f"Testing model {model_name}...")
        
        try:
            response = requests.post(
                f"{self.ollama_url}/api/generate",
                json={
                    "model": model_name,
                    "prompt": test_prompt,
                    "stream": False
                }
            )
            
            if response.status_code == 200:
                result = response.json()
                logger.info("Model response:")
                print(result.get('response', 'No response'))
            else:
                logger.error(f"Failed to get response: {response.status_code}")
                
        except Exception as e:
            logger.error(f"Error testing model: {e}")

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="Fine-tune GPT-OSS with Ollama")
    parser.add_argument("--dataset", type=str, default="lora-training-dataset-expanded.jsonl",
                       help="Path to training dataset")
    parser.add_argument("--model-name", type=str, default="fine-print-gpt-oss",
                       help="Name for the fine-tuned model")
    parser.add_argument("--base-model", type=str, default="gpt-oss:20b",
                       help="Base model to fine-tune")
    parser.add_argument("--test", action="store_true",
                       help="Test the model after training")
    
    args = parser.parse_args()
    
    # Initialize fine-tuner
    tuner = OllamaFineTuner(base_model=args.base_model)
    
    # Check Ollama status
    if not tuner.check_ollama_status():
        logger.error("Ollama is not running. Please start Ollama first.")
        return
    
    # Fine-tune the model
    model_name = tuner.fine_tune_with_examples(args.dataset, args.model_name)
    
    # Test if requested
    if args.test:
        test_prompt = """Analyze the following privacy_policy for privacy concerns and assign a risk score.

Document from Example Corp (Technology)"""
        
        tuner.test_model(model_name, test_prompt)
    
    logger.info("Fine-tuning complete!")
    logger.info(f"Run your model with: ollama run {model_name}")

if __name__ == "__main__":
    main()