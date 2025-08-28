#!/usr/bin/env python3
"""
Fine Print AI - LoRA Training Data Preparation
Converts exported training data to format suitable for Unsloth/LoRA fine-tuning
"""

import json
import os
from typing import List, Dict, Any
import argparse
from datetime import datetime

def create_alpaca_format(entry: Dict[str, Any]) -> Dict[str, str]:
    """Convert training entry to Alpaca instruction format"""
    
    # Create instruction based on document type
    if entry['document_type'] == 'privacy_policy':
        instruction = "Analyze this privacy policy and identify problematic patterns, provide a risk score, and summarize key findings."
    else:
        instruction = "Analyze this terms of service and identify problematic clauses, provide a risk score, and summarize key findings."
    
    # Truncate content to reasonable length for training
    content = entry['content'][:2000] + "..." if len(entry['content']) > 2000 else entry['content']
    
    # Format the input
    input_text = f"Document Type: {entry['document_type']}\nCategory: {entry['category']}\n\n{content}"
    
    # Format the expected output
    analysis = entry['analysis']
    output_parts = [
        f"Risk Score: {analysis['score']}/100 (Grade: {analysis['grade']})",
        "",
        "Problematic Patterns Found:"
    ]
    
    for pattern in analysis['patterns'][:5]:  # Limit to top 5 patterns
        output_parts.append(f"- {pattern['type']} ({pattern['severity']}): {pattern['description']}")
    
    output_parts.extend([
        "",
        "Key Findings:"
    ])
    
    for finding in analysis['findings'][:3]:  # Limit to top 3 findings
        output_parts.append(f"- {finding['title']}: {finding['explanation']}")
    
    output_parts.extend([
        "",
        f"Summary: {analysis['summary']}"
    ])
    
    return {
        "instruction": instruction,
        "input": input_text,
        "output": "\n".join(output_parts)
    }

def create_conversational_format(entry: Dict[str, Any]) -> List[Dict[str, str]]:
    """Convert to conversational format for chat fine-tuning"""
    
    messages = []
    
    # System message
    messages.append({
        "role": "system",
        "content": "You are Fine Print AI, an expert at analyzing legal documents to identify problematic patterns and protect user rights. Provide clear, actionable analysis with risk scores."
    })
    
    # User message
    doc_type = "privacy policy" if entry['document_type'] == 'privacy_policy' else "terms of service"
    content = entry['content'][:2000] + "..." if len(entry['content']) > 2000 else entry['content']
    
    messages.append({
        "role": "user",
        "content": f"Please analyze this {doc_type} from a {entry['category']} company:\n\n{content}"
    })
    
    # Assistant response
    analysis = entry['analysis']
    response_parts = [
        f"I've analyzed this {doc_type} and found several important issues:",
        "",
        f"**Risk Score: {analysis['score']}/100 (Grade: {analysis['grade']})**",
        "",
        "**Problematic Patterns:**"
    ]
    
    for pattern in analysis['patterns']:
        severity_emoji = "🔴" if pattern['severity'] == 'high' else "🟡" if pattern['severity'] == 'medium' else "🟢"
        response_parts.append(f"{severity_emoji} **{pattern['type'].replace('_', ' ').title()}**: {pattern['description']}")
    
    response_parts.extend([
        "",
        "**Key Concerns:**"
    ])
    
    for i, finding in enumerate(analysis['findings'][:5], 1):
        response_parts.append(f"{i}. **{finding['title']}**: {finding['explanation']}")
    
    response_parts.extend([
        "",
        f"**Summary:** {analysis['summary']}",
        "",
        "I recommend carefully reviewing these sections before agreeing to these terms. Consider looking for alternative services with more user-friendly policies if these concerns are significant to you."
    ])
    
    messages.append({
        "role": "assistant",
        "content": "\n".join(response_parts)
    })
    
    return messages

