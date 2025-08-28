"""
Fine Print AI LoRA Training Service - Python Backend
Production-ready LoRA fine-tuning with Unsloth and Ollama integration
"""

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from typing import Dict, Any, Optional

import uvicorn
from fastapi import FastAPI, HTTPException, BackgroundTasks, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

from src.services.lora_training_service import LoRATrainingService
from src.services.model_registry_service import ModelRegistryService
from src.services.training_data_service import TrainingDataService
from src.services.evaluation_service import EvaluationService
from src.services.deployment_service import DeploymentService
from src.services.ollama_integration_service import OllamaIntegrationService
from src.models.schemas import (
    TrainingJobRequest,
    TrainingJobResponse,
    TrainingJobStatus,
    ModelRegistrationRequest,
    AdapterDeploymentRequest,
    EvaluationRequest,
    HealthCheckResponse
)
from src.core.config import settings
from src.core.logging_config import setup_logging
from src.core.dependencies import get_database, get_redis, get_metrics_collector

# Setup logging
logger = setup_logging()

# Global service instances
services: Dict[str, Any] = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    try:
        logger.info("Starting Fine Print AI LoRA Training Service")
        
        # Initialize database connection
        db = await get_database()
        redis_client = await get_redis()
        metrics = get_metrics_collector()
        
        # Initialize services
        services['lora_training'] = LoRATrainingService(db, redis_client, metrics)
        services['model_registry'] = ModelRegistryService(db, redis_client)
        services['training_data'] = TrainingDataService(db, redis_client)
        services['evaluation'] = EvaluationService(db, redis_client)
        services['deployment'] = DeploymentService(db, redis_client)
        services['ollama_integration'] = OllamaIntegrationService(redis_client)
        
        # Initialize services
        await services['lora_training'].initialize()
        await services['model_registry'].initialize()
        await services['training_data'].initialize()
        await services['evaluation'].initialize()
        await services['deployment'].initialize()
        await services['ollama_integration'].initialize()
        
        logger.info("All services initialized successfully")
        yield
        
    except Exception as e:
        logger.error(f"Failed to initialize services: {e}")
        raise
    finally:
        # Cleanup
        logger.info("Shutting down Fine Print AI LoRA Training Service")
        for service_name, service in services.items():
            try:
                if hasattr(service, 'cleanup'):
                    await service.cleanup()
                logger.info(f"Service {service_name} cleaned up successfully")
            except Exception as e:
                logger.error(f"Error cleaning up service {service_name}: {e}")

# Create FastAPI app
app = FastAPI(
    title="Fine Print AI LoRA Training Service",
    description="Production LoRA fine-tuning service with Ollama integration",
    version="1.0.0",
    docs_url="/docs" if settings.environment == "development" else None,
    redoc_url="/redoc" if settings.environment == "development" else None,
    lifespan=lifespan
)

# Add middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(GZipMiddleware, minimum_size=1000)

# Health check endpoint
@app.get("/health", response_model=HealthCheckResponse)
async def health_check():
    """Health check endpoint"""
    try:
        # Check all services
        service_health = {}
        for service_name, service in services.items():
            if hasattr(service, 'health_check'):
                service_health[service_name] = await service.health_check()
            else:
                service_health[service_name] = True
        
        all_healthy = all(service_health.values())
        
        return HealthCheckResponse(
            status="healthy" if all_healthy else "degraded",
            services=service_health,
            version="1.0.0",
            timestamp=asyncio.get_event_loop().time()
        )
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return HealthCheckResponse(
            status="unhealthy",
            services={},
            version="1.0.0",
            timestamp=asyncio.get_event_loop().time(),
            error=str(e)
        )

# Training endpoints
@app.post("/api/training/start", response_model=TrainingJobResponse)
async def start_training_job(
    request: TrainingJobRequest,
    background_tasks: BackgroundTasks
):
    """Start a LoRA training job"""
    try:
        training_service = services['lora_training']
        job_id = await training_service.start_training_job(
            request=request,
            background_tasks=background_tasks
        )
        
        return TrainingJobResponse(
            job_id=job_id,
            status="queued",
            message="Training job started successfully"
        )
    except Exception as e:
        logger.error(f"Failed to start training job: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/training/job/{job_id}/status", response_model=TrainingJobStatus)
async def get_training_job_status(job_id: str):
    """Get training job status"""
    try:
        training_service = services['lora_training']
        status = await training_service.get_job_status(job_id)
        return status
    except Exception as e:
        logger.error(f"Failed to get job status: {e}")
        raise HTTPException(status_code=404, detail="Job not found")

@app.post("/api/training/job/{job_id}/cancel")
async def cancel_training_job(job_id: str):
    """Cancel a training job"""
    try:
        training_service = services['lora_training']
        await training_service.cancel_job(job_id)
        return {"message": "Job cancelled successfully"}
    except Exception as e:
        logger.error(f"Failed to cancel job: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/training/job/{job_id}/logs")
