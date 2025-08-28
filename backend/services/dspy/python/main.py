"""
Fine Print AI DSPy Service
Real DSPy framework integration for production prompt optimization
"""

import os
import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Dict, List, Optional, Any
from datetime import datetime

import dspy
import uvicorn
from fastapi import FastAPI, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from loguru import logger

from optimizers import (
    DSPyOptimizationEngine,
    OptimizationConfig,
    OptimizationJob,
    OptimizationResults
)
from modules import (
    LegalAnalysisModule,
    MarketingContentModule, 
    SalesOptimizationModule,
    SupportResponseModule
)
from evaluators import (
    BusinessMetricEvaluator,
    ConversionRateEvaluator,
    SatisfactionScoreEvaluator,
    AccuracyEvaluator
)
from training_data import TrainingDataManager
from template_manager import PromptTemplateManager
from websocket_manager import WebSocketManager

# Configure logging
logger.add("logs/dspy_service.log", rotation="1 day", retention="30 days", level="INFO")

# Global state
optimization_engine: Optional[DSPyOptimizationEngine] = None
websocket_manager: Optional[WebSocketManager] = None
template_manager: Optional[PromptTemplateManager] = None
training_data_manager: Optional[TrainingDataManager] = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize and cleanup DSPy service"""
    global optimization_engine, websocket_manager, template_manager, training_data_manager
    
    try:
        logger.info("Initializing Fine Print AI DSPy Service")
        
        # Configure DSPy with Ollama
        ollama_url = os.getenv("OLLAMA_URL", "http://localhost:11434")
        default_model = os.getenv("DEFAULT_MODEL", "mistral:7b")
        
        # Initialize DSPy LM
        lm = dspy.OllamaLocal(
            base_url=ollama_url,
            model=default_model,
            max_tokens=4096,
            temperature=0.1
        )
        dspy.settings.configure(lm=lm)
        
        # Initialize services
        websocket_manager = WebSocketManager()
        template_manager = PromptTemplateManager()
        training_data_manager = TrainingDataManager()
        optimization_engine = DSPyOptimizationEngine(
            websocket_manager=websocket_manager,
            template_manager=template_manager,
            training_data_manager=training_data_manager
        )
        
        # Initialize business modules
        await optimization_engine.initialize_modules()
        
        logger.info("DSPy Service initialized successfully")
        
        yield
        
    except Exception as e:
        logger.error(f"Failed to initialize DSPy service: {e}")
        raise
    finally:
        logger.info("Shutting down DSPy Service")
        if optimization_engine:
            await optimization_engine.cleanup()

# Create FastAPI app
app = FastAPI(
    title="Fine Print AI DSPy Service",
    description="Production DSPy framework integration for business optimization",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic Models
class LegalAnalysisRequest(BaseModel):
    document_content: str = Field(..., min_length=1, max_length=100000)
    document_type: str = Field(..., regex="^(terms_of_service|privacy_policy|eula|license)$")
    language: str = Field(default="en", max_length=10)
    analysis_depth: str = Field(default="detailed", regex="^(basic|detailed|comprehensive)$")
    optimization_version: Optional[str] = None

class LegalAnalysisResponse(BaseModel):
    risk_score: float = Field(..., ge=0, le=100)
    executive_summary: str
    key_findings: List[str]
    recommendations: List[str]
    findings: List[Dict[str, Any]]
    dspy_metadata: Dict[str, Any]

class OptimizationStartRequest(BaseModel):
    module_name: str = Field(..., min_length=1)
    config: Dict[str, Any]
    dataset: List[Dict[str, Any]] = Field(..., min_items=1, max_items=10000)

class OptimizationStatusResponse(BaseModel):
    job_id: str
    status: str
    progress: float = Field(..., ge=0, le=100)
    message: str
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    results: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

# Health Check
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        # Test DSPy connection
        test_response = dspy.settings.lm("Test connection")
        
        return {
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat(),
            "dspy_configured": True,
            "ollama_connected": bool(test_response),
            "modules_loaded": len(optimization_engine.modules) if optimization_engine else 0
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {
            "status": "unhealthy",
            "timestamp": datetime.utcnow().isoformat(),
            "error": str(e)
        }

# Legal Document Analysis
@app.post("/analyze/legal", response_model=LegalAnalysisResponse)
async def analyze_legal_document(request: LegalAnalysisRequest):
    """Analyze legal document using optimized DSPy modules"""
    if not optimization_engine:
        raise HTTPException(status_code=500, detail="Optimization engine not initialized")
    
    try:
        logger.info(f"Starting legal analysis: {request.document_type}, depth: {request.analysis_depth}")
        
        result = await optimization_engine.analyze_legal_document(
            document_content=request.document_content,
            document_type=request.document_type,
            language=request.language,
            analysis_depth=request.analysis_depth,
            optimization_version=request.optimization_version
        )
        
        return LegalAnalysisResponse(**result)
        
    except Exception as e:
        logger.error(f"Legal analysis failed: {e}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

# Business Content Optimization
@app.post("/optimize/marketing-content")
async def optimize_marketing_content(
    content_type: str,
    target_audience: str,
    content_draft: str,
    optimization_goals: List[str]
):
    """Optimize marketing content using DSPy"""
    if not optimization_engine:
        raise HTTPException(status_code=500, detail="Optimization engine not initialized")
    
    try:
        result = await optimization_engine.optimize_marketing_content(
            content_type=content_type,
            target_audience=target_audience,
            content_draft=content_draft,
            optimization_goals=optimization_goals
        )
        
        return result
        
    except Exception as e:
        logger.error(f"Marketing content optimization failed: {e}")
        raise HTTPException(status_code=500, detail=f"Optimization failed: {str(e)}")

@app.post("/optimize/sales-communication")
async def optimize_sales_communication(
    communication_type: str,
    prospect_profile: Dict[str, Any],
    message_draft: str,
    conversion_goals: List[str]
):
    """Optimize sales communication using DSPy"""
    if not optimization_engine:
        raise HTTPException(status_code=500, detail="Optimization engine not initialized")
    
    try:
        result = await optimization_engine.optimize_sales_communication(
            communication_type=communication_type,
            prospect_profile=prospect_profile,
            message_draft=message_draft,
            conversion_goals=conversion_goals
        )
        
        return result
        
    except Exception as e:
        logger.error(f"Sales communication optimization failed: {e}")
        raise HTTPException(status_code=500, detail=f"Optimization failed: {str(e)}")

@app.post("/optimize/support-response")
async def optimize_support_response(
    issue_type: str,
    customer_context: Dict[str, Any],
    response_draft: str,
    satisfaction_goals: List[str]
):
    """Optimize customer support response using DSPy"""
    if not optimization_engine:
        raise HTTPException(status_code=500, detail="Optimization engine not initialized")
    
    try:
        result = await optimization_engine.optimize_support_response(
            issue_type=issue_type,
            customer_context=customer_context,
            response_draft=response_draft,
            satisfaction_goals=satisfaction_goals
        )
        
        return result
        
    except Exception as e:
        logger.error(f"Support response optimization failed: {e}")
        raise HTTPException(status_code=500, detail=f"Optimization failed: {str(e)}")

# Module Optimization Management
@app.post("/optimization/start")
async def start_optimization(request: OptimizationStartRequest, background_tasks: BackgroundTasks):
    """Start DSPy module optimization job"""
    if not optimization_engine:
        raise HTTPException(status_code=500, detail="Optimization engine not initialized")
    
    try:
        job_id = await optimization_engine.start_optimization(
            module_name=request.module_name,
            config=OptimizationConfig(**request.config),
            dataset=request.dataset
        )
        
        return {
            "job_id": job_id,
            "message": f"Optimization started for module '{request.module_name}'",
            "status": "started"
        }
        
    except Exception as e:
        logger.error(f"Failed to start optimization: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to start optimization: {str(e)}")

@app.get("/optimization/jobs/{job_id}", response_model=OptimizationStatusResponse)
async def get_optimization_status(job_id: str):
    """Get optimization job status"""
    if not optimization_engine:
        raise HTTPException(status_code=500, detail="Optimization engine not initialized")
    
    try:
        job = optimization_engine.get_optimization_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Optimization job not found")
        
        return OptimizationStatusResponse(
            job_id=job.id,
            status=job.status,
            progress=job.progress,
            message=job.message or "",
            started_at=job.started_at,
            completed_at=job.completed_at,
            results=job.results.dict() if job.results else None,
            error=job.error_message
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get optimization status: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get status: {str(e)}")

@app.get("/optimization/jobs")
async def list_optimization_jobs(
    status: Optional[str] = None,
    module_name: Optional[str] = None,
    limit: int = 50,
    offset: int = 0
):
    """List optimization jobs"""
    if not optimization_engine:
        raise HTTPException(status_code=500, detail="Optimization engine not initialized")
    
    try:
        jobs = optimization_engine.list_optimization_jobs(
            status=status,
            module_name=module_name,
            limit=limit,
            offset=offset
        )
        
        return {
            "jobs": [
                {
                    "job_id": job.id,
                    "module_name": job.module_name,
                    "status": job.status,
                    "progress": job.progress,
                    "started_at": job.started_at,
                    "completed_at": job.completed_at
                }
                for job in jobs
            ],
            "total": len(jobs),
            "limit": limit,
            "offset": offset
        }
        
    except Exception as e:
        logger.error(f"Failed to list optimization jobs: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list jobs: {str(e)}")

# Template Management
@app.get("/templates")
async def list_templates(category: Optional[str] = None):
    """List available prompt templates"""
    if not template_manager:
        raise HTTPException(status_code=500, detail="Template manager not initialized")
    
    try:
        templates = template_manager.list_templates(category=category)
        return {"templates": templates}
        
    except Exception as e:
        logger.error(f"Failed to list templates: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list templates: {str(e)}")

@app.get("/templates/{template_id}")
async def get_template(template_id: str):
    """Get specific template"""
    if not template_manager:
        raise HTTPException(status_code=500, detail="Template manager not initialized")
    
    try:
        template = template_manager.get_template(template_id)
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
        
        return {"template": template}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get template: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get template: {str(e)}")

# Training Data Management
@app.post("/training-data/collect")
async def collect_training_data(
    module_name: str,
    source_filters: Dict[str, Any],
    max_entries: int = 1000
):
    """Collect training data from historical operations"""
    if not training_data_manager:
        raise HTTPException(status_code=500, detail="Training data manager not initialized")
    
    try:
        dataset = await training_data_manager.collect_training_data(
            module_name=module_name,
            source_filters=source_filters,
            max_entries=max_entries
        )
        
        return {
            "dataset_id": dataset["id"],
            "entries_collected": len(dataset["entries"]),
            "collection_timestamp": dataset["timestamp"]
        }
        
    except Exception as e:
        logger.error(f"Failed to collect training data: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to collect training data: {str(e)}")

# WebSocket endpoint for real-time optimization updates
@app.websocket("/ws/optimization/{job_id}")
async def websocket_optimization_progress(websocket: WebSocket, job_id: str):
    """WebSocket endpoint for real-time optimization progress"""
    if not websocket_manager:
        await websocket.close(code=1000, reason="WebSocket manager not initialized")
        return
    
    await websocket.accept()
    
    try:
        await websocket_manager.add_client(job_id, websocket)
        
        # Keep connection alive
        while True:
            try:
                # Ping client to keep connection alive
                await websocket.ping()
                await asyncio.sleep(30)  # Ping every 30 seconds
            except WebSocketDisconnect:
                break
            except Exception as e:
                logger.error(f"WebSocket error for job {job_id}: {e}")
                break
                
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for job {job_id}")
    except Exception as e:
        logger.error(f"WebSocket error for job {job_id}: {e}")
    finally:
        if websocket_manager:
            await websocket_manager.remove_client(job_id, websocket)

# Metrics and Analytics
@app.get("/metrics/optimization")
async def get_optimization_metrics():
    """Get optimization performance metrics"""
    if not optimization_engine:
        raise HTTPException(status_code=500, detail="Optimization engine not initialized")
    
    try:
        metrics = optimization_engine.get_optimization_metrics()
        return {"metrics": metrics}
        
    except Exception as e:
        logger.error(f"Failed to get optimization metrics: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get metrics: {str(e)}")

@app.get("/modules")
async def list_modules():
    """List available DSPy modules"""
    if not optimization_engine:
        raise HTTPException(status_code=500, detail="Optimization engine not initialized")
    
    try:
        modules = optimization_engine.list_modules()
        return {"modules": modules}
        
    except Exception as e:
        logger.error(f"Failed to list modules: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list modules: {str(e)}")

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8007,
        reload=True,
        log_level="info"
    )