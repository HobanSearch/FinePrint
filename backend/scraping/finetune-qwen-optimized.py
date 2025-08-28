#!/usr/bin/env python3
"""
Optimized Qwen 2.5 7B fine-tuning for privacy analysis
Fixes timeout issues with better configuration
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

class QwenOptimizedFineTuner:
    """Optimized fine-tuning for Qwen 2.5"""
    
    def __init__(self):
        self.base_model = "qwen2.5:7b"
        self.output_name = "fine-print-qwen-v2"
        
    def load_training_data(self, dataset_path):
        """Load training dataset"""
        logger.info(f"Loading training data from {dataset_path}")
        
        examples = []
        with open(dataset_path, 'r') as f:
            for line in f:
                try:
                    examples.append(json.loads(line.strip()))
                except json.JSONDecodeError:
                    continue
        
        logger.info(f"Loaded {len(examples)} training examples")
        return examples
    
    def create_optimized_modelfile(self, examples):
        """Create optimized Modelfile for Qwen with performance improvements"""
        
        modelfile_content = f"""# Fine Print AI - Qwen 2.5 7B Optimized Privacy Analysis
FROM {self.base_model}

# Optimized parameters for faster response and better accuracy
PARAMETER temperature 0.7
PARAMETER top_p 0.9
PARAMETER top_k 40
PARAMETER repeat_penalty 1.1
PARAMETER num_ctx 2048
PARAMETER num_predict 1024
PARAMETER num_thread 8
PARAMETER num_gpu 1
PARAMETER f16_kv true

# Focused system prompt
SYSTEM \"\"\"You are Fine Print AI, specialized in analyzing privacy policies and terms of service.

RESPONSE FORMAT (be concise):
Risk Score: [0-100]/100
Grade: [A-F]
Key Issues: [List 3-5 main concerns]
Patterns: [Count]

Be direct and efficient. Focus on critical privacy issues only.\"\"\"

# Simplified template
TEMPLATE \"\"\"User: {{{{ .Prompt }}}}
Assistant: {{{{ .Response }}}}\"\"\"

# Training examples - using fewer but higher quality examples
"""
        
        # Select diverse, high-quality examples (15 instead of 30)
        selected_examples = []
        categories = {}
        
        for example in examples:
            instruction = example.get('instruction', '')
            
            # Categorize examples
            if 'privacy_policy' in instruction:
                cat = 'privacy'
            elif 'terms_of_service' in instruction:
                cat = 'terms'
            elif 'mobile' in instruction.lower() or 'app' in instruction.lower():
                cat = 'mobile'
            elif 'extension' in instruction.lower():
                cat = 'extension'
            else:
                cat = 'other'
            
            if cat not in categories:
                categories[cat] = []
            categories[cat].append(example)
        
        # Select balanced examples
        for cat, exs in categories.items():
            if exs:
                selected_examples.extend(exs[:3])  # Take up to 3 from each category
        
        # Add the examples to modelfile
        for i, example in enumerate(selected_examples[:15]):
            instruction = example.get('instruction', '')
            input_text = example.get('input', '')
            output = example.get('output', '')
            
            # Create concise prompt and response
            prompt = f"{instruction} {input_text}".strip()[:200]  # Limit prompt length
            response = output.strip()[:300]  # Limit response length
            
            # Escape quotes
            prompt = prompt.replace('"', '\\"').replace('\n', ' ')
            response = response.replace('"', '\\"').replace('\n', ' ')
            
            modelfile_content += f"""
# Example {i+1}
MESSAGE user "{prompt}"
MESSAGE assistant "{response}"
"""
        
        return modelfile_content
    
    def create_model(self, modelfile_content):
        """Create the optimized model"""
        
        # Create output directory
        output_dir = f"./models/{self.output_name}"
        os.makedirs(output_dir, exist_ok=True)
        
        # Save Modelfile
        modelfile_path = os.path.join(output_dir, "Modelfile")
        with open(modelfile_path, 'w') as f:
            f.write(modelfile_content)
        
        logger.info(f"Created optimized Modelfile at {modelfile_path}")
        
        # Remove old version if exists
        logger.info("Removing old Qwen model if exists...")
        subprocess.run(['ollama', 'rm', 'fine-print-privacy-qwen'], capture_output=True)
        
        # Create new optimized model
        logger.info(f"Creating optimized model: {self.output_name}")
        
        result = subprocess.run(
            ['ollama', 'create', self.output_name, '-f', modelfile_path],
            capture_output=True,
            text=True
        )
        
        if result.returncode == 0:
            logger.info(f"✅ Successfully created {self.output_name}")
            return True
        else:
            logger.error(f"❌ Failed to create model: {result.stderr}")
            return False
    
    def quick_test(self):
        """Quick performance test"""
        logger.info("\n🚀 Quick Performance Test")
        logger.info("-" * 40)
        
        test_prompt = "Analyze this privacy policy for risks: We collect all user data and share it with partners. Score it."
        
        import time
        start = time.time()
        
        try:
            result = subprocess.run(
                ['ollama', 'run', self.output_name, test_prompt],
                capture_output=True,
                text=True,
                timeout=60  # 1 minute timeout for quick test
            )
            
            elapsed = time.time() - start
            
            if result.returncode == 0:
                logger.info(f"✅ Response time: {elapsed:.2f}s")
                logger.info(f"Response: {result.stdout[:200]}...")
                return elapsed < 30  # Should respond in under 30 seconds
            else:
                logger.error(f"❌ Test failed: {result.stderr}")
                return False
                
        except subprocess.TimeoutExpired:
            logger.error("❌ Test timed out after 60 seconds")
            return False

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="Optimized Qwen fine-tuning")
    parser.add_argument("--dataset", type=str, default="lora-training-dataset-expanded.jsonl",
                       help="Path to training dataset")
    parser.add_argument("--test", action="store_true", help="Run quick test after creation")
    
    args = parser.parse_args()
    
    tuner = QwenOptimizedFineTuner()
    
    # Load training data
    examples = tuner.load_training_data(args.dataset)
    
    if not examples:
        logger.error("No training examples loaded!")
        return
    
    # Create optimized modelfile
    logger.info("Creating optimized Modelfile...")
    modelfile_content = tuner.create_optimized_modelfile(examples)
    
    # Create model
    success = tuner.create_model(modelfile_content)
    
    if success:
        logger.info(f"\n✅ Optimized model created: {tuner.output_name}")
        
        if args.test:
            if tuner.quick_test():
                logger.info(f"\n🎉 {tuner.output_name} is optimized and ready!")
            else:
                logger.warning(f"\n⚠️ {tuner.output_name} may still have performance issues")
        
        logger.info(f"\nTo use: ollama run {tuner.output_name}")
    else:
        logger.error("Model creation failed!")
        sys.exit(1)

if __name__ == "__main__":
    main()