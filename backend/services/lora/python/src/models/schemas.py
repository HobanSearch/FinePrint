"""
Pydantic schemas for Fine Print AI LoRA Training Service
"""

from datetime import datetime
from typing import Dict, List, Optional, Any, Union
from enum import Enum
from pydantic import BaseModel, Field, validator


class BusinessType(str, Enum):
    """Business-specific adapter types"""
    LEGAL_ANALYSIS = "legal_analysis"
    MARKETING_CONTENT = "marketing_content"  
    SALES_COMMUNICATION = "sales_communication"
    CUSTOMER_SUPPORT = "customer_support"
    CODE_GENERATION = "code_generation"


class TrainingStatus(str, Enum):
    """Training job status"""
    QUEUED = "queued"
    INITIALIZING = "initializing"
    TRAINING = "training"
    EVALUATING = "evaluating"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ModelStatus(str, Enum):
    """Model status"""
    DRAFT = "draft"
    TRAINING = "training"
    TRAINED = "trained"
    DEPLOYED = "deployed"
    ARCHIVED = "archived"


class DeploymentStatus(str, Enum):
    """Deployment status"""
    PENDING = "pending"
    DEPLOYING = "deploying"
    ACTIVE = "active"
    FAILED = "failed"
    INACTIVE = "inactive"


# Training request schemas
class LoRAConfig(BaseModel):
    """LoRA configuration parameters"""
    rank: int = Field(default=16, ge=1, le=512, description="LoRA rank")
    alpha: int = Field(default=32, ge=1, le=1024, description="LoRA alpha")
    dropout: float = Field(default=0.1, ge=0.0, le=1.0, description="LoRA dropout")
    target_modules: List[str] = Field(
        default=["q_proj", "v_proj", "k_proj", "o_proj"],
        description="Target modules for LoRA"
    )
    bias: str = Field(default="none", description="Bias configuration")
    task_type: str = Field(default="CAUSAL_LM", description="Task type")


class TrainingConfig(BaseModel):
    """Training configuration parameters"""
    epochs: int = Field(default=3, ge=1, le=100, description="Number of training epochs")
    learning_rate: float = Field(default=2e-4, gt=0, le=1, description="Learning rate")
    batch_size: int = Field(default=4, ge=1, le=64, description="Training batch size")
    max_seq_length: int = Field(default=2048, ge=128, le=8192, description="Maximum sequence length")
    warmup_steps: int = Field(default=100, ge=0, description="Number of warmup steps")
    weight_decay: float = Field(default=0.01, ge=0, le=1, description="Weight decay")
    gradient_clipping: float = Field(default=1.0, gt=0, description="Gradient clipping value")
    save_steps: int = Field(default=500, ge=1, description="Save checkpoint every N steps")
    eval_steps: int = Field(default=100, ge=1, description="Evaluation every N steps")
    logging_steps: int = Field(default=10, ge=1, description="Log every N steps")
    use_fp16: bool = Field(default=True, description="Use FP16 training")
    use_gradient_checkpointing: bool = Field(default=True, description="Use gradient checkpointing")
    dataloader_num_workers: int = Field(default=4, ge=0, description="DataLoader workers")


class TrainingDataSample(BaseModel):
    """Individual training data sample"""
    input_text: str = Field(..., min_length=1, description="Input text")
    output_text: str = Field(..., min_length=1, description="Expected output text")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Additional metadata")


class TrainingJobRequest(BaseModel):
    """Request to start a training job"""
    job_name: str = Field(..., min_length=1, max_length=255, description="Job name")
    business_type: BusinessType = Field(..., description="Business type for the adapter")
    base_model: str = Field(..., description="Base model to fine-tune")
    lora_config: LoRAConfig = Field(..., description="LoRA configuration")
    training_config: TrainingConfig = Field(..., description="Training configuration")
    training_data_id: Optional[str] = Field(default=None, description="Training dataset ID")
    training_samples: Optional[List[TrainingDataSample]] = Field(
        default=None, 
        description="Training samples (if not using dataset ID)"
    )
    validation_split: float = Field(default=0.2, ge=0.0, le=0.5, description="Validation split ratio")
    description: Optional[str] = Field(default=None, description="Job description")
    tags: Optional[List[str]] = Field(default=None, description="Job tags")
    
    @validator('training_samples', 'training_data_id')
    def validate_training_data(cls, v, values):
        """Ensure either training_data_id or training_samples is provided"""
        training_data_id = values.get('training_data_id')
        training_samples = v
        
        if not training_data_id and not training_samples:
            raise ValueError("Either training_data_id or training_samples must be provided")
        
        if training_data_id and training_samples:
            raise ValueError("Only one of training_data_id or training_samples should be provided")
        
        return v


