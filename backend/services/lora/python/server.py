"""
FastAPI server for LoRA training service
Provides REST API for training and managing LoRA adapters
"""

import asyncio
import json
import logging
import os
from datetime import datetime
from typing import Dict, List, Optional, Any
import uuid

from fastapi import FastAPI, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn

from lora_trainer import BusinessDomainTrainer

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Pydantic models for API
class TrainingRequest(BaseModel):
    domain: str = Field(..., description="Business domain (legal_analysis, marketing_content, etc.)")
    base_model: str = Field(..., description="Base model name (e.g., 'llama2', 'mistral')")
    training_data: List[Dict[str, Any]] = Field(..., description="Training data examples")
    training_config: Optional[Dict[str, Any]] = Field(None, description="Training configuration")

class TrainingJobResponse(BaseModel):
    job_id: str
    domain: str
    base_model: str
    status: str
    message: str

class AdapterInfo(BaseModel):
    job_id: str
    domain: str
    base_model: str
    adapter_path: str
    created_at: str
    performance_metrics: Dict[str, Any]

class EvaluationRequest(BaseModel):
    adapter_path: str
    test_data: List[Dict[str, Any]]

class DeploymentRequest(BaseModel):
    adapter_path: str
    model_name: str

# Initialize FastAPI app
app = FastAPI(
    title="Fine Print AI - LoRA Training Service",
    description="Production-ready LoRA training service for business-specific model adaptations",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global trainer instance
trainer_config = {
    'model_cache_dir': os.getenv('MODEL_CACHE_DIR', './models'),
    'training_data_dir': os.getenv('TRAINING_DATA_DIR', './training_data'),
    'wandb_api_key': os.getenv('WANDB_API_KEY')
}

trainer = BusinessDomainTrainer(trainer_config)
websocket_connections: List[WebSocket] = []

@app.on_startup
async def startup_event():
    """Initialize service on startup"""
    logger.info("LoRA Training Service starting up...")
    logger.info(f"Available business domains: {list(BusinessDomainTrainer.BUSINESS_DOMAINS.keys())}")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "version": "1.0.0",
        "available_domains": list(BusinessDomainTrainer.BUSINESS_DOMAINS.keys()),
        "trainer_status": trainer.get_training_status()
    }

@app.post("/train", response_model=TrainingJobResponse)
async def start_training(request: TrainingRequest, background_tasks: BackgroundTasks):
    """Start LoRA training for a specific business domain"""
    try:
        # Validate domain
        if request.domain not in BusinessDomainTrainer.BUSINESS_DOMAINS:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid domain. Available domains: {list(BusinessDomainTrainer.BUSINESS_DOMAINS.keys())}"
            )
        
        # Start training in background
        job_id = str(uuid.uuid4())
        
        async def train_adapter():
            try:
                # Broadcast training started
                await broadcast_training_update({
                    "type": "status_update",
                    "job_id": job_id,
                    "domain": request.domain,
                    "status": "training",
                    "message": f"Training started for {request.domain}",
                    "timestamp": datetime.now().isoformat()
                })
                
                result = await trainer.train_lora_adapter(
                    domain=request.domain,
                    base_model=request.base_model,
                    training_data=request.training_data,
                    training_config=request.training_config
                )
                
                # Broadcast training completed
                await broadcast_training_update({
                    "type": "training_completed",
                    "job_id": job_id,
                    "domain": request.domain,
                    "adapter_path": result.get('adapter_path'),
                    "timestamp": datetime.now().isoformat()
                })
                
            except Exception as e:
                logger.error(f"Training failed for job {job_id}: {str(e)}")
                
                # Broadcast training failed
                await broadcast_training_update({
                    "type": "training_failed",
                    "job_id": job_id,
                    "domain": request.domain,
                    "error": str(e),
                    "timestamp": datetime.now().isoformat()
                })
        
        background_tasks.add_task(train_adapter)
        
        return TrainingJobResponse(
            job_id=job_id,
            domain=request.domain,
            base_model=request.base_model,
            status="started",
            message="Training job started successfully"
        )
        
    except Exception as e:
        logger.error(f"Failed to start training: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/domains")
async def get_available_domains():
    """Get available business domains for training"""
    return {
        "domains": BusinessDomainTrainer.BUSINESS_DOMAINS,
        "available_domains": list(BusinessDomainTrainer.BUSINESS_DOMAINS.keys())
    }

@app.get("/training/status")
async def get_training_status():
    """Get current training job status"""
    try:
        status = trainer.get_training_status()
        return {"current_job": status}
    except Exception as e:
        logger.error(f"Failed to get training status: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/training/history")