def create_specialized_datasets(entries: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    """Create specialized datasets for different document categories"""
    
    datasets = {
        'general': [],
        'social_media': [],
        'ecommerce': [],
        'financial': [],
        'streaming': []
    }
    
    category_mapping = {
        'Social Media': 'social_media',
        'E-commerce': 'ecommerce',
        'Financial Services': 'financial',
        'Cryptocurrency': 'financial',
        'Video Streaming': 'streaming',
        'Music Streaming': 'streaming'
    }
    
    for entry in entries:
        # Add to general dataset
        datasets['general'].append(entry)
        
        # Add to specialized dataset if applicable
        category = entry.get('category', '')
        if category in category_mapping:
            datasets[category_mapping[category]].append(entry)
    
    return datasets

def main():
    parser = argparse.ArgumentParser(description='Prepare training data for LoRA fine-tuning')
    parser.add_argument('--input-dir', default='../data/training', help='Input directory with JSONL files')
    parser.add_argument('--output-dir', default='../data/lora-training', help='Output directory for prepared data')
    parser.add_argument('--format', choices=['alpaca', 'conversation', 'both'], default='both', 
                       help='Output format for training data')
    args = parser.parse_args()
    
    # Create output directory
    os.makedirs(args.output_dir, exist_ok=True)
    
    print("🔧 Fine Print AI - LoRA Training Data Preparation")
    print("=" * 50)
    
    # Load training data
    train_file = os.path.join(args.input_dir, 'train.jsonl')
    val_file = os.path.join(args.input_dir, 'validation.jsonl')
    
    if not os.path.exists(train_file):
        print(f"❌ Training file not found: {train_file}")
        print("Please run export-training-data.ts first")
        return
    
    print(f"📖 Loading training data from {train_file}")
    
    train_entries = []
    with open(train_file, 'r') as f:
        for line in f:
            train_entries.append(json.loads(line.strip()))
    
    val_entries = []
    if os.path.exists(val_file):
        with open(val_file, 'r') as f:
            for line in f:
                val_entries.append(json.loads(line.strip()))
    
    print(f"✅ Loaded {len(train_entries)} training samples")
    print(f"✅ Loaded {len(val_entries)} validation samples")
    
    # Create specialized datasets
    print("\n📊 Creating specialized datasets...")
    train_datasets = create_specialized_datasets(train_entries)
    val_datasets = create_specialized_datasets(val_entries)
    
    for category, entries in train_datasets.items():
        if entries:
            print(f"  - {category}: {len(entries)} samples")
    
    # Convert to training formats
    for dataset_name, train_data in train_datasets.items():
        if not train_data:
            continue
            
        print(f"\n🔄 Processing {dataset_name} dataset...")
        
        # Alpaca format
        if args.format in ['alpaca', 'both']:
            alpaca_train = [create_alpaca_format(entry) for entry in train_data]
            alpaca_val = [create_alpaca_format(entry) for entry in val_datasets.get(dataset_name, [])]
            
            # Save Alpaca format
            alpaca_dir = os.path.join(args.output_dir, 'alpaca', dataset_name)
            os.makedirs(alpaca_dir, exist_ok=True)
            
            with open(os.path.join(alpaca_dir, 'train.json'), 'w') as f:
                json.dump(alpaca_train, f, indent=2)
            
            if alpaca_val:
                with open(os.path.join(alpaca_dir, 'validation.json'), 'w') as f:
                    json.dump(alpaca_val, f, indent=2)
            
            print(f"  ✅ Saved Alpaca format to {alpaca_dir}")
        
        # Conversational format
        if args.format in ['conversation', 'both']:
            conv_train = [create_conversational_format(entry) for entry in train_data]
            conv_val = [create_conversational_format(entry) for entry in val_datasets.get(dataset_name, [])]
            
            # Save conversational format
            conv_dir = os.path.join(args.output_dir, 'conversation', dataset_name)
            os.makedirs(conv_dir, exist_ok=True)
            
            with open(os.path.join(conv_dir, 'train.json'), 'w') as f:
                json.dump(conv_train, f, indent=2)
            
            if conv_val:
                with open(os.path.join(conv_dir, 'validation.json'), 'w') as f:
                    json.dump(conv_val, f, indent=2)
            
            print(f"  ✅ Saved conversational format to {conv_dir}")
    
    # Create training config
    config = {
        "created_at": datetime.now().isoformat(),
        "base_model": "unsloth/Phi-3-mini-4k-instruct",
        "training_params": {
            "r": 16,  # LoRA rank
            "lora_alpha": 16,
            "lora_dropout": 0.05,
            "bias": "none",
            "task_type": "CAUSAL_LM",
            "target_modules": ["q_proj", "k_proj", "v_proj", "o_proj"],
            "learning_rate": 2e-4,
            "num_train_epochs": 3,
            "per_device_train_batch_size": 4,
            "gradient_accumulation_steps": 4,
            "warmup_steps": 100,
            "logging_steps": 25,
            "save_strategy": "epoch",
            "evaluation_strategy": "epoch"
        },
        "datasets": {
            name: len(entries) for name, entries in train_datasets.items() if entries
        }
    }
    
    with open(os.path.join(args.output_dir, 'training_config.json'), 'w') as f:
        json.dump(config, f, indent=2)
    
    print(f"\n✅ Training data preparation complete!")
    print(f"📁 Output directory: {args.output_dir}")
    print("\n🚀 Next steps:")
    print("1. Review the prepared datasets")
    print("2. Run LoRA fine-tuning with train-lora.py")
    print("3. Evaluate model performance")

if __name__ == "__main__":
    main()