class TrainingJobResponse(BaseModel):
    """Response for training job creation"""
    job_id: str = Field(..., description="Unique job identifier")
    status: TrainingStatus = Field(..., description="Initial job status")
    message: str = Field(..., description="Response message")


class TrainingMetrics(BaseModel):
    """Training metrics"""
    epoch: int = Field(..., description="Current epoch")
    step: int = Field(..., description="Current step")
    train_loss: float = Field(..., description="Training loss")
    eval_loss: Optional[float] = Field(default=None, description="Evaluation loss")
    learning_rate: float = Field(..., description="Current learning rate")
    grad_norm: Optional[float] = Field(default=None, description="Gradient norm")
    samples_per_second: Optional[float] = Field(default=None, description="Training speed")
    eval_accuracy: Optional[float] = Field(default=None, description="Evaluation accuracy")
    eval_perplexity: Optional[float] = Field(default=None, description="Evaluation perplexity")


class TrainingJobStatus(BaseModel):
    """Training job status response"""
    job_id: str = Field(..., description="Job identifier")
    status: TrainingStatus = Field(..., description="Current job status")
    progress: float = Field(..., ge=0.0, le=1.0, description="Training progress (0-1)")
    current_epoch: Optional[int] = Field(default=None, description="Current epoch")
    total_epochs: Optional[int] = Field(default=None, description="Total epochs")
    current_step: Optional[int] = Field(default=None, description="Current step")
    total_steps: Optional[int] = Field(default=None, description="Total steps")
    metrics: Optional[TrainingMetrics] = Field(default=None, description="Latest metrics")
    error_message: Optional[str] = Field(default=None, description="Error message if failed")
    started_at: Optional[datetime] = Field(default=None, description="Job start time")
    completed_at: Optional[datetime] = Field(default=None, description="Job completion time")
    estimated_time_remaining: Optional[int] = Field(default=None, description="ETA in seconds")


# Model registry schemas
class ModelMetadata(BaseModel):
    """Model metadata"""
    base_model: str = Field(..., description="Base model name")
    business_type: BusinessType = Field(..., description="Business type")
    lora_config: LoRAConfig = Field(..., description="LoRA configuration used")
    training_config: TrainingConfig = Field(..., description="Training configuration used")
    training_metrics: Dict[str, Any] = Field(..., description="Final training metrics")
    performance_metrics: Dict[str, Any] = Field(..., description="Performance benchmarks")
    file_size_mb: float = Field(..., description="Model file size in MB")
    parameter_count: int = Field(..., description="Number of parameters")


class ModelRegistrationRequest(BaseModel):
    """Request to register a trained model"""
    model_name: str = Field(..., min_length=1, max_length=255, description="Model name")
    version: str = Field(..., description="Model version")
    job_id: str = Field(..., description="Training job ID")
    model_path: str = Field(..., description="Path to model files")
    metadata: ModelMetadata = Field(..., description="Model metadata")
    description: Optional[str] = Field(default=None, description="Model description")
    tags: Optional[List[str]] = Field(default=None, description="Model tags")


class RegisteredModel(BaseModel):
    """Registered model information"""
    model_id: str = Field(..., description="Unique model identifier")
    model_name: str = Field(..., description="Model name")
    version: str = Field(..., description="Model version")
    status: ModelStatus = Field(..., description="Model status")
    metadata: ModelMetadata = Field(..., description="Model metadata")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")
    download_url: Optional[str] = Field(default=None, description="Model download URL")


# Deployment schemas
class AdapterDeploymentRequest(BaseModel):
    """Request to deploy LoRA adapter"""
    model_id: str = Field(..., description="Registered model ID")
    deployment_name: str = Field(..., min_length=1, max_length=255, description="Deployment name")
    target_environment: str = Field(default="production", description="Target environment")
    ollama_model_name: str = Field(..., description="Target Ollama model name")
    resource_limits: Optional[Dict[str, Any]] = Field(default=None, description="Resource limits")
    auto_scaling: Optional[Dict[str, Any]] = Field(default=None, description="Auto-scaling config")