async def get_training_history():
    """Get training job history"""
    try:
        history = trainer.get_training_history()
        return {"history": history}
    except Exception as e:
        logger.error(f"Failed to get training history: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/adapters", response_model=List[AdapterInfo])
async def list_adapters():
    """List all available trained adapters"""
    try:
        adapters = trainer.list_available_adapters()
        return [AdapterInfo(**adapter) for adapter in adapters]
    except Exception as e:
        logger.error(f"Failed to list adapters: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/evaluate")
async def evaluate_adapter(request: EvaluationRequest):
    """Evaluate a trained adapter's performance"""
    try:
        evaluation_results = await trainer.evaluate_adapter(
            request.adapter_path,
            request.test_data
        )
        
        return {
            "adapter_path": request.adapter_path,
            "evaluation_results": evaluation_results
        }
        
    except Exception as e:
        logger.error(f"Evaluation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/deploy")
async def deploy_adapter(request: DeploymentRequest):
    """Deploy trained adapter to Ollama"""
    try:
        deployment_info = await trainer.deploy_to_ollama(
            request.adapter_path,
            request.model_name
        )
        
        return {"deployment_info": deployment_info}
        
    except Exception as e:
        logger.error(f"Deployment failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/demo/generate-sample-data")
async def generate_sample_data(domain: str = Query(...)):
    """Generate sample training data for development"""
    if domain not in BusinessDomainTrainer.BUSINESS_DOMAINS:
        raise HTTPException(status_code=400, detail=f"Unknown domain: {domain}")
    
    # Generate sample data based on domain
    sample_data = []
    
    if domain == "legal_analysis":
        sample_data = [
            {
                "document_text": "By using this service, you agree to binding arbitration and waive your right to a jury trial.",
                "analysis_result": "HIGH RISK: This clause waives fundamental legal rights including jury trial. Recommend flagging for user review."
            },
            {
                "document_text": "We may collect and share your personal data with third parties for marketing purposes.",
                "analysis_result": "MEDIUM RISK: Data sharing for marketing requires explicit consent under GDPR. Consider privacy implications."
            }
        ]
    elif domain == "marketing_content":
        sample_data = [
            {
                "campaign_objective": "Increase brand awareness for legal tech startup",
                "target_audience": "Legal professionals, small law firms",
                "brand_voice": "Professional, trustworthy, innovative",
                "generated_content": "Revolutionize your legal practice with AI-powered contract analysis. Save time, reduce risk, and focus on what matters most - your clients."
            }
        ]
    elif domain == "sales_communication":
        sample_data = [
            {
                "prospect_context": "Legal tech startup founder looking for contract analysis tools",
                "company": "Fine Print AI",
                "role": "Founder",
                "sales_stage": "initial_outreach",
                "email_content": "Hi [Name], I noticed your startup is growing rapidly. Contract management can become overwhelming - our AI solution has helped similar companies reduce contract review time by 80%."
            }
        ]
    elif domain == "customer_support":
        sample_data = [
            {
                "customer_issue": "Unable to upload PDF documents for analysis",
                "customer_tier": "pro",
                "interaction_history": "Previous successful uploads last week",
                "support_response": "I see you're having trouble with PDF uploads. Let me check your account - it looks like you may have hit your monthly upload limit. I can upgrade your plan or reset your quota."
            }
        ]
    
    return {"sample_data": sample_data}

@app.post("/demo/quick-train")
async def quick_train_demo(
    domain: str = Query(...),
    background_tasks: BackgroundTasks
):
    """Quick training demo with sample data"""
    # Generate sample data
    sample_response = await generate_sample_data(domain)
    sample_data = sample_response["sample_data"]
    
    # Create training request with sample data
    training_request = TrainingRequest(
        domain=domain,
        base_model="microsoft/DialoGPT-medium",
        training_data=sample_data,
        training_config={"epochs": 1, "batch_size": 1}  # Quick training
    )
    
    # Start training
    result = await start_training(training_request, background_tasks)
    
    return {"training_response": result.dict()}

async def broadcast_training_update(message: Dict[str, Any]):
    """Broadcast training updates to all connected WebSocket clients"""
    if not websocket_connections:
        return
    
    disconnected = []
    for websocket in websocket_connections:
        try:
            await websocket.send_text(json.dumps(message))
        except:
            disconnected.append(websocket)
    
    # Remove disconnected clients
    for ws in disconnected:
        websocket_connections.remove(ws)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time training updates"""
    await websocket.accept()
    websocket_connections.append(websocket)
    
    logger.info("WebSocket client connected")
    
    try:
        while True:
            # Keep connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    finally:
        if websocket in websocket_connections:
            websocket_connections.remove(websocket)

if __name__ == "__main__":
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", 8008)),
        reload=os.getenv("ENVIRONMENT") == "development"
    )