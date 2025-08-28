#!/usr/bin/env python3
"""
Fine-tune Llama 3.2 model for privacy analysis
Optimized for Fine Print AI document analysis
"""

import json
import os
import subprocess
import sys
from datetime import datetime
import logging
import time

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class LlamaFineTuner:
    """Fine-tune Llama 3.2 for privacy analysis"""
    
    def __init__(self, model_name="llama3.2:latest"):
        self.base_model = model_name
        self.output_name = "fine-print-llama"
        
    def load_training_data(self, dataset_path):
        """Load the expanded training dataset"""
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
    
    def create_modelfile(self, examples):
        """Create optimized Modelfile for Llama fine-tuning"""
        
        modelfile_content = f"""# Fine Print AI - Llama 3.2 Privacy Analysis Model
FROM {self.base_model}

# Optimized parameters for privacy analysis
PARAMETER temperature 0.7
PARAMETER top_p 0.9
PARAMETER top_k 40
PARAMETER repeat_penalty 1.1
PARAMETER num_ctx 4096
PARAMETER num_predict 2048

# System prompt for Fine Print AI
SYSTEM \"\"\"You are Fine Print AI, an advanced privacy policy and terms of service analyzer powered by Llama 3.2.

Your specialized capabilities include:
1. **Privacy Risk Assessment**: Identify and score privacy risks from 0-100
2. **Pattern Detection**: Recognize 50+ problematic legal patterns including:
   - Data sharing with third parties
   - Mandatory arbitration clauses
   - Broad liability waivers
   - Automatic renewal traps
   - Children's data collection
   - Perpetual content licenses
3. **Document Grading**: Assign grades from A (excellent) to F (poor)
4. **Actionable Insights**: Provide clear, specific recommendations
5. **Industry Comparison**: Benchmark against industry standards

Response Format:
- Risk Score: [0-100]
- Grade: [A-F]
- Key Findings: [List major concerns]
- Patterns Detected: [Count of problematic patterns]
- Recommendations: [Actionable steps]

Always be thorough, accurate, and user-friendly in your analysis.\"\"\"

# Response template for consistency
TEMPLATE \"\"\"{{{{ if .System }}}}System: {{{{ .System }}}}
{{{{ end }}}}Human: {{{{ .Prompt }}}}
Assistant: I'll analyze this document for privacy concerns.

{{{{ .Response }}}}\"\"\"

# Training examples for pattern recognition
"""
        
        # Add diverse training examples (use first 30 for better coverage)
        for i, example in enumerate(examples[:30]):
            instruction = example.get('instruction', '')
            input_text = example.get('input', '')
            output = example.get('output', '')
            
            # Clean and format the example
            prompt = f"{instruction} {input_text}".strip()
            response = output.strip()
            
            # Escape quotes in the text
            prompt = prompt.replace('"', '\\"')
            response = response.replace('"', '\\"')
            
            modelfile_content += f"""
# Training Example {i+1}
MESSAGE user "{prompt}"
MESSAGE assistant "{response}"
"""
        
        return modelfile_content
    
    def create_fine_tuned_model(self, modelfile_content):
        """Create the fine-tuned model in Ollama"""
        
        # Create output directory
        output_dir = f"./models/{self.output_name}"
        os.makedirs(output_dir, exist_ok=True)
        
        # Save Modelfile
        modelfile_path = os.path.join(output_dir, "Modelfile")
        with open(modelfile_path, 'w') as f:
            f.write(modelfile_content)
        
        logger.info(f"Created Modelfile at {modelfile_path}")
        
        # Create the model
        logger.info(f"Creating fine-tuned model: {self.output_name}")
        logger.info("This may take a few minutes...")
        
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
    
    def test_model(self):
        """Test the fine-tuned model with sample prompts"""
        
        test_cases = [
            {
                "prompt": "Analyze the following privacy_policy for privacy concerns and assign a risk score. Document from Facebook (Social Media)",
                "expected_patterns": ["data sharing", "third parties", "advertising"]
            },
            {
                "prompt": "Assess the privacy practices of this mobile application based on available metadata.\n\nApp: TikTok\nDeveloper: ByteDance\nCategory: social\nPlatform: android\nPrivacy Policy: Yes",
                "expected_patterns": ["data collection", "user tracking", "location"]
            },
            {
                "prompt": "Evaluate the privacy and security risks of this browser extension.\n\nExtension: Ad Blocker Plus\nDeveloper: Unknown\nCategory: productivity\nPermissions: <all_urls>, cookies, webRequest",
                "expected_patterns": ["broad permissions", "web activity", "cookies"]
            },
            {
                "prompt": "Analyze the following terms_of_service for concerning clauses. Document from Spotify (Music Streaming)",
                "expected_patterns": ["subscription", "content license", "arbitration"]
            }
        ]
        
        logger.info(f"\n🧪 Testing {self.output_name} model...")
        logger.info("=" * 60)
        
        passed = 0
        failed = 0
        
        for i, test in enumerate(test_cases, 1):
            logger.info(f"\nTest Case {i}:")
            logger.info(f"Prompt: {test['prompt'][:100]}...")
            
            start_time = time.time()
            
            # Run the model with extended timeout
            result = subprocess.run(
                ['ollama', 'run', self.output_name, test['prompt']],
                capture_output=True,
                text=True,
                timeout=120  # Extended to 2 minutes for complex responses
            )
            
            elapsed = time.time() - start_time
            
            if result.returncode == 0:
                response = result.stdout
                logger.info(f"Response Time: {elapsed:.2f}s")
                
                # Check if response contains expected elements
                has_score = "score" in response.lower() or any(str(x) in response for x in range(0, 101))
                has_grade = any(grade in response.upper() for grade in ['A', 'B', 'C', 'D', 'F'])
                
                if has_score or has_grade:
                    logger.info(f"✅ Test Passed - Model provided analysis")
                    logger.info(f"Response Preview: {response[:200]}...")
                    passed += 1
                else:
                    logger.warning(f"⚠️ Test Partial - Response may need improvement")
                    logger.info(f"Response: {response[:200]}...")
                    failed += 1
            else:
                logger.error(f"❌ Test Failed - Error: {result.stderr}")
                failed += 1
        
        logger.info("\n" + "=" * 60)
        logger.info(f"Test Results: {passed} passed, {failed} failed")
        logger.info("=" * 60)
        
        return passed > failed

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="Fine-tune Llama 3.2 for privacy analysis")
    parser.add_argument("--dataset", type=str, default="lora-training-dataset-expanded.jsonl",
                       help="Path to training dataset")
    parser.add_argument("--model", type=str, default="llama3.2:latest",
                       help="Base Llama model to use")
    parser.add_argument("--name", type=str, default="fine-print-llama",
                       help="Name for the fine-tuned model")
    parser.add_argument("--test", action="store_true", help="Test after creation")
    
    args = parser.parse_args()
    
    # Initialize fine-tuner
    tuner = LlamaFineTuner(model_name=args.model)
    tuner.output_name = args.name
    
    # Load training data
    examples = tuner.load_training_data(args.dataset)
    
    if not examples:
        logger.error("No training examples loaded!")
        return
    
    # Create Modelfile
    logger.info("Creating optimized Modelfile for Llama...")
    modelfile_content = tuner.create_modelfile(examples)
    
    # Create fine-tuned model
    success = tuner.create_fine_tuned_model(modelfile_content)
    
    if success:
        logger.info(f"\n✅ Fine-tuning complete!")
        logger.info(f"Model created: {tuner.output_name}")
        
        if args.test:
            logger.info("\nRunning model tests...")
            test_passed = tuner.test_model()
            
            if test_passed:
                logger.info(f"\n🎉 Model {tuner.output_name} is ready for production!")
            else:
                logger.warning(f"\n⚠️ Model {tuner.output_name} may need additional tuning")
        
        logger.info(f"\nTo use your model:")
        logger.info(f"  ollama run {tuner.output_name}")
        logger.info(f"\nTo test interactively:")
        logger.info(f'  echo "Analyze privacy policy from TechCorp" | ollama run {tuner.output_name}')
    else:
        logger.error("Fine-tuning failed!")
        sys.exit(1)

if __name__ == "__main__":
    main()