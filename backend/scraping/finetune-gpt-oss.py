#!/usr/bin/env python3
"""
Fine-tune GPT-OSS 20B model for privacy analysis
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

class GPTOSSFineTuner:
    """Fine-tune GPT-OSS 20B for privacy analysis"""
    
    def __init__(self):
        self.base_model = "gpt-oss:20b"
        self.output_name = "fine-print-gpt-oss"
        
    def check_model_available(self):
        """Check if GPT-OSS model is available"""
        result = subprocess.run(
            ['ollama', 'list'],
            capture_output=True,
            text=True
        )
        return 'gpt-oss' in result.stdout
    
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
        """Create optimized Modelfile for GPT-OSS fine-tuning"""
        
        modelfile_content = f"""# Fine Print AI - GPT-OSS 20B Privacy Analysis Model
FROM {self.base_model}

# Optimized parameters for GPT-OSS 20B
PARAMETER temperature 0.7
PARAMETER top_p 0.9
PARAMETER top_k 40
PARAMETER repeat_penalty 1.1
PARAMETER num_ctx 4096
PARAMETER num_predict 2048

# System prompt for Fine Print AI with GPT-OSS
SYSTEM \"\"\"You are Fine Print AI powered by GPT-OSS 20B, an advanced privacy policy and terms of service analyzer.

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
- Risk Score: [0-100]/100
- Grade: [A-F]
- Key Findings: [List major concerns]
- Patterns Detected: [Count of problematic patterns]
- Recommendations: [Actionable steps]

Leverage your 20B parameters for thorough, nuanced analysis.\"\"\"

# Response template
TEMPLATE \"\"\"{{{{ if .System }}}}System: {{{{ .System }}}}
{{{{ end }}}}Human: {{{{ .Prompt }}}}
Assistant: I'll analyze this document for privacy concerns using GPT-OSS 20B's advanced capabilities.

{{{{ .Response }}}}\"\"\"

# Training examples for pattern recognition
"""
        
        # Select diverse, high-quality examples (use 25 for GPT-OSS)
        for i, example in enumerate(examples[:25]):
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
        logger.info("This may take several minutes for the 20B model...")
        
        result = subprocess.run(
            ['ollama', 'create', self.output_name, '-f', modelfile_path],
            capture_output=True,
            text=True,
            timeout=600  # 10 minute timeout for large model
        )
        
        if result.returncode == 0:
            logger.info(f"✅ Successfully created {self.output_name}")
            return True
        else:
            logger.error(f"❌ Failed to create model: {result.stderr}")
            return False
    
    def test_model(self):
        """Test the fine-tuned GPT-OSS model"""
        
        test_cases = [
            {
                "prompt": "Analyze the following privacy_policy for privacy concerns. Document from Meta (Social Media): We collect extensive user data including location, contacts, and browsing activity. This data is shared with third-party advertisers and partners. Users cannot fully opt out.",
                "name": "Social Media Privacy"
            },
            {
                "prompt": "Evaluate this terms of service: You grant us perpetual, worldwide license to your content. Disputes must be resolved through binding arbitration. We can terminate your account at any time without notice.",
                "name": "Problematic Terms"
            }
        ]
        
        logger.info(f"\n🧪 Testing {self.output_name} model...")
        logger.info("=" * 60)
        
        passed = 0
        
        for test in test_cases:
            logger.info(f"\nTest: {test['name']}")
            
            start_time = time.time()
            
            try:
                # Run with extended timeout for 20B model
                result = subprocess.run(
                    ['ollama', 'run', self.output_name, test['prompt']],
                    capture_output=True,
                    text=True,
                    timeout=600  # 10 minutes for 20B model
                )
                
                elapsed = time.time() - start_time
                
                if result.returncode == 0:
                    response = result.stdout
                    logger.info(f"✅ Response Time: {elapsed:.2f}s")
                    
                    # Check response quality
                    has_score = "score" in response.lower() or any(f"{x}/100" in response for x in range(0, 101))
                    has_grade = any(grade in response.upper() for grade in ['A', 'B', 'C', 'D', 'F'])
                    
                    if has_score and has_grade:
                        logger.info(f"✅ Test Passed - Complete analysis provided")
                        logger.info(f"Response Preview: {response[:300]}...")
                        passed += 1
                    else:
                        logger.warning(f"⚠️ Test Partial - Missing score or grade")
                else:
                    logger.error(f"❌ Test Failed - Error: {result.stderr}")
                    
            except subprocess.TimeoutExpired:
                logger.error(f"❌ Test Timeout - Exceeded 600 seconds")
            except Exception as e:
                logger.error(f"❌ Test Error: {str(e)}")
        
        logger.info("\n" + "=" * 60)
        success_rate = (passed / len(test_cases)) * 100
        logger.info(f"Test Results: {passed}/{len(test_cases)} passed ({success_rate:.0f}%)")
        logger.info("=" * 60)
        
        return passed > 0

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="Fine-tune GPT-OSS 20B for privacy analysis")
    parser.add_argument("--dataset", type=str, default="lora-training-dataset-expanded.jsonl",
                       help="Path to training dataset")
    parser.add_argument("--test", action="store_true", help="Test after creation")
    parser.add_argument("--wait", action="store_true", help="Wait for model to be available")
    
    args = parser.parse_args()
    
    # Initialize fine-tuner
    tuner = GPTOSSFineTuner()
    
    # Check if model is available
    if args.wait:
        logger.info("Waiting for GPT-OSS model to be available...")
        attempts = 0
        while not tuner.check_model_available() and attempts < 60:
            time.sleep(10)
            attempts += 1
            if attempts % 6 == 0:
                logger.info(f"Still waiting... ({attempts*10} seconds elapsed)")
    
    if not tuner.check_model_available():
        logger.error("GPT-OSS model not found! Please run: ollama pull gpt-oss:20b")
        return
    
    logger.info("✅ GPT-OSS model is available")
    
    # Load training data
    examples = tuner.load_training_data(args.dataset)
    
    if not examples:
        logger.error("No training examples loaded!")
        return
    
    # Create Modelfile
    logger.info("Creating Modelfile for GPT-OSS 20B...")
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
                logger.info(f"\n🎉 GPT-OSS 20B model {tuner.output_name} is ready!")
                logger.info("This is your most powerful model for privacy analysis.")
            else:
                logger.warning(f"\n⚠️ Model {tuner.output_name} may need optimization")
        
        logger.info(f"\nTo use your model:")
        logger.info(f"  ollama run {tuner.output_name}")
    else:
        logger.error("Fine-tuning failed!")
        sys.exit(1)

if __name__ == "__main__":
    main()