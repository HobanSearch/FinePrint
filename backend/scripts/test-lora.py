#!/usr/bin/env python3
"""
Fine Print AI - LoRA Model Testing Script
Tests fine-tuned models on sample documents
"""

import os
import json
import torch
import argparse
from typing import Dict, List, Any
from unsloth import FastLanguageModel
import time

# Sample test documents
TEST_DOCUMENTS = {
    "privacy_policy_good": """
Privacy Policy - Example Good Company

We respect your privacy and are committed to protecting your personal data.

1. Data Collection: We only collect data necessary to provide our services.
2. Data Usage: Your data is used solely for the purposes you've agreed to.
3. Data Sharing: We never sell your personal data to third parties.
4. User Rights: You can access, modify, or delete your data at any time.
5. Data Retention: We delete your data 30 days after account closure.
6. Security: We use industry-standard encryption to protect your data.
7. Consent: We always ask for explicit consent before collecting sensitive data.
8. Transparency: This policy is written in plain language for easy understanding.
""",
    
    "privacy_policy_bad": """
Privacy Policy

By using our service, you agree to the following:

We may collect any and all information about you, including but not limited to personal data, browsing history, location data, contacts, and device information. This data may be shared with our partners, affiliates, and third parties for marketing purposes.

You grant us a perpetual, irrevocable, worldwide license to use any content you create. We may modify this policy at any time without notice. By continuing to use our service, you agree to any changes.

You waive your right to participate in class action lawsuits. All disputes must be resolved through binding arbitration. We are not responsible for any data breaches or misuse of your information.

Your data may be transferred to countries with different privacy laws. We reserve the right to use your data for any purpose we deem necessary. Account deletion does not guarantee data removal.
""",
    
    "terms_of_service": """
Terms of Service

1. Automatic Renewal: Your subscription automatically renews unless cancelled 30 days before the renewal date.
2. Cancellation: To cancel, you must call our support line during business hours and obtain a confirmation number.
3. Refunds: No refunds are provided under any circumstances.
4. Price Changes: We may increase prices at any time with 7 days notice.
5. Content License: You grant us unlimited rights to any content you upload.
6. Liability: We are not liable for any damages, even if caused by our negligence.
7. Arbitration: All disputes must be resolved through binding arbitration.
"""
}

def test_model(model_path: str, test_type: str = "all"):
    """Test the fine-tuned model on sample documents"""
    
    print(f"🧪 Fine Print AI - Model Testing")
    print("=" * 50)
    print(f"📁 Model path: {model_path}")
    
    # Load model and tokenizer
    print(f"\n📦 Loading fine-tuned model...")
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=model_path,
        max_seq_length=2048,
        dtype=torch.float16,
        load_in_4bit=True,
    )
    
    # Prepare for inference
    FastLanguageModel.for_inference(model)
    
    # Test each document
    results = {}
    
    for doc_name, content in TEST_DOCUMENTS.items():
        if test_type != "all" and test_type not in doc_name:
            continue
            
        print(f"\n{'='*60}")
        print(f"📄 Testing: {doc_name}")
        print(f"{'='*60}")
        
        # Prepare prompt
        doc_type = "privacy policy" if "privacy" in doc_name else "terms of service"
        prompt = f"""### Instruction:
Analyze this {doc_type} and identify problematic patterns, provide a risk score, and summarize key findings.

### Input:
Document Type: {doc_type}
Category: Technology

{content}

### Response:
"""
        
        # Generate response
        start_time = time.time()
        
        inputs = tokenizer(prompt, return_tensors="pt").to("cuda")
        
        with torch.no_grad():
            outputs = model.generate(
                **inputs,
                max_new_tokens=512,
                temperature=0.7,
                top_p=0.9,
                do_sample=True,
                pad_token_id=tokenizer.pad_token_id,
                eos_token_id=tokenizer.eos_token_id,
            )
        
        response = tokenizer.decode(outputs[0], skip_special_tokens=True)
        
        # Extract only the response part
        if "### Response:" in response:
            response = response.split("### Response:")[1].strip()
        
        generation_time = time.time() - start_time
        
        # Display results
        print(f"\n🤖 Model Response:")
        print("-" * 60)
        print(response)
        print("-" * 60)
        print(f"⏱️  Generation time: {generation_time:.2f}s")
        
        # Store results
        results[doc_name] = {
            "response": response,
            "generation_time": generation_time
        }
    
    return results

def compare_with_baseline(model_path: str, baseline_model: str = "unsloth/Phi-3-mini-4k-instruct"):
    """Compare fine-tuned model with baseline"""
    
    print(f"\n📊 Comparing models:")
    print(f"- Fine-tuned: {model_path}")
    print(f"- Baseline: {baseline_model}")
    
    # Test both models
    print(f"\n🔬 Testing fine-tuned model...")
    finetuned_results = test_model(model_path, "privacy_policy_bad")
    
    print(f"\n🔬 Testing baseline model...")
    baseline_results = test_model(baseline_model, "privacy_policy_bad")
    
    # Compare results
    print(f"\n📈 Comparison Results:")
    print("=" * 60)
    
    for doc_name in finetuned_results:
        print(f"\n📄 Document: {doc_name}")
        print(f"\n🎯 Fine-tuned model response length: {len(finetuned_results[doc_name]['response'])}")
        print(f"🎯 Baseline model response length: {len(baseline_results[doc_name]['response'])}")
        
        # Simple quality checks
        ft_response = finetuned_results[doc_name]['response'].lower()
        bl_response = baseline_results[doc_name]['response'].lower()
        
        # Check for key terms
        key_terms = ['risk score', 'problematic', 'concern', 'warning', 'grade']
        ft_terms = sum(1 for term in key_terms if term in ft_response)
        bl_terms = sum(1 for term in key_terms if term in bl_response)
        
        print(f"\n✅ Key terms found:")
        print(f"   Fine-tuned: {ft_terms}/{len(key_terms)}")
        print(f"   Baseline: {bl_terms}/{len(key_terms)}")
        
        # Pattern detection
        patterns = ['third party', 'arbitration', 'perpetual', 'waive', 'liability']
        ft_patterns = sum(1 for pattern in patterns if pattern in ft_response)
        bl_patterns = sum(1 for pattern in patterns if pattern in bl_response)
        
        print(f"\n🔍 Patterns detected:")
        print(f"   Fine-tuned: {ft_patterns}/{len(patterns)}")
        print(f"   Baseline: {bl_patterns}/{len(patterns)}")

def main():
    parser = argparse.ArgumentParser(description='Test fine-tuned LoRA models')
    parser.add_argument('--model-path', required=True, help='Path to fine-tuned model')
    parser.add_argument('--test-type', choices=['all', 'privacy_policy', 'terms_of_service'], 
                       default='all', help='Type of documents to test')
    parser.add_argument('--compare', action='store_true', 
                       help='Compare with baseline model')
    parser.add_argument('--baseline-model', default='unsloth/Phi-3-mini-4k-instruct',
                       help='Baseline model for comparison')
    parser.add_argument('--save-results', action='store_true',
                       help='Save test results to file')
    
    args = parser.parse_args()
    
    if args.compare:
        compare_with_baseline(args.model_path, args.baseline_model)
    else:
        results = test_model(args.model_path, args.test_type)
        
        if args.save_results:
            output_file = os.path.join(
                os.path.dirname(args.model_path), 
                'test_results.json'
            )
            with open(output_file, 'w') as f:
                json.dump(results, f, indent=2)
            print(f"\n💾 Results saved to: {output_file}")
    
    print(f"\n✅ Testing complete!")

if __name__ == "__main__":
    main()