#!/usr/bin/env python3
"""
Quick comparison of Llama and Qwen models (smaller, faster models)
"""

import subprocess
import time
import logging
import json
from datetime import datetime

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s')
logger = logging.getLogger(__name__)

def test_model(model_name, test_prompts):
    """Test a model with multiple prompts"""
    results = {
        "model": model_name,
        "tests": [],
        "total_time": 0,
        "successful": 0,
        "failed": 0
    }
    
    logger.info(f"\n{'='*50}")
    logger.info(f"Testing: {model_name}")
    logger.info(f"{'='*50}")
    
    for i, prompt in enumerate(test_prompts, 1):
        logger.info(f"\nTest {i}: {prompt['name']}")
        
        start = time.time()
        try:
            result = subprocess.run(
                ['ollama', 'run', model_name, prompt['text']],
                capture_output=True,
                text=True,
                timeout=1800  # 30 minutes to allow all models to complete
            )
            
            elapsed = time.time() - start
            
            if result.returncode == 0:
                response = result.stdout
                
                # Analyze response
                has_score = any(f"{x}/100" in response or f"score: {x}" in response.lower() 
                              for x in range(0, 101))
                has_grade = any(g in response.upper() for g in ['GRADE: A', 'GRADE: B', 
                                                                'GRADE: C', 'GRADE: D', 'GRADE: F'])
                
                test_result = {
                    "test": prompt['name'],
                    "time": elapsed,
                    "has_score": has_score,
                    "has_grade": has_grade,
                    "response_preview": response[:150],
                    "success": True
                }
                
                results["tests"].append(test_result)
                results["successful"] += 1
                results["total_time"] += elapsed
                
                logger.info(f"  ✅ Success in {elapsed:.2f}s")
                if has_score:
                    logger.info(f"  ✓ Has risk score")
                if has_grade:
                    logger.info(f"  ✓ Has grade")
                
            else:
                results["tests"].append({
                    "test": prompt['name'],
                    "error": result.stderr[:100],
                    "success": False
                })
                results["failed"] += 1
                logger.error(f"  ❌ Failed: {result.stderr[:50]}")
                
        except subprocess.TimeoutExpired:
            results["tests"].append({
                "test": prompt['name'],
                "error": "Timeout",
                "success": False
            })
            results["failed"] += 1
            logger.error(f"  ❌ Timeout after 30 minutes")
        except Exception as e:
            results["tests"].append({
                "test": prompt['name'],
                "error": str(e)[:100],
                "success": False
            })
            results["failed"] += 1
            logger.error(f"  ❌ Error: {str(e)[:50]}")
    
    if results["successful"] > 0:
        results["avg_time"] = results["total_time"] / results["successful"]
    
    return results

def main():
    # Simple test prompts
    test_prompts = [
        {
            "name": "Simple Privacy Policy",
            "text": "Analyze this privacy policy: We collect user data and share it with partners. Risk score?"
        },
        {
            "name": "Terms with Issues",
            "text": "Analyze these terms: Users grant us perpetual license to content. Mandatory arbitration required. Grade?"
        },
        {
            "name": "App Analysis",
            "text": "Analyze app privacy: TikTok app collects location, contacts, camera access. No privacy policy. Risk score?"
        }
    ]
    
    # Models to test (including GPT-OSS with extended timeout)
    models = ["fine-print-llama", "fine-print-qwen-v2", "fine-print-gpt-oss"]
    
    logger.info("🚀 Comprehensive Model Comparison Test")
    logger.info("Testing all fine-tuned models with 30-minute timeout")
    
    all_results = []
    
    for model in models:
        # Check if model exists
        check = subprocess.run(['ollama', 'list'], capture_output=True, text=True)
        if model in check.stdout:
            results = test_model(model, test_prompts)
            all_results.append(results)
        else:
            logger.warning(f"⚠️ Model {model} not found")
    
    # Summary
    logger.info("\n" + "="*50)
    logger.info("📊 COMPARISON RESULTS")
    logger.info("="*50)
    
    for result in all_results:
        success_rate = (result["successful"] / len(test_prompts)) * 100
        logger.info(f"\n{result['model']}:")
        logger.info(f"  Success Rate: {success_rate:.0f}% ({result['successful']}/{len(test_prompts)})")
        logger.info(f"  Failed Tests: {result['failed']}")
        if result.get("avg_time"):
            logger.info(f"  Avg Response Time: {result['avg_time']:.2f}s")
    
    # Determine winner
    if all_results:
        # Sort by success rate, then by speed
        sorted_models = sorted(all_results, 
                             key=lambda x: (-x["successful"], x.get("avg_time", 999)))
        
        winner = sorted_models[0]
        logger.info(f"\n🏆 RECOMMENDED MODEL: {winner['model']}")
        logger.info(f"   Best success rate and performance")
    
    # Save results
    output = {
        "test_date": datetime.now().isoformat(),
        "results": all_results,
        "recommendation": winner['model'] if all_results else None
    }
    
    with open("quick-comparison-results.json", "w") as f:
        json.dump(output, f, indent=2)
    
    logger.info(f"\n💾 Results saved to quick-comparison-results.json")
    
    # Check GPT-OSS test status
    logger.info("\n📥 GPT-OSS Status:")
    try:
        with open("gpt-oss-test.log", "r") as f:
            lines = f.readlines()
            if lines:
                last_lines = "".join(lines[-3:])
                if "Success" in last_lines:
                    logger.info("  ✅ GPT-OSS test completed successfully")
                elif "Timeout" in last_lines or "Failed" in last_lines:
                    logger.info("  ❌ GPT-OSS test failed or timed out")
                    logger.info("  (Model too large for current system)")
                else:
                    logger.info("  ⏳ Still testing...")
    except:
        ps_check = subprocess.run(['ps', 'aux'], capture_output=True, text=True)
        if 'test-gpt-oss' in ps_check.stdout:
            logger.info("  ⏳ Still testing in background...")
        else:
            logger.info("  ❓ Status unknown")

if __name__ == "__main__":
    main()