import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import axios from 'axios';
import { TrainingConfig } from '../types/index.js';
import { logger } from '../utils/logger.js';

export class LoRATrainer {
  private prisma: PrismaClient;
  private redis: Redis;
  private ollamaEndpoint: string;
  private modelRegistry: Map<string, any> = new Map();

  constructor(
    prisma: PrismaClient,
    redis: Redis,
    ollamaEndpoint: string = 'http://localhost:11434'
  ) {
    this.prisma = prisma;
    this.redis = redis;
    this.ollamaEndpoint = ollamaEndpoint;
    this.initializeModelRegistry();
  }

  private initializeModelRegistry(): void {
    // Register base models and their LoRA configurations
    this.modelRegistry.set('phi2', {
      baseModel: 'microsoft/phi-2',
      defaultRank: 16,
      defaultAlpha: 32,
      targetModules: ['q_proj', 'v_proj', 'k_proj', 'o_proj', 'gate_proj', 'up_proj', 'down_proj'],
      maxRank: 64,
    });

    this.modelRegistry.set('mistral', {
      baseModel: 'mistralai/Mistral-7B-v0.1',
      defaultRank: 32,
      defaultAlpha: 64,
      targetModules: ['q_proj', 'v_proj', 'k_proj', 'o_proj', 'gate_proj', 'up_proj', 'down_proj'],
      maxRank: 128,
    });

    this.modelRegistry.set('llama2', {
      baseModel: 'meta-llama/Llama-2-13b-hf',
      defaultRank: 64,
      defaultAlpha: 128,
      targetModules: ['q_proj', 'v_proj', 'k_proj', 'o_proj', 'gate_proj', 'up_proj', 'down_proj'],
      maxRank: 256,
    });

    this.modelRegistry.set('mixtral', {
      baseModel: 'mistralai/Mixtral-8x7B-v0.1',
      defaultRank: 128,
      defaultAlpha: 256,
      targetModules: ['q_proj', 'v_proj', 'k_proj', 'o_proj', 'w1', 'w2', 'w3'],
      maxRank: 512,
    });
  }

  async train(
    runId: string,
    config: TrainingConfig,
    datasetPath: string
  ): Promise<any> {
    try {
      // Get model configuration
      const modelConfig = this.modelRegistry.get(config.modelType);
      if (!modelConfig) {
        throw new Error(`Unknown model type: ${config.modelType}`);
      }

      // Validate LoRA configuration
      const loraConfig = this.validateLoRAConfig(config.loraConfig!, modelConfig);

      // Prepare training script
      const scriptPath = await this.prepareTrainingScript(runId, config, loraConfig);

      // Execute training
      const result = await this.executeLoRATraining(
        runId,
        scriptPath,
        datasetPath,
        config,
        loraConfig
      );

      // Create Ollama model with LoRA adapter
      await this.createOllamaModel(runId, result.adapterPath, config.modelType);

      // Validate trained adapter
      await this.validateAdapter(runId, result.adapterPath);

      return result;
    } catch (error) {
      logger.error('LoRA training failed', { error, runId });
      throw error;
    }
  }

  private validateLoRAConfig(config: any, modelConfig: any): any {
    const validated = {
      rank: config.rank || modelConfig.defaultRank,
      alpha: config.alpha || modelConfig.defaultAlpha,
      dropout: config.dropout || 0.1,
      targetModules: config.targetModules || modelConfig.targetModules,
      biasType: 'none',
      taskType: 'CAUSAL_LM',
    };

    // Validate rank
    if (validated.rank > modelConfig.maxRank) {
      logger.warn('LoRA rank exceeds recommended maximum', {
        rank: validated.rank,
        maxRank: modelConfig.maxRank,
      });
    }

    // Validate alpha/rank ratio
    const ratio = validated.alpha / validated.rank;
    if (ratio < 1 || ratio > 4) {
      logger.warn('Unusual alpha/rank ratio', { ratio, alpha: validated.alpha, rank: validated.rank });
    }

    return validated;
  }

