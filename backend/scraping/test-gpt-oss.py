#!/usr/bin/env python3
"""
Test the already created GPT-OSS fine-tuned model
"""

import subprocess
import time
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s')
logger = logging.getLogger(__name__)

def test_gpt_oss():
    """Test the fine-tuned GPT-OSS model with extended timeout"""
    
    model_name = "fine-print-gpt-oss"
    
    # Simple test prompt
    test_prompt = """Analyze this privacy policy for risks: 
    We collect all user data including location, contacts, and browsing history. 
    This data is shared with third-party advertisers. 
    Users cannot opt out. 
    Provide risk score and grade."""
    
    logger.info(f"🧪 Testing {model_name} with 10-minute timeout...")
    logger.info("-" * 50)
    
    start = time.time()
    
    try:
        # Run with very long timeout for 20B model
        result = subprocess.run(
            ['ollama', 'run', model_name, test_prompt],
            capture_output=True,
            text=True,
            timeout=600  # 10 minutes
        )
        
        elapsed = time.time() - start
        
        if result.returncode == 0:
            response = result.stdout
            logger.info(f"✅ Success! Response time: {elapsed:.2f}s")
            logger.info(f"\nFull Response:\n{response}")
            
            # Check for key elements
            has_score = "score" in response.lower() or any(f"{x}/100" in response for x in range(0, 101))
            has_grade = any(grade in response.upper() for grade in ['A', 'B', 'C', 'D', 'F'])
            
            logger.info("\nAnalysis:")
            if has_score:
                logger.info("  ✓ Contains risk score")
            else:
                logger.info("  ✗ Missing risk score")
                
            if has_grade:
                logger.info("  ✓ Contains grade")
            else:
                logger.info("  ✗ Missing grade")
            
            return True
        else:
            logger.error(f"❌ Failed: {result.stderr}")
            return False
            
    except subprocess.TimeoutExpired:
        logger.error(f"❌ Timeout after 600 seconds (10 minutes)")
        logger.info("The 20B model may be too large for current system resources")
        return False
    except Exception as e:
        logger.error(f"❌ Error: {e}")
        return False

if __name__ == "__main__":
    success = test_gpt_oss()
    
    if success:
        logger.info("\n🎉 GPT-OSS 20B model is working!")
    else:
        logger.info("\n⚠️ GPT-OSS 20B model test failed")
        logger.info("Consider using the smaller Llama model for better performance")