class DeploymentInfo(BaseModel):
    """Deployment information"""
    deployment_id: str = Field(..., description="Unique deployment identifier")
    deployment_name: str = Field(..., description="Deployment name")
    model_id: str = Field(..., description="Associated model ID")
    status: DeploymentStatus = Field(..., description="Deployment status")
    endpoint_url: Optional[str] = Field(default=None, description="Inference endpoint URL")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")


# Evaluation schemas
class EvaluationConfig(BaseModel):
    """Evaluation configuration"""
    evaluation_type: str = Field(..., description="Type of evaluation")
    test_dataset_id: Optional[str] = Field(default=None, description="Test dataset ID")
    test_samples: Optional[List[TrainingDataSample]] = Field(default=None, description="Test samples")
    metrics: List[str] = Field(..., description="Metrics to compute")
    batch_size: int = Field(default=8, ge=1, description="Evaluation batch size")


class EvaluationRequest(BaseModel):
    """Request to evaluate a model"""
    model_id: str = Field(..., description="Model to evaluate")
    evaluation_name: str = Field(..., description="Evaluation name")
    config: EvaluationConfig = Field(..., description="Evaluation configuration")
    description: Optional[str] = Field(default=None, description="Evaluation description")


class EvaluationResult(BaseModel):
    """Evaluation results"""
    evaluation_id: str = Field(..., description="Evaluation identifier")
    model_id: str = Field(..., description="Evaluated model ID")
    metrics: Dict[str, float] = Field(..., description="Computed metrics")
    sample_outputs: Optional[List[Dict[str, Any]]] = Field(default=None, description="Sample outputs")
    created_at: datetime = Field(..., description="Evaluation timestamp")


# Health check schema
class HealthCheckResponse(BaseModel):
    """Health check response"""
    status: str = Field(..., description="Overall health status")
    services: Dict[str, bool] = Field(..., description="Individual service health")
    version: str = Field(..., description="Service version")
    timestamp: float = Field(..., description="Response timestamp")
    error: Optional[str] = Field(default=None, description="Error message if unhealthy")


# WebSocket message schemas
class WebSocketMessage(BaseModel):
    """WebSocket message base"""
    type: str = Field(..., description="Message type")
    data: Dict[str, Any] = Field(..., description="Message data")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Message timestamp")


class TrainingProgressMessage(WebSocketMessage):
    """Training progress WebSocket message"""
    type: str = Field(default="training_progress", const=True)
    data: TrainingJobStatus = Field(..., description="Training job status")


class LogMessage(WebSocketMessage):
    """Log message WebSocket message"""
    type: str = Field(default="log", const=True)
    data: Dict[str, str] = Field(..., description="Log data")


# Business-specific schemas
class LegalAnalysisTask(BaseModel):
    """Legal analysis specific task"""
    document_type: str = Field(..., description="Document type (TOS, Privacy, EULA)")
    clauses_to_analyze: List[str] = Field(..., description="Specific clauses to analyze")
    risk_threshold: float = Field(default=0.7, description="Risk classification threshold")


class MarketingContentTask(BaseModel):
    """Marketing content specific task"""
    content_type: str = Field(..., description="Content type (email, blog, social)")
    target_audience: str = Field(..., description="Target audience segment") 
    tone: str = Field(..., description="Content tone")
    call_to_action: Optional[str] = Field(default=None, description="Desired CTA")


class SalesCommunicationTask(BaseModel):
    """Sales communication specific task"""
    communication_type: str = Field(..., description="Communication type")
    lead_stage: str = Field(..., description="Lead stage in sales funnel")
    personalization_data: Optional[Dict[str, Any]] = Field(default=None, description="Personalization data")


class CustomerSupportTask(BaseModel):
    """Customer support specific task"""
    ticket_category: str = Field(..., description="Support ticket category")
    priority_level: str = Field(..., description="Priority level")
    customer_context: Optional[Dict[str, Any]] = Field(default=None, description="Customer context")


class CodeGenerationTask(BaseModel):
    """Code generation specific task"""
    language: str = Field(..., description="Programming language")
    framework: Optional[str] = Field(default=None, description="Framework/library")
    complexity_level: str = Field(..., description="Code complexity level")
    requirements: List[str] = Field(..., description="Functional requirements")