  private async prepareTrainingScript(
    runId: string,
    config: TrainingConfig,
    loraConfig: any
  ): Promise<string> {
    const scriptContent = `
import torch
import json
import sys
from pathlib import Path
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    TrainingArguments,
    Trainer,
    DataCollatorForLanguageModeling,
)
from peft import (
    LoraConfig,
    get_peft_model,
    TaskType,
    prepare_model_for_kbit_training,
)
from datasets import load_dataset
import bitsandbytes as bnb
import wandb
import os

# Configuration
RUN_ID = "${runId}"
MODEL_NAME = "${this.modelRegistry.get(config.modelType).baseModel}"
DATASET_PATH = sys.argv[1]
OUTPUT_DIR = f"/models/{RUN_ID}"
ADAPTER_DIR = f"{OUTPUT_DIR}/adapter"

# LoRA Configuration
LORA_CONFIG = {
    "r": ${loraConfig.rank},
    "lora_alpha": ${loraConfig.alpha},
    "target_modules": ${JSON.stringify(loraConfig.targetModules)},
    "lora_dropout": ${loraConfig.dropout},
    "bias": "${loraConfig.biasType}",
    "task_type": TaskType.${loraConfig.taskType},
}

# Training Configuration
TRAINING_CONFIG = {
    "num_train_epochs": ${config.hyperparameters.epochs},
    "per_device_train_batch_size": ${config.hyperparameters.batchSize},
    "per_device_eval_batch_size": ${config.hyperparameters.batchSize},
    "learning_rate": ${config.hyperparameters.learningRate},
    "warmup_steps": ${config.hyperparameters.warmupSteps || 100},
    "weight_decay": ${config.hyperparameters.weightDecay || 0.01},
    "logging_steps": 10,
    "save_steps": 100,
    "eval_steps": 50,
    "save_total_limit": 3,
    "gradient_checkpointing": True,
    "fp16": True,
    "gradient_accumulation_steps": ${Math.max(1, Math.floor(32 / config.hyperparameters.batchSize))},
    "max_grad_norm": ${config.hyperparameters.gradientClipping || 1.0},
}

def main():
    # Initialize wandb for tracking
    wandb.init(
        project="fineprint-lora",
        name=f"lora-{RUN_ID}",
        config={**LORA_CONFIG, **TRAINING_CONFIG}
    )
    
    # Load tokenizer
    print(f"Loading tokenizer for {MODEL_NAME}...")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "right"
    
    # Load model with quantization for efficiency
    print(f"Loading model {MODEL_NAME}...")
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.float16,
        bnb_4bit_use_double_quant=True,
    )
    
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_NAME,
        quantization_config=bnb_config,
        device_map="auto",
        trust_remote_code=True,
    )
    
    # Prepare model for k-bit training
    model = prepare_model_for_kbit_training(model)
    
    # Apply LoRA
    print("Applying LoRA configuration...")
    peft_config = LoraConfig(**LORA_CONFIG)
    model = get_peft_model(model, peft_config)
    
    # Print trainable parameters
    trainable_params = 0
    all_param = 0
    for _, param in model.named_parameters():
        all_param += param.numel()
        if param.requires_grad:
            trainable_params += param.numel()
    
    print(f"Trainable params: {trainable_params:,} || All params: {all_param:,} || Trainable: {100 * trainable_params / all_param:.2f}%")
    
    # Load dataset
    print(f"Loading dataset from {DATASET_PATH}...")
    dataset = load_dataset('json', data_files=DATASET_PATH, split='train')
    
    # Split into train/eval
    dataset = dataset.train_test_split(test_size=0.1, seed=42)
    
    # Tokenize dataset
    def tokenize_function(examples):
        return tokenizer(
            examples['input'],
            truncation=True,
            padding='max_length',
            max_length=512,
        )
    
    tokenized_dataset = dataset.map(tokenize_function, batched=True)
    
    # Data collator
    data_collator = DataCollatorForLanguageModeling(
        tokenizer=tokenizer,
        mlm=False,
    )
    
    # Training arguments
    training_args = TrainingArguments(
        output_dir=OUTPUT_DIR,
        **TRAINING_CONFIG,
        evaluation_strategy="steps",
        save_strategy="steps",
        load_best_model_at_end=True,
        metric_for_best_model="eval_loss",
        greater_is_better=False,
        push_to_hub=False,
        report_to="wandb",
        run_name=f"lora-{RUN_ID}",
    )
    
    # Create trainer
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized_dataset['train'],
        eval_dataset=tokenized_dataset['test'],
        tokenizer=tokenizer,
        data_collator=data_collator,
    )
    
    # Train
    print("Starting training...")
    train_result = trainer.train()
    
    # Save adapter
    print(f"Saving adapter to {ADAPTER_DIR}...")
    model.save_pretrained(ADAPTER_DIR)
    tokenizer.save_pretrained(ADAPTER_DIR)
    
    # Save metrics
    metrics = {
        "train_loss": train_result.training_loss,
        "train_runtime": train_result.metrics['train_runtime'],
        "train_samples_per_second": train_result.metrics['train_samples_per_second'],
        "trainable_params": trainable_params,
        "total_params": all_param,
        "trainable_percentage": 100 * trainable_params / all_param,
    }
    
    with open(f"{OUTPUT_DIR}/metrics.json", "w") as f:
        json.dump(metrics, f, indent=2)
    
    print("Training completed successfully!")
    wandb.finish()
    
    return metrics

if __name__ == "__main__":
    from transformers import BitsAndBytesConfig
    main()
`;

    const scriptPath = `/tmp/lora_train_${runId}.py`;
    await fs.writeFile(scriptPath, scriptContent);
    return scriptPath;
  }

