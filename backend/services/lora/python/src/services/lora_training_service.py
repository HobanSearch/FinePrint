"""
LoRA Training Service with Unsloth Integration
Production-ready LoRA fine-tuning for business-specific model adaptations
"""

import asyncio
import json
import os
import time
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Any, Optional, List, Tuple
import traceback

import torch
import psutil
from fastapi import BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
import redis.asyncio as aioredis

from ..core.config import settings
from ..core.logging_config import get_logger
from ..models.schemas import (
    TrainingJobRequest, TrainingJobStatus, TrainingStatus,
    TrainingMetrics, BusinessType, LoRAConfig, TrainingConfig, UnslothConfig
)

logger = get_logger("lora_training")


class LoRATrainingService:
    """Production LoRA training service with Unsloth"""
    
    def __init__(self, db: AsyncSession, redis: aioredis.Redis, metrics):
        self.db = db
        self.redis = redis
        self.metrics = metrics
        self.training_jobs: Dict[str, Dict[str, Any]] = {}
        self.active_jobs = 0
        self.max_concurrent_jobs = settings.max_concurrent_jobs
        
        # Initialize GPU monitoring
        self.gpu_available = torch.cuda.is_available()
        self.gpu_count = torch.cuda.device_count() if self.gpu_available else 0
        
        logger.info(
            "LoRA Training Service initialized",
            gpu_available=self.gpu_available,
            gpu_count=self.gpu_count,
            max_concurrent_jobs=self.max_concurrent_jobs
        )
    
    async def initialize(self):
        """Initialize the training service"""
        try:
            # Ensure directories exist
            os.makedirs(settings.training_data_path, exist_ok=True)
            os.makedirs(settings.models_storage_path, exist_ok=True)
            
            # Initialize job tracking in Redis
            await self.redis.delete("lora:active_jobs")
            await self.redis.delete("lora:job_queue")
            
            # Restore any incomplete jobs from Redis
            await self._restore_incomplete_jobs()
            
            logger.info("LoRA Training Service initialized successfully")
            
        except Exception as e:
            logger.error("Failed to initialize LoRA Training Service", error=str(e))
            raise
    
    async def start_training_job(
        self, 
        request: TrainingJobRequest,
        background_tasks: BackgroundTasks
    ) -> str:
        """Start a new LoRA training job"""
        job_id = str(uuid.uuid4())
        
        try:
            # Validate request
            await self._validate_training_request(request)
            
            # Create job record
            job_data = {
                "job_id": job_id,
                "job_name": request.job_name,
                "business_type": request.business_type.value,
                "base_model": request.base_model,
                "status": TrainingStatus.QUEUED.value,
                "created_at": datetime.utcnow().isoformat(),
                "request": request.dict(),
                "progress": 0.0,
                "priority": request.priority
            }
            
            # Store job in Redis
            await self.redis.hset(
                f"lora:job:{job_id}",
                mapping={k: json.dumps(v) for k, v in job_data.items()}
            )
            
            # Add to job queue
            await self.redis.zadd(
                "lora:job_queue",
                {job_id: request.priority}
            )
            
            # Store in memory
            self.training_jobs[job_id] = job_data
            
            # Update metrics
            self.metrics.record_training_job(request.business_type.value, "queued")
            
            # Schedule job execution
            background_tasks.add_task(self._execute_training_job, job_id)
            
            logger.info(
                "Training job queued",
                job_id=job_id,
                job_name=request.job_name,
                business_type=request.business_type.value,
                priority=request.priority
            )
            
            return job_id
            
        except Exception as e:
            logger.error("Failed to start training job", job_id=job_id, error=str(e))
            # Update job status to failed
            if job_id in self.training_jobs:
                self.training_jobs[job_id]["status"] = TrainingStatus.FAILED.value
                self.training_jobs[job_id]["error_message"] = str(e)
            raise
    
    async def get_job_status(self, job_id: str) -> TrainingJobStatus:
        """Get training job status"""
        try:
            # Try memory first
            if job_id in self.training_jobs:
                job_data = self.training_jobs[job_id]
            else:
                # Try Redis
                redis_data = await self.redis.hgetall(f"lora:job:{job_id}")
                if not redis_data:
                    raise ValueError(f"Job {job_id} not found")
                
                job_data = {k: json.loads(v) for k, v in redis_data.items()}
                self.training_jobs[job_id] = job_data
            
            # Get latest metrics if available
            latest_metrics = None
            metrics_data = await self.redis.get(f"lora:job:{job_id}:metrics")
            if metrics_data:
                metrics_dict = json.loads(metrics_data)
                latest_metrics = TrainingMetrics(**metrics_dict)
            
            return TrainingJobStatus(
                job_id=job_data["job_id"],
                job_name=job_data["job_name"],
                business_type=BusinessType(job_data["business_type"]),
                status=TrainingStatus(job_data["status"]),
                progress_percentage=job_data.get("progress", 0.0),
                current_epoch=job_data.get("current_epoch"),
                total_epochs=job_data.get("total_epochs"),
                current_step=job_data.get("current_step"),
                total_steps=job_data.get("total_steps"),
                elapsed_time=job_data.get("elapsed_time"),
                estimated_remaining_time=job_data.get("estimated_remaining_time"),
                latest_metrics=latest_metrics,
                error_message=job_data.get("error_message"),
                created_at=datetime.fromisoformat(job_data["created_at"]),
                started_at=datetime.fromisoformat(job_data["started_at"]) if job_data.get("started_at") else None,
                completed_at=datetime.fromisoformat(job_data["completed_at"]) if job_data.get("completed_at") else None
            )
            
        except Exception as e:
            logger.error("Failed to get job status", job_id=job_id, error=str(e))
            raise
    
    async def cancel_job(self, job_id: str):
        """Cancel a training job"""
        try:
            if job_id not in self.training_jobs:
                job_data = await self.redis.hgetall(f"lora:job:{job_id}")
                if not job_data:
                    raise ValueError(f"Job {job_id} not found")
                self.training_jobs[job_id] = {k: json.loads(v) for k, v in job_data.items()}
            
            job_data = self.training_jobs[job_id]
            current_status = TrainingStatus(job_data["status"])
            
            if current_status in [TrainingStatus.COMPLETED, TrainingStatus.FAILED, TrainingStatus.CANCELLED]:
                raise ValueError(f"Cannot cancel job in status: {current_status.value}")
            
            # Update status
            job_data["status"] = TrainingStatus.CANCELLED.value
            job_data["completed_at"] = datetime.utcnow().isoformat()
            
            # Update Redis
            await self.redis.hset(
                f"lora:job:{job_id}",
                mapping={k: json.dumps(v) for k, v in job_data.items()}
            )
            
            # Remove from queue if queued
            if current_status == TrainingStatus.QUEUED:
                await self.redis.zrem("lora:job_queue", job_id)
            
            # Update metrics
            self.metrics.record_training_job(job_data["business_type"], "cancelled")
            
            logger.info("Training job cancelled", job_id=job_id)
            
        except Exception as e:
            logger.error("Failed to cancel job", job_id=job_id, error=str(e))
            raise
    
    async def get_job_logs(self, job_id: str, lines: int = 100) -> List[str]:
        """Get training job logs"""
        try:
            log_key = f"lora:job:{job_id}:logs"
            logs = await self.redis.lrange(log_key, -lines, -1)
            return [json.loads(log) for log in logs]
            
        except Exception as e:
            logger.error("Failed to get job logs", job_id=job_id, error=str(e))
            return []
    
    async def health_check(self) -> bool:
        """Check training service health"""
        try:
            # Check GPU availability
            if self.gpu_available:
                gpu_ok = torch.cuda.is_available()
                if not gpu_ok:
                    return False
            
            # Check Redis connectivity
            await self.redis.ping()
            
            # Check system resources
            memory = psutil.virtual_memory()
            if memory.percent > 95:
                logger.warning("High memory usage", usage_percent=memory.percent)
                return False
            
            return True
            
        except Exception as e:
            logger.error("Health check failed", error=str(e))
            return False
    
    async def cleanup(self):
        """Cleanup training service"""
        try:
            # Cancel any running jobs
            for job_id, job_data in self.training_jobs.items():
                if job_data["status"] in [TrainingStatus.TRAINING.value, TrainingStatus.PREPARING.value]:
                    await self.cancel_job(job_id)
            
            logger.info("LoRA Training Service cleaned up")
            
        except Exception as e:
            logger.error("Error during cleanup", error=str(e))
    
    async def _execute_training_job(self, job_id: str):
        """Execute training job in background"""
        try:
            # Check if we can start the job
            if self.active_jobs >= self.max_concurrent_jobs:
                logger.info("Maximum concurrent jobs reached, job will wait", job_id=job_id)
                return
            
            self.active_jobs += 1
            
            # Update metrics
            self.metrics.update_active_jobs(self.active_jobs)
            
            # Get job data
            job_data = self.training_jobs[job_id]
            request = TrainingJobRequest(**job_data["request"])
            
            # Update status to preparing
            await self._update_job_status(job_id, TrainingStatus.PREPARING, started_at=datetime.utcnow())
            
            # Log job start
            await self._log_to_job(job_id, f"Starting training job: {request.job_name}")
            
            # Execute training
            start_time = time.time()
            
            try:
                await self._run_training(job_id, request)
                
                # Training completed successfully
                duration = time.time() - start_time
                await self._update_job_status(
                    job_id, 
                    TrainingStatus.COMPLETED,
                    completed_at=datetime.utcnow(),
                    elapsed_time=duration,
                    progress=100.0
                )
                
                # Update metrics
                self.metrics.record_training_job(request.business_type.value, "completed")
                self.metrics.record_training_duration(request.business_type.value, duration)
                
                await self._log_to_job(job_id, f"Training completed successfully in {duration:.2f} seconds")
                
            except Exception as e:
                # Training failed
                duration = time.time() - start_time
                error_msg = str(e)
                
                await self._update_job_status(
                    job_id,
                    TrainingStatus.FAILED,
                    completed_at=datetime.utcnow(),
                    elapsed_time=duration,
                    error_message=error_msg
                )
                
                # Update metrics
                self.metrics.record_training_job(request.business_type.value, "failed")
                
                await self._log_to_job(job_id, f"Training failed: {error_msg}")
                logger.error("Training job failed", job_id=job_id, error=error_msg)
        
        except Exception as e:
            logger.error("Error executing training job", job_id=job_id, error=str(e))
        
        finally:
            self.active_jobs -= 1
            self.metrics.update_active_jobs(self.active_jobs)
    
    async def _run_training(self, job_id: str, request: TrainingJobRequest):
        """Run the actual training process using Unsloth"""
        try:
            await self._log_to_job(job_id, "Initializing Unsloth training environment")
            
            # Import Unsloth (done here to avoid import errors if not available)
            try:
                from unsloth import FastLanguageModel, is_bfloat16_supported
                from unsloth.chat_templates import get_chat_template
                from transformers import TrainingArguments
                from trl import SFTTrainer
                import datasets
            except ImportError as e:
                raise ImportError(f"Unsloth not available: {e}")
            
            # Update status to training
            await self._update_job_status(job_id, TrainingStatus.TRAINING)
            
            # Get business-specific configuration
            business_config = settings.business_model_configs.get(request.business_type.value, {})
            
            # Merge configurations
            lora_config = request.lora_config or LoRAConfig()
            training_config = request.training_config or TrainingConfig()
            unsloth_config = request.unsloth_config or UnslothConfig()
            
            # Apply business-specific defaults
            if business_config:
                for key, value in business_config.items():
                    if hasattr(lora_config, key):
                        setattr(lora_config, key, value)
                    elif hasattr(training_config, key):
                        setattr(training_config, key, value)
            
            await self._log_to_job(job_id, f"Loading base model: {request.base_model}")
            
            # Load model and tokenizer with Unsloth
            model, tokenizer = FastLanguageModel.from_pretrained(
                model_name=request.base_model,
                max_seq_length=training_config.max_seq_length,
                dtype=None,  # Unsloth will choose the best dtype
                load_in_4bit=unsloth_config.use_4bit,
                trust_remote_code=True
            )
            
            await self._log_to_job(job_id, "Model loaded successfully")
            
            # Add LoRA adapters
            model = FastLanguageModel.get_peft_model(
                model,
                r=lora_config.rank,
                target_modules=lora_config.target_modules,
                lora_alpha=lora_config.alpha,
                lora_dropout=lora_config.dropout,
                bias=lora_config.bias,
                use_gradient_checkpointing=unsloth_config.use_gradient_checkpointing,
                random_state=unsloth_config.random_state,
                use_rslora=unsloth_config.use_rslora,
                loftq_config=unsloth_config.loftq_config,
            )\n            \n            await self._log_to_job(job_id, \"LoRA adapters added\")\n            \n            # Load and prepare dataset\n            await self._log_to_job(job_id, \"Loading training dataset\")\n            dataset = await self._load_training_dataset(job_id, request.dataset_config)\n            \n            # Create training arguments\n            output_dir = Path(settings.models_storage_path) / job_id\n            output_dir.mkdir(parents=True, exist_ok=True)\n            \n            training_args = TrainingArguments(\n                per_device_train_batch_size=training_config.batch_size,\n                per_device_eval_batch_size=training_config.batch_size,\n                gradient_accumulation_steps=training_config.gradient_accumulation_steps,\n                warmup_steps=training_config.warmup_steps,\n                num_train_epochs=training_config.num_epochs,\n                learning_rate=training_config.learning_rate,\n                fp16=not is_bfloat16_supported(),\n                bf16=is_bfloat16_supported(),\n                logging_steps=training_config.logging_steps,\n                optim=\"adamw_8bit\",\n                weight_decay=training_config.weight_decay,\n                lr_scheduler_type=training_config.lr_scheduler_type,\n                seed=unsloth_config.random_state,\n                output_dir=str(output_dir),\n                save_steps=training_config.save_steps,\n                evaluation_strategy=\"steps\" if \"validation\" in dataset else \"no\",\n                eval_steps=training_config.eval_steps if \"validation\" in dataset else None,\n                save_total_limit=3,\n                load_best_model_at_end=True if \"validation\" in dataset else False,\n                metric_for_best_model=\"eval_loss\" if \"validation\" in dataset else None,\n                greater_is_better=False,\n                report_to=None,  # Disable wandb for now\n                dataloader_num_workers=training_config.dataloader_num_workers,\n                remove_unused_columns=training_config.remove_unused_columns,\n            )\n            \n            # Create trainer\n            trainer = SFTTrainer(\n                model=model,\n                tokenizer=tokenizer,\n                train_dataset=dataset[\"train\"],\n                eval_dataset=dataset.get(\"validation\"),\n                dataset_text_field=\"text\",\n                max_seq_length=training_config.max_seq_length,\n                dataset_num_proc=2,\n                packing=False,\n                args=training_args,\n            )\n            \n            await self._log_to_job(job_id, \"Starting training...\")\n            \n            # Add training progress callback\n            trainer.add_callback(TrainingProgressCallback(self, job_id, training_config.num_epochs))\n            \n            # Start training\n            trainer.train()\n            \n            await self._log_to_job(job_id, \"Training completed, saving model...\")\n            \n            # Save model\n            model_path = output_dir / \"final_model\"\n            model.save_pretrained(str(model_path))\n            tokenizer.save_pretrained(str(model_path))\n            \n            # Save to GGUF format for Ollama compatibility\n            gguf_path = output_dir / \"model.gguf\"\n            model.save_pretrained_gguf(str(gguf_path), tokenizer, quantization_method=\"q4_k_m\")\n            \n            await self._log_to_job(job_id, f\"Model saved to {model_path}\")\n            \n            # Update job with model path\n            job_data = self.training_jobs[job_id]\n            job_data[\"model_path\"] = str(model_path)\n            job_data[\"gguf_path\"] = str(gguf_path)\n            \n            await self._update_job_data(job_id, job_data)\n            \n        except Exception as e:\n            await self._log_to_job(job_id, f\"Training error: {str(e)}\")\n            logger.error(\"Training error\", job_id=job_id, error=str(e), traceback=traceback.format_exc())\n            raise\n    \n    async def _load_training_dataset(self, job_id: str, dataset_config) -> Dict[str, Any]:\n        \"\"\"Load and prepare training dataset\"\"\"\n        try:\n            import datasets\n            \n            # Load dataset based on type\n            if dataset_config.dataset_type == \"json\":\n                if dataset_config.data_source.startswith(\"http\"):\n                    # Load from URL\n                    dataset = datasets.load_dataset(\n                        \"json\",\n                        data_files=dataset_config.data_source,\n                        split=\"train\"\n                    )\n                else:\n                    # Load from local file\n                    dataset = datasets.load_dataset(\n                        \"json\",\n                        data_files=dataset_config.data_source,\n                        split=\"train\"\n                    )\n            elif dataset_config.dataset_type == \"csv\":\n                dataset = datasets.load_dataset(\n                    \"csv\",\n                    data_files=dataset_config.data_source,\n                    split=\"train\"\n                )\n            else:\n                # Try to load as HuggingFace dataset\n                dataset = datasets.load_dataset(dataset_config.data_source, split=\"train\")\n            \n            # Limit samples if specified\n            if dataset_config.max_samples and len(dataset) > dataset_config.max_samples:\n                dataset = dataset.select(range(dataset_config.max_samples))\n            \n            # Shuffle if requested\n            if dataset_config.shuffle:\n                dataset = dataset.shuffle(seed=dataset_config.seed)\n            \n            # Split into train/validation\n            if dataset_config.validation_split > 0:\n                split_dataset = dataset.train_test_split(\n                    test_size=dataset_config.validation_split,\n                    seed=dataset_config.seed\n                )\n                return {\n                    \"train\": split_dataset[\"train\"],\n                    \"validation\": split_dataset[\"test\"]\n                }\n            \n            return {\"train\": dataset}\n            \n        except Exception as e:\n            await self._log_to_job(job_id, f\"Failed to load dataset: {str(e)}\")\n            raise\n    \n    async def _validate_training_request(self, request: TrainingJobRequest):\n        \"\"\"Validate training request\"\"\"\n        # Check if business type is supported\n        if request.business_type.value not in settings.business_types:\n            raise ValueError(f\"Unsupported business type: {request.business_type.value}\")\n        \n        # Check if base model is supported\n        business_config = settings.business_model_configs.get(request.business_type.value, {})\n        if business_config and \"base_models\" in business_config:\n            if request.base_model not in business_config[\"base_models\"]:\n                raise ValueError(f\"Base model {request.base_model} not supported for {request.business_type.value}\")\n        \n        # Validate dataset configuration\n        if not request.dataset_config.data_source:\n            raise ValueError(\"Data source is required\")\n    \n    async def _update_job_status(\n        self, \n        job_id: str, \n        status: TrainingStatus, \n        **kwargs\n    ):\n        \"\"\"Update job status\"\"\"\n        job_data = self.training_jobs[job_id]\n        job_data[\"status\"] = status.value\n        \n        for key, value in kwargs.items():\n            if isinstance(value, datetime):\n                job_data[key] = value.isoformat()\n            else:\n                job_data[key] = value\n        \n        # Update Redis\n        await self.redis.hset(\n            f\"lora:job:{job_id}\",\n            mapping={k: json.dumps(v) for k, v in job_data.items()}\n        )\n    \n    async def _update_job_data(self, job_id: str, data: Dict[str, Any]):\n        \"\"\"Update job data\"\"\"\n        self.training_jobs[job_id] = data\n        \n        # Update Redis\n        await self.redis.hset(\n            f\"lora:job:{job_id}\",\n            mapping={k: json.dumps(v) for k, v in data.items()}\n        )\n    \n    async def _log_to_job(self, job_id: str, message: str, level: str = \"info\"):\n        \"\"\"Log message to job logs\"\"\"\n        log_entry = {\n            \"timestamp\": datetime.utcnow().isoformat(),\n            \"level\": level,\n            \"message\": message\n        }\n        \n        # Store in Redis\n        await self.redis.lpush(\n            f\"lora:job:{job_id}:logs\",\n            json.dumps(log_entry)\n        )\n        \n        # Limit log size (keep last 1000 entries)\n        await self.redis.ltrim(f\"lora:job:{job_id}:logs\", 0, 999)\n        \n        # Also log to main logger\n        logger.info(f\"Job {job_id}: {message}\")\n    \n    async def _restore_incomplete_jobs(self):\n        \"\"\"Restore incomplete jobs from Redis\"\"\"\n        try:\n            # Get all job keys\n            job_keys = await self.redis.keys(\"lora:job:*\")\n            \n            for key in job_keys:\n                if \":logs\" in key or \":metrics\" in key:\n                    continue\n                \n                job_data = await self.redis.hgetall(key)\n                if job_data:\n                    job_data = {k: json.loads(v) for k, v in job_data.items()}\n                    job_id = job_data[\"job_id\"]\n                    \n                    # Check if job is incomplete\n                    status = TrainingStatus(job_data[\"status\"])\n                    if status in [TrainingStatus.QUEUED, TrainingStatus.PREPARING, TrainingStatus.TRAINING]:\n                        # Mark as failed on restart\n                        job_data[\"status\"] = TrainingStatus.FAILED.value\n                        job_data[\"error_message\"] = \"Service restarted during training\"\n                        job_data[\"completed_at\"] = datetime.utcnow().isoformat()\n                        \n                        await self.redis.hset(\n                            f\"lora:job:{job_id}\",\n                            mapping={k: json.dumps(v) for k, v in job_data.items()}\n                        )\n                    \n                    self.training_jobs[job_id] = job_data\n            \n            logger.info(f\"Restored {len(self.training_jobs)} jobs from Redis\")\n            \n        except Exception as e:\n            logger.error(\"Failed to restore jobs from Redis\", error=str(e))\n\n\nclass TrainingProgressCallback:\n    \"\"\"Callback to track training progress\"\"\"\n    \n    def __init__(self, service: LoRATrainingService, job_id: str, total_epochs: int):\n        self.service = service\n        self.job_id = job_id\n        self.total_epochs = total_epochs\n        self.start_time = time.time()\n    \n    def on_epoch_begin(self, args, state, control, **kwargs):\n        \"\"\"Called at the beginning of each epoch\"\"\"\n        asyncio.create_task(self.service._log_to_job(\n            self.job_id,\n            f\"Starting epoch {state.epoch + 1}/{self.total_epochs}\"\n        ))\n    \n    def on_log(self, args, state, control, logs=None, **kwargs):\n        \"\"\"Called when logging\"\"\"\n        if logs:\n            # Calculate progress\n            progress = (state.global_step / state.max_steps) * 100 if state.max_steps > 0 else 0\n            \n            # Calculate time estimates\n            elapsed_time = time.time() - self.start_time\n            if state.global_step > 0:\n                time_per_step = elapsed_time / state.global_step\n                remaining_steps = state.max_steps - state.global_step\n                estimated_remaining = time_per_step * remaining_steps\n            else:\n                estimated_remaining = None\n            \n            # Create metrics object\n            metrics = TrainingMetrics(\n                epoch=state.epoch,\n                step=state.global_step,\n                loss=logs.get(\"train_loss\", 0.0),\n                learning_rate=logs.get(\"learning_rate\", 0.0),\n                grad_norm=logs.get(\"grad_norm\"),\n                eval_loss=logs.get(\"eval_loss\"),\n                eval_accuracy=logs.get(\"eval_accuracy\"),\n                eval_f1_score=logs.get(\"eval_f1_score\"),\n                eval_bleu_score=logs.get(\"eval_bleu_score\")\n            )\n            \n            # Update job status\n            job_data = self.service.training_jobs[self.job_id]\n            job_data.update({\n                \"progress\": progress,\n                \"current_epoch\": state.epoch + 1,\n                \"total_epochs\": self.total_epochs,\n                \"current_step\": state.global_step,\n                \"total_steps\": state.max_steps,\n                \"elapsed_time\": elapsed_time,\n                \"estimated_remaining_time\": estimated_remaining\n            })\n            \n            # Store metrics in Redis\n            asyncio.create_task(self.service.redis.set(\n                f\"lora:job:{self.job_id}:metrics\",\n                json.dumps(metrics.dict()),\n                ex=3600  # Expire after 1 hour\n            ))\n            \n            # Update job data\n            asyncio.create_task(self.service._update_job_data(self.job_id, job_data))\n            \n            # Update Prometheus metrics\n            self.service.metrics.update_training_loss(\n                self.job_id,\n                state.epoch,\n                logs.get(\"train_loss\", 0.0)\n            )"