#!/usr/bin/env python3
"""
Comprehensive model testing and comparison script
Tests Qwen, Llama, and GPT-OSS models for privacy analysis
"""

import json
import subprocess
import time
import logging
from datetime import datetime
from typing import Dict, List, Tuple
import statistics

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class ModelTester:
    """Test and compare different fine-tuned models"""
    
    def __init__(self):
        self.models = [
            "fine-print-privacy-qwen",
            "fine-print-llama"
        ]
        self.results = {}
        
    def check_available_models(self):
        """Check which models are actually available"""
        logger.info("Checking available models...")
        
        result = subprocess.run(
            ['ollama', 'list'],
            capture_output=True,
            text=True
        )
        
        if result.returncode == 0:
            available = []
            lines = result.stdout.strip().split('\n')[1:]  # Skip header
            
            for line in lines:
                if line:
                    model_name = line.split()[0].split(':')[0]
                    if model_name in self.models or model_name.startswith('fine-print'):
                        available.append(model_name)
            
            # Check for GPT-OSS if it's been downloaded
            if 'gpt-oss' in result.stdout.lower():
                self.models.append("gpt-oss:20b")
                available.append("gpt-oss:20b")
            
            return available
        return []
    
    def create_test_suite(self):
        """Create comprehensive test cases"""
        return [
            {
                "id": "privacy_policy_tech",
                "prompt": "Analyze the following privacy_policy for privacy concerns and assign a risk score.\n\nDocument from Google (Technology)\n\nWe collect information to provide better services to all our users. The information we collect includes device information, log information, location information, unique application numbers, local storage, and cookies. We may combine information from our services and across your devices. We share information with our affiliates and trusted businesses or persons to process it for us.",
                "category": "Privacy Policy",
                "expected_patterns": ["data collection", "information sharing", "third parties"],
                "difficulty": "medium"
            },
            {
                "id": "terms_service_social",
                "prompt": "Analyze the following terms_of_service for concerning clauses.\n\nDocument from SocialApp (Social Media)\n\nBy using our service you grant us a worldwide, non-exclusive, royalty-free license to use, copy, reproduce, process, adapt, modify, publish, transmit, display and distribute your content. You waive any moral rights in your content. We may terminate your account at any time for any reason without notice. You agree to binding arbitration and waive your right to class action lawsuits.",
                "category": "Terms of Service",
                "expected_patterns": ["content license", "arbitration", "termination", "moral rights waiver"],
                "difficulty": "high"
            },
            {
                "id": "mobile_app_metadata",
                "prompt": "Assess the privacy practices of this mobile application based on available metadata.\n\nApp: DataHarvester\nDeveloper: Unknown Analytics Corp\nCategory: utilities\nPlatform: android\nPrivacy Policy: No\nPermissions: location, contacts, camera, microphone, storage, phone\nDownloads: 10M+\nIn-app purchases: Yes",
                "category": "Mobile App",
                "expected_patterns": ["excessive permissions", "no privacy policy", "data harvesting"],
                "difficulty": "high"
            },
            {
                "id": "browser_extension",
                "prompt": "Evaluate the privacy and security risks of this browser extension.\n\nExtension: WebTracker Pro\nDeveloper: TrackingCorp\nCategory: productivity\nPermissions: <all_urls>, cookies, history, tabs, webRequest, webRequestBlocking\nDescription: Enhance your browsing experience\nPrivacy Policy: Link broken",
                "category": "Browser Extension",
                "expected_patterns": ["broad permissions", "tracking", "web activity monitoring"],
                "difficulty": "high"
            },
            {
                "id": "eula_software",
                "prompt": "Analyze this EULA for concerning provisions.\n\nSOFTWARE LICENSE AGREEMENT\n\nThis software is licensed, not sold. We retain all rights not expressly granted. The software may collect diagnostic and usage data. You may not reverse engineer, decompile, or disassemble the software. We disclaim all warranties. Our total liability shall not exceed $5. This agreement is governed by binding arbitration. Updates may be installed automatically without notice.",
                "category": "EULA",
                "expected_patterns": ["data collection", "reverse engineering", "liability limitation", "automatic updates"],
                "difficulty": "medium"
            },
            {
                "id": "simple_test",
                "prompt": "Analyze the following privacy_policy for privacy concerns and assign a risk score. Document from TestCorp (Technology)",
                "category": "Simple Test",
                "expected_patterns": [],
                "difficulty": "low"
            }
        ]
    
    def test_model(self, model_name: str, test_cases: List[Dict]) -> Dict:
        """Test a single model with all test cases"""
        logger.info(f"\n{'='*60}")
        logger.info(f"Testing model: {model_name}")
        logger.info(f"{'='*60}")
        
        results = {
            "model": model_name,
            "total_tests": len(test_cases),
            "passed": 0,
            "failed": 0,
            "response_times": [],
            "scores": [],
            "test_details": []
        }
        
        for test in test_cases:
            logger.info(f"\nTest: {test['id']} ({test['category']})")
            logger.info(f"Difficulty: {test['difficulty']}")
            
            start_time = time.time()
            
            try:
                # Run the model with extended timeout based on model size
                timeout_seconds = 300 if 'gpt-oss' in model_name else 120
                result = subprocess.run(
                    ['ollama', 'run', model_name, test['prompt']],
                    capture_output=True,
                    text=True,
                    timeout=timeout_seconds
                )
                
                elapsed = time.time() - start_time
                results["response_times"].append(elapsed)
                
                if result.returncode == 0:
                    response = result.stdout
                    
                    # Analyze response quality
                    analysis = self.analyze_response(response, test)
                    
                    test_result = {
                        "test_id": test["id"],
                        "category": test["category"],
                        "response_time": elapsed,
                        "has_score": analysis["has_score"],
                        "has_grade": analysis["has_grade"],
                        "patterns_found": analysis["patterns_found"],
                        "response_length": len(response),
                        "passed": analysis["passed"]
                    }
                    
                    results["test_details"].append(test_result)
                    
                    if analysis["passed"]:
                        results["passed"] += 1
                        logger.info(f"✅ PASSED - Time: {elapsed:.2f}s")
                    else:
                        results["failed"] += 1
                        logger.info(f"❌ FAILED - Missing required elements")
                    
                    logger.info(f"Response preview: {response[:150]}...")
                    
                    # Extract score if present
                    if analysis["score"] is not None:
                        results["scores"].append(analysis["score"])
                        logger.info(f"Risk Score: {analysis['score']}/100")
                    
                    if analysis["grade"]:
                        logger.info(f"Grade: {analysis['grade']}")
                    
                    logger.info(f"Patterns detected: {', '.join(analysis['patterns_found']) if analysis['patterns_found'] else 'None'}")
                    
                else:
                    results["failed"] += 1
                    results["test_details"].append({
                        "test_id": test["id"],
                        "category": test["category"],
                        "error": result.stderr,
                        "passed": False
                    })
                    logger.error(f"❌ ERROR: {result.stderr[:100]}")
                    
            except subprocess.TimeoutExpired:
                results["failed"] += 1
                results["test_details"].append({
                    "test_id": test["id"],
                    "category": test["category"],
                    "error": "Timeout",
                    "passed": False
                })
                logger.error(f"❌ TIMEOUT - Test exceeded 120 seconds")
            except Exception as e:
                results["failed"] += 1
                results["test_details"].append({
                    "test_id": test["id"],
                    "category": test["category"],
                    "error": str(e),
                    "passed": False
                })
                logger.error(f"❌ EXCEPTION: {str(e)}")
        
        # Calculate statistics
        if results["response_times"]:
            results["avg_response_time"] = statistics.mean(results["response_times"])
            results["median_response_time"] = statistics.median(results["response_times"])
        
        if results["scores"]:
            results["avg_score"] = statistics.mean(results["scores"])
            results["score_consistency"] = statistics.stdev(results["scores"]) if len(results["scores"]) > 1 else 0
        
        results["success_rate"] = (results["passed"] / results["total_tests"]) * 100 if results["total_tests"] > 0 else 0
        
        return results
    
    def analyze_response(self, response: str, test: Dict) -> Dict:
        """Analyze model response for quality metrics"""
        analysis = {
            "has_score": False,
            "has_grade": False,
            "score": None,
            "grade": None,
            "patterns_found": [],
            "passed": False
        }
        
        response_lower = response.lower()
        
        # Check for risk score
        for i in range(0, 101):
            if f"{i}/100" in response or f"score: {i}" in response_lower:
                analysis["has_score"] = True
                analysis["score"] = i
                break
        
        # Check for grade
        for grade in ['A', 'B', 'C', 'D', 'F']:
            if f"grade: {grade}" in response or f"Grade: {grade}" in response:
                analysis["has_grade"] = True
                analysis["grade"] = grade
                break
        
        # Check for pattern detection
        common_patterns = [
            "data sharing", "third parties", "arbitration", "data collection",
            "tracking", "cookies", "permissions", "liability", "termination",
            "content license", "privacy", "security"
        ]
        
        for pattern in common_patterns:
            if pattern in response_lower:
                analysis["patterns_found"].append(pattern)
        
        # Determine if test passed
        if test["difficulty"] == "low":
            # Simple tests just need a response
            analysis["passed"] = len(response) > 50
        elif test["difficulty"] == "medium":
            # Medium tests need score or grade and some patterns
            analysis["passed"] = (analysis["has_score"] or analysis["has_grade"]) and len(analysis["patterns_found"]) > 0
        else:  # high difficulty
            # High difficulty tests need comprehensive analysis
            analysis["passed"] = analysis["has_score"] and (analysis["has_grade"] or len(analysis["patterns_found"]) >= 2)
        
        return analysis
    
    def compare_models(self, all_results: List[Dict]):
        """Generate comparison report"""
        logger.info("\n" + "="*60)
        logger.info("MODEL COMPARISON REPORT")
        logger.info("="*60)
        
        # Summary table
        logger.info("\n📊 Performance Summary:")
        logger.info("-" * 50)
        
        for result in all_results:
            logger.info(f"\nModel: {result['model']}")
            logger.info(f"  Success Rate: {result['success_rate']:.1f}%")
            logger.info(f"  Tests Passed: {result['passed']}/{result['total_tests']}")
            
            if 'avg_response_time' in result:
                logger.info(f"  Avg Response Time: {result['avg_response_time']:.2f}s")
                logger.info(f"  Median Response Time: {result['median_response_time']:.2f}s")
            
            if 'avg_score' in result:
                logger.info(f"  Avg Risk Score: {result['avg_score']:.1f}/100")
                logger.info(f"  Score Consistency (σ): {result['score_consistency']:.2f}")
        
        # Determine winner
        best_model = max(all_results, key=lambda x: x['success_rate'])
        fastest_model = min(all_results, key=lambda x: x.get('avg_response_time', float('inf')))
        
        logger.info("\n🏆 Results:")
        logger.info(f"  Best Accuracy: {best_model['model']} ({best_model['success_rate']:.1f}%)")
        logger.info(f"  Fastest: {fastest_model['model']} ({fastest_model.get('avg_response_time', 0):.2f}s avg)")
        
        # Category breakdown
        logger.info("\n📈 Performance by Category:")
        categories = {}
        
        for result in all_results:
            for detail in result.get('test_details', []):
                category = detail.get('category', 'Unknown')
                if category not in categories:
                    categories[category] = {}
                
                model = result['model']
                if model not in categories[category]:
                    categories[category][model] = {'passed': 0, 'total': 0}
                
                categories[category][model]['total'] += 1
                if detail.get('passed', False):
                    categories[category][model]['passed'] += 1
        
        for category, models in categories.items():
            logger.info(f"\n  {category}:")
            for model, stats in models.items():
                success_rate = (stats['passed'] / stats['total'] * 100) if stats['total'] > 0 else 0
                logger.info(f"    {model}: {stats['passed']}/{stats['total']} ({success_rate:.0f}%)")
        
        return best_model['model']
    
    def save_results(self, all_results: List[Dict], best_model: str):
        """Save test results to file"""
        output = {
            "test_date": datetime.now().isoformat(),
            "models_tested": [r['model'] for r in all_results],
            "best_model": best_model,
            "detailed_results": all_results
        }
        
        output_file = "model-comparison-results.json"
        with open(output_file, 'w') as f:
            json.dump(output, f, indent=2)
        
        logger.info(f"\n💾 Results saved to {output_file}")

def main():
    """Run comprehensive model testing"""
    
    tester = ModelTester()
    
    # Check available models
    available = tester.check_available_models()
    
    if not available:
        logger.error("No fine-tuned models found!")
        logger.info("Please run fine-tuning scripts first:")
        logger.info("  python finetune-available-model.py --name fine-print-privacy-qwen")
        logger.info("  python finetune-llama.py")
        return
    
    logger.info(f"Found models: {', '.join(available)}")
    
    # Create test suite
    test_cases = tester.create_test_suite()
    logger.info(f"Created {len(test_cases)} test cases")
    
    # Test each model
    all_results = []
    for model in available:
        if model.startswith('fine-print'):
            result = tester.test_model(model, test_cases)
            all_results.append(result)
    
    if all_results:
        # Compare and report
        best_model = tester.compare_models(all_results)
        
        # Save results
        tester.save_results(all_results, best_model)
        
        logger.info("\n" + "="*60)
        logger.info("🎯 RECOMMENDATION")
        logger.info("="*60)
        logger.info(f"Use '{best_model}' for production deployment")
        logger.info("This model provides the best balance of accuracy and performance")
    else:
        logger.error("No test results collected!")

if __name__ == "__main__":
    main()