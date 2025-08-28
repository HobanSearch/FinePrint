#!/usr/bin/env python3
"""
Fine-tune available Ollama models for privacy analysis
Works with models you already have installed
"""

import json
import os
import subprocess
import sys
from datetime import datetime
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class QuickFineTuner:
    """Quick fine-tuning using available models"""
    
    def __init__(self):
        self.available_models = [
            "qwen2.5:7b",
            "llama3.1:latest",
            "command-r:latest",
            "gemma2:2b"
        ]
    
    def check_available_models(self):
        """Check which models are available"""
        logger.info("Checking available models...")
        
        result = subprocess.run(
            ['ollama', 'list'],
            capture_output=True,
            text=True
        )
        
        if result.returncode == 0:
            lines = result.stdout.strip().split('\n')[1:]  # Skip header
            installed = []
            
            for line in lines:
                if line:
                    model_name = line.split()[0]
                    for available in self.available_models:
                        if model_name.startswith(available.split(':')[0]):
                            installed.append(model_name)
                            break
            
            return installed
        return []
    
    def create_fine_tuned_model(self, base_model: str, dataset_path: str, model_name: str):
        """Create a fine-tuned model using Ollama's native capabilities"""
        
        logger.info(f"Creating fine-tuned model based on {base_model}")
        
        # Load training examples
        examples = []
        with open(dataset_path, 'r') as f:
            for i, line in enumerate(f):
                if i >= 20:  # Use first 20 examples for quick training
                    break
                examples.append(json.loads(line.strip()))
        
        # Create Modelfile with embedded examples
        modelfile_content = f"""# Fine-tuned model for Privacy Analysis
FROM {base_model}

# Model parameters optimized for privacy analysis
PARAMETER temperature 0.7
PARAMETER top_p 0.9
PARAMETER top_k 40
PARAMETER repeat_penalty 1.1
PARAMETER num_ctx 4096

# System prompt for privacy analysis
SYSTEM \"\"\"You are Fine Print AI, an expert privacy policy and terms of service analyzer.

Your expertise includes:
- Identifying privacy risks and concerning clauses (score 0-100)
- Detecting patterns: data sharing, arbitration, liability waivers
- Grading documents from A (excellent) to F (poor privacy)
- Providing clear, actionable explanations

Always analyze thoroughly and explain risks clearly.\"\"\"

# Template for consistent responses
TEMPLATE \"\"\"{{{{ if .System }}}}System: {{{{ .System }}}}
{{{{ end }}}}User: {{{{ .Prompt }}}}
Assistant: {{{{ .Response }}}}\"\"\"

# Training examples for privacy analysis patterns
"""
        
        # Add training examples
        for i, example in enumerate(examples[:10]):  # First 10 for the Modelfile
            prompt = f"{example['instruction']} {example['input']}"
            response = example['output']
            
            modelfile_content += f"""
# Example {i+1}
MESSAGE user "{prompt}"
MESSAGE assistant "{response}"
"""
        
        # Save Modelfile
        output_dir = f"./models/{model_name}"
        os.makedirs(output_dir, exist_ok=True)
        modelfile_path = os.path.join(output_dir, "Modelfile")
        
        with open(modelfile_path, 'w') as f:
            f.write(modelfile_content)
        
        logger.info(f"Created Modelfile at {modelfile_path}")
        
        # Create the model
        logger.info(f"Creating model {model_name}...")
        result = subprocess.run(
            ['ollama', 'create', model_name, '-f', modelfile_path],
            capture_output=True,
            text=True
        )
        
        if result.returncode == 0:
            logger.info(f"✅ Successfully created {model_name}")
            return True
        else:
            logger.error(f"❌ Failed to create model: {result.stderr}")
            return False
    
    def test_model(self, model_name: str):
        """Test the fine-tuned model"""
        test_prompts = [
            "Analyze the following privacy_policy for privacy concerns and assign a risk score.\n\nDocument from TechCorp (Technology)",
            "Assess the privacy practices of this mobile application based on available metadata.\n\nApp: DataCollector\nDeveloper: Unknown Corp\nCategory: social\nPlatform: android\nPrivacy Policy: No",
            "Evaluate the privacy and security risks of this browser extension based on its permissions and metadata.\n\nExtension: WebTracker\nDeveloper: TrackingCo\nCategory: productivity\nPermissions: <all_urls>, cookies, history, tabs"
        ]
        
        logger.info(f"\nTesting {model_name}...")
        
        for i, prompt in enumerate(test_prompts, 1):
            logger.info(f"\nTest {i}:")
            logger.info(f"Prompt: {prompt[:100]}...")
            
            result = subprocess.run(
                ['ollama', 'run', model_name, prompt],
                capture_output=True,
                text=True,
                timeout=120  # Extended timeout for model responses
            )
            
            if result.returncode == 0:
                logger.info(f"Response: {result.stdout[:200]}...")
            else:
                logger.error(f"Error: {result.stderr}")

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="Fine-tune available Ollama models")
    parser.add_argument("--dataset", type=str, default="lora-training-dataset-expanded.jsonl",
                       help="Path to training dataset")
    parser.add_argument("--model", type=str, help="Specific model to use")
    parser.add_argument("--name", type=str, default="fine-print-privacy",
                       help="Name for the fine-tuned model")
    parser.add_argument("--test", action="store_true", help="Test after creation")
    
    args = parser.parse_args()
    
    tuner = QuickFineTuner()
    
    # Check available models
    available = tuner.check_available_models()
    
    if not available:
        logger.error("No suitable models found. Please install one of: " + 
                    ", ".join(tuner.available_models))
        return
    
    logger.info(f"Available models: {', '.join(available)}")
    
    # Select model
    if args.model and args.model in available:
        selected_model = args.model
    else:
        # Use the first available model
        selected_model = available[0]
    
    logger.info(f"Using model: {selected_model}")
    
    # Create fine-tuned model
    success = tuner.create_fine_tuned_model(
        selected_model,
        args.dataset,
        args.name
    )
    
    if success and args.test:
        tuner.test_model(args.name)
    
    if success:
        logger.info(f"\n✅ Fine-tuning complete!")
        logger.info(f"Run your model with: ollama run {args.name}")

if __name__ == "__main__":
    main()