  private async executeLoRATraining(
    runId: string,
    scriptPath: string,
    datasetPath: string,
    config: TrainingConfig,
    loraConfig: any
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const process = spawn('python', [scriptPath, datasetPath], {
        env: {
          ...process.env,
          CUDA_VISIBLE_DEVICES: '0',
          TRANSFORMERS_CACHE: '/models/cache',
          HF_HOME: '/models/huggingface',
          WANDB_API_KEY: process.env.WANDB_API_KEY || 'offline',
          WANDB_MODE: process.env.WANDB_MODE || 'offline',
        },
      });

      let output = '';
      let trainingLoss: number[] = [];
      let validationLoss: number[] = [];
      let currentEpoch = 0;

      process.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        
        // Parse training progress
        const epochMatch = text.match(/Epoch (\d+)\/(\d+)/);
        if (epochMatch) {
          currentEpoch = parseInt(epochMatch[1]);
          const totalEpochs = parseInt(epochMatch[2]);
          const progress = (currentEpoch / totalEpochs) * 100;
          
          this.redis.publish(`training:${runId}:progress`, JSON.stringify({
            epoch: currentEpoch,
            totalEpochs,
            progress,
          }));
        }

        // Parse loss
        const lossMatch = text.match(/Loss: ([\d.]+)/);
        if (lossMatch) {
          const loss = parseFloat(lossMatch[1]);
          trainingLoss.push(loss);
          
          this.redis.publish(`training:${runId}:metrics`, JSON.stringify({
            epoch: currentEpoch,
            loss,
            type: 'training',
          }));
        }

        // Parse validation loss
        const valLossMatch = text.match(/eval_loss: ([\d.]+)/);
        if (valLossMatch) {
          const loss = parseFloat(valLossMatch[1]);
          validationLoss.push(loss);
          
          this.redis.publish(`training:${runId}:metrics`, JSON.stringify({
            epoch: currentEpoch,
            loss,
            type: 'validation',
          }));
        }

        logger.debug('LoRA training output', { runId, text });
      });

      process.stderr.on('data', (data) => {
        logger.warn('LoRA training stderr', { runId, data: data.toString() });
      });

      process.on('close', async (code) => {
        if (code === 0) {
          // Read metrics file
          const metricsPath = `/models/${runId}/metrics.json`;
          let metrics = {};
          
          try {
            const metricsContent = await fs.readFile(metricsPath, 'utf-8');
            metrics = JSON.parse(metricsContent);
          } catch (error) {
            logger.warn('Failed to read metrics file', { error, metricsPath });
          }

          resolve({
            adapterPath: `/models/${runId}/adapter`,
            modelPath: `/models/${runId}/model.bin`,
            metrics: {
              ...metrics,
              loraRank: loraConfig.rank,
              loraAlpha: loraConfig.alpha,
              targetModules: loraConfig.targetModules,
            },
            trainingLoss,
            validationLoss,
          });
        } else {
          reject(new Error(`LoRA training process exited with code ${code}`));
        }
      });

      process.on('error', (error) => {
        reject(error);
      });
    });
  }

  private async createOllamaModel(
    runId: string,
    adapterPath: string,
    modelType: string
  ): Promise<void> {
    try {
      // Create Modelfile for Ollama
      const modelfile = `
FROM ${modelType}

# LoRA adapter
ADAPTER ${adapterPath}

# System prompt for Fine Print AI
SYSTEM "You are Fine Print AI's legal document analyzer. You identify problematic clauses in Terms of Service, Privacy Policies, and EULAs."

# Parameters
PARAMETER temperature 0.3
PARAMETER top_p 0.9
PARAMETER top_k 40
PARAMETER repeat_penalty 1.1
PARAMETER num_predict 2048
`;

      const modelfilePath = `/models/${runId}/Modelfile`;
      await fs.writeFile(modelfilePath, modelfile);

      // Create model in Ollama
      const response = await axios.post(`${this.ollamaEndpoint}/api/create`, {
        name: `fineprint-${modelType}-lora-${runId}`,
        modelfile,
      });

      logger.info('Ollama model created', { 
        runId, 
        modelName: `fineprint-${modelType}-lora-${runId}` 
      });

      // Test the model
      await this.testOllamaModel(`fineprint-${modelType}-lora-${runId}`);
    } catch (error) {
      logger.error('Failed to create Ollama model', { error, runId });
      throw error;
    }
  }

  private async testOllamaModel(modelName: string): Promise<void> {
    try {
      const response = await axios.post(`${this.ollamaEndpoint}/api/generate`, {
        model: modelName,
        prompt: "Analyze this clause: 'We may modify these terms at any time without notice.'",
        stream: false,
      });

      logger.info('Ollama model test successful', { 
        modelName, 
        response: response.data.response?.substring(0, 100) 
      });
    } catch (error) {
      logger.error('Ollama model test failed', { error, modelName });
    }
  }

  private async validateAdapter(runId: string, adapterPath: string): Promise<void> {
    try {
      // Check adapter files exist
      const requiredFiles = [
        'adapter_config.json',
        'adapter_model.bin',
        'tokenizer_config.json',
        'special_tokens_map.json',
      ];

      for (const file of requiredFiles) {
        const filePath = path.join(adapterPath, file);
        await fs.access(filePath);
      }

      // Load and validate adapter config
      const configPath = path.join(adapterPath, 'adapter_config.json');
      const configContent = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(configContent);

      if (!config.r || !config.lora_alpha || !config.target_modules) {
        throw new Error('Invalid adapter configuration');
      }

      // Check adapter size
      const stats = await fs.stat(path.join(adapterPath, 'adapter_model.bin'));
      const sizeMB = stats.size / (1024 * 1024);

      logger.info('Adapter validation successful', {
        runId,
        adapterPath,
        sizeMB: sizeMB.toFixed(2),
        rank: config.r,
        alpha: config.lora_alpha,
      });

      // Store validation result
      await this.redis.setex(
        `adapter:validated:${runId}`,
        86400,
        JSON.stringify({
          valid: true,
          sizeMB,
          config,
          timestamp: new Date().toISOString(),
        })
      );
    } catch (error) {
      logger.error('Adapter validation failed', { error, runId, adapterPath });
      throw new Error(`Adapter validation failed: ${(error as Error).message}`);
    }
  }

  async optimizeLoRAConfig(
    modelType: string,
    datasetSize: number,
    targetMetric: string = 'accuracy'
  ): Promise<any> {
    const modelConfig = this.modelRegistry.get(modelType);
    if (!modelConfig) {
      throw new Error(`Unknown model type: ${modelType}`);
    }

    // Heuristic-based optimization
    let rank = modelConfig.defaultRank;
    let alpha = modelConfig.defaultAlpha;

    // Adjust based on dataset size
    if (datasetSize < 1000) {
      rank = Math.max(8, rank / 2);
      alpha = rank * 2;
    } else if (datasetSize > 10000) {
      rank = Math.min(modelConfig.maxRank, rank * 1.5);
      alpha = rank * 2;
    }

    // Adjust based on target metric
    if (targetMetric === 'speed') {
      rank = Math.max(8, rank / 2);
    } else if (targetMetric === 'accuracy') {
      rank = Math.min(modelConfig.maxRank, rank * 1.2);
    }

    // Select target modules based on model architecture
    let targetModules = modelConfig.targetModules;
    if (targetMetric === 'speed') {
      // Use fewer modules for faster inference
      targetModules = targetModules.slice(0, 4);
    }

    return {
      rank: Math.round(rank),
      alpha: Math.round(alpha),
      dropout: datasetSize < 5000 ? 0.2 : 0.1,
      targetModules,
      reasoning: {
        datasetSize,
        targetMetric,
        adjustments: {
          rank: `Optimized for ${datasetSize} samples`,
          alpha: `Set to ${alpha / rank}x rank for stability`,
          dropout: datasetSize < 5000 ? 'Higher dropout for small dataset' : 'Standard dropout',
        },
      },
    };
  }

  async mergeAdapters(adapterPaths: string[], outputPath: string): Promise<void> {
    // Merge multiple LoRA adapters (ensemble)
    logger.info('Merging LoRA adapters', { count: adapterPaths.length });
    
    // Implementation would involve:
    // 1. Loading each adapter's weights
    // 2. Averaging or weighted combining
    // 3. Saving merged adapter
    
    // Placeholder for actual implementation
    await fs.mkdir(outputPath, { recursive: true });
  }
}