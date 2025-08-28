#!/usr/bin/env python3
"""
Fine-tune models for business agents
Creates specialized models for Marketing, Sales, Customer Success, and Analytics
"""

import json
import os
import subprocess
import sys
import time
import logging
from typing import List, Dict

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class BusinessAgentFineTuner:
    """Fine-tune models for different business agents"""
    
    def __init__(self, base_model="llama3.2:latest"):
        self.base_model = base_model
        self.agents = {
            "marketing": {
                "name": "fine-print-marketing",
                "dataset": "marketing-training-dataset.jsonl",
                "system_prompt": self._get_marketing_prompt()
            },
            "sales": {
                "name": "fine-print-sales",
                "dataset": "sales-training-dataset.jsonl",
                "system_prompt": self._get_sales_prompt()
            },
            "customer": {
                "name": "fine-print-customer",
                "dataset": "customer-training-dataset.jsonl",
                "system_prompt": self._get_customer_prompt()
            },
            "analytics": {
                "name": "fine-print-analytics",
                "dataset": "analytics-training-dataset.jsonl",
                "system_prompt": self._get_analytics_prompt()
            }
        }
    
    def _get_marketing_prompt(self):
        return """You are Fine Print AI's Marketing Agent, specialized in creating compelling content and campaigns.

Your expertise includes:
• Email marketing campaigns with high conversion rates
• SEO-optimized blog content and web copy
• Social media strategy and content creation
• A/B testing and campaign optimization
• Brand messaging and positioning
• Lead generation and nurturing

Always focus on:
- Clear value propositions
- Data-driven insights
- Compliance and privacy messaging
- Professional yet engaging tone
- Conversion optimization"""

    def _get_sales_prompt(self):
        return """You are Fine Print AI's Sales Agent, expert in B2B software sales and lead conversion.

Your expertise includes:
• Lead qualification and scoring
• Cold outreach and prospecting
• Proposal and quote generation
• Objection handling and negotiation
• Pipeline management and forecasting
• Enterprise sales strategies

Always focus on:
- Understanding customer pain points
- ROI and value demonstration
- Building trust and relationships
- Solution-oriented selling
- Data-driven sales insights"""

    def _get_customer_prompt(self):
        return """You are Fine Print AI's Customer Success Agent, dedicated to customer satisfaction and retention.

Your expertise includes:
• Technical support and troubleshooting
• Customer onboarding and training
• Success metrics and health scoring
• Churn prevention and retention
• Upselling and expansion strategies
• Customer advocacy programs

Always focus on:
- Empathetic and helpful responses
- Quick problem resolution
- Proactive success management
- Educational content delivery
- Building long-term relationships"""

    def _get_analytics_prompt(self):
        return """You are Fine Print AI's Analytics Agent, specialized in data analysis and business intelligence.

Your expertise includes:
• Business metrics and KPI tracking
• Revenue and growth analytics
• User behavior and engagement analysis
• Predictive modeling and forecasting
• Report generation and visualization
• Data-driven recommendations

Always focus on:
- Accurate calculations and analysis
- Clear data visualization
- Actionable insights
- Trend identification
- Strategic recommendations"""

    def load_training_data(self, dataset_path):
        """Load training data from JSONL file"""
        examples = []
        try:
            with open(dataset_path, 'r') as f:
                for line in f:
                    examples.append(json.loads(line.strip()))
            logger.info(f"Loaded {len(examples)} examples from {dataset_path}")
        except Exception as e:
            logger.error(f"Error loading {dataset_path}: {e}")
        return examples
    
    def create_modelfile(self, agent_type: str, examples: List[Dict]):
        """Create Modelfile for specific agent"""
        agent_config = self.agents[agent_type]
        
        modelfile_content = f"""# Fine Print AI - {agent_type.capitalize()} Agent Model
FROM {self.base_model}

# Optimized parameters for business agent
PARAMETER temperature 0.8
PARAMETER top_p 0.9
PARAMETER top_k 50
PARAMETER repeat_penalty 1.1
PARAMETER num_ctx 2048
PARAMETER num_predict 1024

# Agent-specific system prompt
SYSTEM \"\"\"
{agent_config['system_prompt']}
\"\"\"

# Response template
TEMPLATE \"\"\"{{{{ if .System }}}}System: {{{{ .System }}}}
{{{{ end }}}}User: {{{{ .Prompt }}}}
Assistant: {{{{ .Response }}}}\"\"\"

# Training examples for {agent_type} agent
"""
        
        # Add training examples (use first 20 for quick training)
        for i, example in enumerate(examples[:20]):
            instruction = example.get('instruction', '')
            input_text = example.get('input', '')
            output = example.get('output', '')
            
            prompt = f"{instruction} {input_text}".strip()
            response = output.strip()
            
            # Escape quotes
            prompt = prompt.replace('"', '\\"')
            response = response.replace('"', '\\"')
            
            modelfile_content += f"""
# Example {i+1}
MESSAGE user "{prompt}"
MESSAGE assistant "{response}"
"""
        
        return modelfile_content
    
    def fine_tune_agent(self, agent_type: str):
        """Fine-tune a specific business agent"""
        agent_config = self.agents[agent_type]
        
        logger.info(f"\n{'='*50}")
        logger.info(f"Fine-tuning {agent_type.capitalize()} Agent")
        logger.info(f"{'='*50}")
        
        # Load training data
        examples = self.load_training_data(agent_config['dataset'])
        if not examples:
            logger.error(f"No training data found for {agent_type}")
            return False
        
        # Create Modelfile
        modelfile_content = self.create_modelfile(agent_type, examples)
        
        # Save Modelfile
        output_dir = f"./models/{agent_config['name']}"
        os.makedirs(output_dir, exist_ok=True)
        modelfile_path = os.path.join(output_dir, "Modelfile")
        
        with open(modelfile_path, 'w') as f:
            f.write(modelfile_content)
        
        logger.info(f"Created Modelfile at {modelfile_path}")
        
        # Create the model
        logger.info(f"Creating model: {agent_config['name']}")
        
        result = subprocess.run(
            ['ollama', 'create', agent_config['name'], '-f', modelfile_path],
            capture_output=True,
            text=True
        )
        
        if result.returncode == 0:
            logger.info(f"✅ Successfully created {agent_config['name']}")
            return True
        else:
            logger.error(f"❌ Failed to create model: {result.stderr}")
            return False
    
    def test_agent(self, agent_type: str):
        """Test a fine-tuned agent with relevant prompts"""
        agent_config = self.agents[agent_type]
        model_name = agent_config['name']
        
        # Agent-specific test prompts
        test_prompts = {
            "marketing": "Write a compelling email subject line for Fine Print AI targeting legal teams",
            "sales": "Qualify this lead: Tech startup with 50 employees, concerned about GDPR compliance",
            "customer": "Help a customer who can't upload their document for analysis",
            "analytics": "Calculate the monthly recurring revenue growth rate"
        }
        
        test_prompt = test_prompts.get(agent_type, "Provide assistance")
        
        logger.info(f"\n🧪 Testing {agent_type.capitalize()} Agent")
        logger.info(f"Prompt: {test_prompt}")
        
        start = time.time()
        
        try:
            result = subprocess.run(
                ['ollama', 'run', model_name, test_prompt],
                capture_output=True,
                text=True,
                timeout=60
            )
            
            elapsed = time.time() - start
            
            if result.returncode == 0:
                logger.info(f"✅ Response received in {elapsed:.2f}s")
                logger.info(f"Response: {result.stdout[:300]}...")
                return True
            else:
                logger.error(f"❌ Test failed: {result.stderr}")
                return False
                
        except subprocess.TimeoutExpired:
            logger.error(f"❌ Test timed out after 60 seconds")
            return False
    
    def fine_tune_all(self, test=False):
        """Fine-tune all business agents"""
        results = {}
        
        for agent_type in self.agents.keys():
            success = self.fine_tune_agent(agent_type)
            results[agent_type] = success
            
            if success and test:
                test_success = self.test_agent(agent_type)
                results[f"{agent_type}_test"] = test_success
        
        return results

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="Fine-tune business agent models")
    parser.add_argument("--agent", type=str, choices=["marketing", "sales", "customer", "analytics", "all"],
                       default="all", help="Which agent to fine-tune")
    parser.add_argument("--base-model", type=str, default="llama3.2:latest",
                       help="Base model to use for fine-tuning")
    parser.add_argument("--test", action="store_true", help="Test after fine-tuning")
    
    args = parser.parse_args()
    
    # Initialize fine-tuner
    tuner = BusinessAgentFineTuner(base_model=args.base_model)
    
    logger.info("🚀 Business Agent Fine-Tuning")
    logger.info(f"Base Model: {args.base_model}")
    
    if args.agent == "all":
        # Fine-tune all agents
        results = tuner.fine_tune_all(test=args.test)
        
        # Summary
        logger.info("\n" + "="*50)
        logger.info("📊 Fine-Tuning Summary")
        logger.info("="*50)
        
        for agent, success in results.items():
            if "_test" not in agent:
                status = "✅ Success" if success else "❌ Failed"
                logger.info(f"{agent.capitalize()}: {status}")
        
        # List created models
        logger.info("\n📦 Created Models:")
        for agent_type, config in tuner.agents.items():
            if results.get(agent_type):
                logger.info(f"  • {config['name']}")
        
        logger.info("\n💡 To use a model:")
        logger.info("  ollama run fine-print-marketing 'Write an email campaign'")
        logger.info("  ollama run fine-print-sales 'Qualify this lead...'")
        logger.info("  ollama run fine-print-customer 'Help with...'")
        logger.info("  ollama run fine-print-analytics 'Analyze metrics...'")
        
    else:
        # Fine-tune specific agent
        success = tuner.fine_tune_agent(args.agent)
        
        if success:
            logger.info(f"\n✅ {args.agent.capitalize()} agent fine-tuned successfully!")
            
            if args.test:
                tuner.test_agent(args.agent)
            
            logger.info(f"\nTo use: ollama run {tuner.agents[args.agent]['name']}")
        else:
            logger.error(f"\n❌ Failed to fine-tune {args.agent} agent")
            sys.exit(1)

if __name__ == "__main__":
    main()