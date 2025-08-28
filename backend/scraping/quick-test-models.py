#!/usr/bin/env python3
"""
Quick test script to verify fine-tuned models are working
"""

import subprocess
import time
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s')
logger = logging.getLogger(__name__)

def test_model(model_name, test_prompt):
    """Quick test of a model"""
    logger.info(f"\nTesting {model_name}...")
    logger.info("-" * 40)
    
    start = time.time()
    try:
        result = subprocess.run(
            ['ollama', 'run', model_name, test_prompt],
            capture_output=True,
            text=True,
            timeout=120  # 2 minute timeout
        )
        
        elapsed = time.time() - start
        
        if result.returncode == 0:
            response = result.stdout
            logger.info(f"✅ Success! Response time: {elapsed:.2f}s")
            logger.info(f"Response preview: {response[:300]}...")
            
            # Check for key elements
            has_score = "score" in response.lower() or any(f"{x}/100" in response for x in range(0, 101))
            has_grade = any(grade in response.upper() for grade in ['A', 'B', 'C', 'D', 'F'])
            
            if has_score:
                logger.info("  ✓ Contains risk score")
            if has_grade:
                logger.info("  ✓ Contains grade")
            
            return True
        else:
            logger.error(f"❌ Failed: {result.stderr}")
            return False
            
    except subprocess.TimeoutExpired:
        logger.error(f"❌ Timeout after 120 seconds")
        return False
    except Exception as e:
        logger.error(f"❌ Error: {e}")
        return False

def main():
    # Simple test prompt
    test_prompt = """Analyze the following privacy_policy for privacy concerns and assign a risk score.

Document from TechCorp (Technology)

We collect user data including location, contacts, and browsing history. This data is shared with our partners for advertising purposes. Users cannot opt out of data collection. We reserve the right to change these terms at any time without notice."""
    
    models_to_test = [
        "fine-print-privacy-qwen",
        "fine-print-llama"
    ]
    
    logger.info("🧪 Quick Model Test")
    logger.info("=" * 50)
    
    results = {}
    for model in models_to_test:
        # Check if model exists
        check = subprocess.run(['ollama', 'list'], capture_output=True, text=True)
        if model in check.stdout:
            results[model] = test_model(model, test_prompt)
        else:
            logger.warning(f"⚠️ Model {model} not found")
            results[model] = False
    
    # Summary
    logger.info("\n" + "=" * 50)
    logger.info("📊 Test Summary:")
    for model, passed in results.items():
        status = "✅ WORKING" if passed else "❌ FAILED"
        logger.info(f"  {model}: {status}")
    
    # Check GPT-OSS download status
    logger.info("\n📥 GPT-OSS Download Status:")
    check_gpt = subprocess.run(['ps', 'aux'], capture_output=True, text=True)
    if 'ollama pull gpt-oss' in check_gpt.stdout:
        logger.info("  ⏳ Still downloading...")
        
        # Check log file
        try:
            with open('gpt-oss-download.log', 'r') as f:
                lines = f.readlines()
                if lines:
                    last_line = lines[-1].strip()
                    if 'pulling' in last_line.lower():
                        logger.info(f"  Progress: {last_line[:100]}")
        except:
            pass
    else:
        # Check if completed
        check = subprocess.run(['ollama', 'list'], capture_output=True, text=True)
        if 'gpt-oss' in check.stdout:
            logger.info("  ✅ Download complete!")
        else:
            logger.info("  ❌ Not downloaded or download failed")

if __name__ == "__main__":
    main()