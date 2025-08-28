"""
Configuration settings for Fine Print AI LoRA Training Service
"""

import os
from typing import List, Optional
from pydantic import BaseSettings, Field


class Settings(BaseSettings):
    """Application settings"""
    
    # Application settings
    app_name: str = "Fine Print AI LoRA Training Service"
    version: str = "1.0.0"
    environment: str = Field(default="development", env="ENVIRONMENT")
    debug: bool = Field(default=False, env="DEBUG")
    
    # Server settings
    host: str = Field(default="0.0.0.0", env="HOST")
    port: int = Field(default=8008, env="PORT")
    log_level: str = Field(default="INFO", env="LOG_LEVEL")
    
    # CORS settings
    cors_origins: List[str] = Field(
        default=["http://localhost:3000", "http://localhost:8007"],
        env="CORS_ORIGINS"
    )
    
    # Database settings
    database_url: str = Field(
        default="postgresql://user:password@localhost:5432/lora_training",
        env="DATABASE_URL"
    )
    database_pool_size: int = Field(default=10, env="DATABASE_POOL_SIZE")
    database_max_overflow: int = Field(default=20, env="DATABASE_MAX_OVERFLOW")
    
    # Redis settings
    redis_url: str = Field(default="redis://localhost:6379/0", env="REDIS_URL")
    redis_password: Optional[str] = Field(default=None, env="REDIS_PASSWORD")
    
    # Training settings
    max_concurrent_jobs: int = Field(default=2, env="MAX_CONCURRENT_JOBS")
    default_model_name: str = Field(default="llama2:7b", env="DEFAULT_MODEL_NAME")
    models_storage_path: str = Field(
        default="/app/data/models",
        env="MODELS_STORAGE_PATH"
    )
    training_data_path: str = Field(
        default="/app/data/training",
        env="TRAINING_DATA_PATH"
    )
    
    # LoRA training parameters
    default_lora_rank: int = Field(default=16, env="DEFAULT_LORA_RANK")
    default_lora_alpha: int = Field(default=32, env="DEFAULT_LORA_ALPHA")
    default_lora_dropout: float = Field(default=0.1, env="DEFAULT_LORA_DROPOUT")
    default_learning_rate: float = Field(default=2e-4, env="DEFAULT_LEARNING_RATE")
    default_batch_size: int = Field(default=4, env="DEFAULT_BATCH_SIZE")
    default_max_seq_length: int = Field(default=2048, env="DEFAULT_MAX_SEQ_LENGTH")
    default_epochs: int = Field(default=3, env="DEFAULT_EPOCHS")
    
    # GPU settings
    cuda_visible_devices: Optional[str] = Field(default=None, env="CUDA_VISIBLE_DEVICES")
    use_fp16: bool = Field(default=True, env="USE_FP16")
    use_gradient_checkpointing: bool = Field(default=True, env="USE_GRADIENT_CHECKPOINTING")
    
    # Ollama settings
    ollama_url: str = Field(default="http://localhost:11434", env="OLLAMA_URL")
    ollama_timeout: int = Field(default=300, env="OLLAMA_TIMEOUT")
    
    # Monitoring settings
    enable_wandb: bool = Field(default=False, env="ENABLE_WANDB")
    wandb_project: str = Field(default="fineprintai-lora", env="WANDB_PROJECT")
    wandb_api_key: Optional[str] = Field(default=None, env="WANDB_API_KEY")
    
    # Storage settings (MinIO/S3)
    s3_endpoint: Optional[str] = Field(default=None, env="S3_ENDPOINT")
    s3_access_key: Optional[str] = Field(default=None, env="S3_ACCESS_KEY")
    s3_secret_key: Optional[str] = Field(default=None, env="S3_SECRET_KEY")
    s3_bucket_name: str = Field(default="lora-models", env="S3_BUCKET_NAME")
    
    # Security settings
    api_key: Optional[str] = Field(default=None, env="API_KEY")
    jwt_secret: Optional[str] = Field(default=None, env="JWT_SECRET")
    
    # Business-specific settings
    business_types = [
        "legal_analysis",
        "marketing_content",
        "sales_communication", 
        "customer_support",
        "code_generation"
    ]
    
    # Model configurations for different business types
    business_model_configs = {
        "legal_analysis": {
            "base_models": ["llama2:7b", "mistral:7b", "codellama:7b"],
            "target_modules": ["q_proj", "v_proj", "k_proj", "o_proj"],
            "rank": 16,
            "alpha": 32,
            "dropout": 0.05,
            "learning_rate": 1e-4,
            "max_seq_length": 4096,
            "batch_size": 2
        },
        "marketing_content": {
            "base_models": ["llama2:7b", "mistral:7b"],
            "target_modules": ["q_proj", "v_proj", "gate_proj", "up_proj", "down_proj"],
            "rank": 32,
            "alpha": 64,
            "dropout": 0.1,
            "learning_rate": 2e-4,
            "max_seq_length": 2048,
            "batch_size": 4
        },
        "sales_communication": {
            "base_models": ["llama2:7b", "mistral:7b"],
            "target_modules": ["q_proj", "v_proj", "k_proj", "o_proj"],
            "rank": 16,
            "alpha": 32,
            "dropout": 0.1,
            "learning_rate": 2e-4,
            "max_seq_length": 1024,
            "batch_size": 8
        },
        "customer_support": {
            "base_models": ["llama2:7b", "mistral:7b"],
            "target_modules": ["q_proj", "v_proj", "k_proj", "o_proj"],
            "rank": 16,
            "alpha": 32,
            "dropout": 0.1,
            "learning_rate": 2e-4,
            "max_seq_length": 1024,
            "batch_size": 8
        },
        "code_generation": {
            "base_models": ["codellama:7b", "codellama:13b"],
            "target_modules": ["q_proj", "v_proj", "k_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
            "rank": 64,
            "alpha": 128,
            "dropout": 0.05,
            "learning_rate": 1e-4,
            "max_seq_length": 4096,
            "batch_size": 2
        }
    }
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False

# Create global settings instance
settings = Settings()

# Ensure required directories exist
os.makedirs(settings.models_storage_path, exist_ok=True)
os.makedirs(settings.training_data_path, exist_ok=True)