async def get_training_logs(job_id: str, lines: int = 100):
    """Get training job logs"""
    try:
        training_service = services['lora_training']
        logs = await training_service.get_job_logs(job_id, lines)
        return {"logs": logs}
    except Exception as e:
        logger.error(f"Failed to get job logs: {e}")
        raise HTTPException(status_code=404, detail="Job not found")

# Model registry endpoints
@app.post("/api/models/register")
async def register_model(request: ModelRegistrationRequest):
    """Register a trained LoRA adapter"""
    try:
        registry_service = services['model_registry']
        model_id = await registry_service.register_model(request)
        return {"model_id": model_id, "message": "Model registered successfully"}
    except Exception as e:
        logger.error(f"Failed to register model: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/models/{model_id}")
async def get_model_details(model_id: str):
    """Get model details"""
    try:
        registry_service = services['model_registry']
        model = await registry_service.get_model(model_id)
        return model
    except Exception as e:
        logger.error(f"Failed to get model details: {e}")
        raise HTTPException(status_code=404, detail="Model not found")

@app.get("/api/models")
async def list_models(
    limit: int = 50,
    offset: int = 0,
    business_type: Optional[str] = None,
    status: Optional[str] = None
):
    """List registered models"""
    try:
        registry_service = services['model_registry']
        models = await registry_service.list_models(
            limit=limit,
            offset=offset,
            business_type=business_type,
            status=status
        )
        return models
    except Exception as e:
        logger.error(f"Failed to list models: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Deployment endpoints
@app.post("/api/deployment/deploy")
async def deploy_adapter(request: AdapterDeploymentRequest):
    """Deploy LoRA adapter to Ollama"""
    try:
        deployment_service = services['deployment']
        deployment_id = await deployment_service.deploy_adapter(request)
        return {"deployment_id": deployment_id, "message": "Adapter deployed successfully"}
    except Exception as e:
        logger.error(f"Failed to deploy adapter: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/deployment/{deployment_id}/status")
async def get_deployment_status(deployment_id: str):
    """Get deployment status"""
    try:
        deployment_service = services['deployment']
        status = await deployment_service.get_deployment_status(deployment_id)
        return status
    except Exception as e:
        logger.error(f"Failed to get deployment status: {e}")
        raise HTTPException(status_code=404, detail="Deployment not found")

# Evaluation endpoints
@app.post("/api/evaluation/start")
async def start_evaluation(request: EvaluationRequest):
    """Start model evaluation"""
    try:
        evaluation_service = services['evaluation']
        evaluation_id = await evaluation_service.start_evaluation(request)
        return {"evaluation_id": evaluation_id, "message": "Evaluation started successfully"}
    except Exception as e:
        logger.error(f"Failed to start evaluation: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/evaluation/{evaluation_id}/results")
async def get_evaluation_results(evaluation_id: str):
    """Get evaluation results"""
    try:
        evaluation_service = services['evaluation']
        results = await evaluation_service.get_results(evaluation_id)
        return results
    except Exception as e:
        logger.error(f"Failed to get evaluation results: {e}")
        raise HTTPException(status_code=404, detail="Evaluation not found")

# Ollama integration endpoints
@app.post("/api/ollama/load-adapter")
async def load_adapter_to_ollama(
    model_name: str,
    adapter_path: str,
    adapter_name: str
):
    """Load LoRA adapter into Ollama"""
    try:
        ollama_service = services['ollama_integration']
        result = await ollama_service.load_adapter(
            model_name=model_name,
            adapter_path=adapter_path,
            adapter_name=adapter_name
        )
        return result
    except Exception as e:
        logger.error(f"Failed to load adapter to Ollama: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/ollama/models")
async def list_ollama_models():
    """List available Ollama models"""
    try:
        ollama_service = services['ollama_integration']
        models = await ollama_service.list_models()
        return {"models": models}
    except Exception as e:
        logger.error(f"Failed to list Ollama models: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ollama/test-adapter")
async def test_adapter_inference(
    model_name: str,
    adapter_name: str,
    prompt: str,
    business_type: str
):
    """Test adapter inference with Ollama"""
    try:
        ollama_service = services['ollama_integration']
        result = await ollama_service.test_inference(
            model_name=model_name,
            adapter_name=adapter_name,
            prompt=prompt,
            business_type=business_type
        )
        return result
    except Exception as e:
        logger.error(f"Failed to test adapter inference: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Metrics endpoint
@app.get("/metrics")
async def get_metrics():
    """Prometheus metrics endpoint"""
    try:
        metrics_collector = get_metrics_collector()
        return metrics_collector.generate_latest()
    except Exception as e:
        logger.error(f"Failed to get metrics: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Error handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    logger.error(f"HTTP exception: {exc.detail}")
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.detail,
            "status_code": exc.status_code,
            "timestamp": asyncio.get_event_loop().time()
        }
    )

@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    logger.error(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "status_code": 500,
            "timestamp": asyncio.get_event_loop().time()
        }
    )

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.environment == "development",
        log_level=settings.log_level.lower(),
        access_log=True
    )