"""
DSPy Optimization Engine
Real DSPy framework integration for systematic prompt optimization
"""

import asyncio
import uuid
from datetime import datetime
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, asdict
from enum import Enum

import dspy
from dspy.teleprompt import BootstrapFewShot, BootstrapFewShotWithRandomSearch, MIPRO
from loguru import logger

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

class OptimizationStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

class OptimizerType(Enum):
    BOOTSTRAP_FEW_SHOT = "bootstrap_few_shot"
    BOOTSTRAP_FEW_SHOT_RANDOM_SEARCH = "bootstrap_few_shot_random_search"
    MIPRO = "mipro"
    COPRO = "copro"

@dataclass
class OptimizationConfig:
    optimizer_type: OptimizerType
    max_bootstrapped_demos: int = 4
    max_labeled_demos: int = 16
    max_rounds: int = 1
    num_candidate_programs: int = 16
    num_threads: int = 6
    max_errors: int = 10
    teacher_settings: Optional[Dict[str, Any]] = None
    metric: str = "accuracy"
    requires_permission_to_run: bool = False

@dataclass
class OptimizationResults:
    performance_before: float
    performance_after: float
    improvement_percentage: float
    compilation_time_seconds: float
    iterations_completed: int
    best_program: str
    validation_metrics: Dict[str, float]
    optimization_history: List[Dict[str, Any]]
    compiled_module: Optional[Any] = None

@dataclass
class OptimizationJob:
    id: str
    module_name: str
    config: OptimizationConfig
    status: OptimizationStatus
    progress: float = 0.0
    message: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    results: Optional[OptimizationResults] = None
    error_message: Optional[str] = None

class DSPyOptimizationEngine:
    """Production DSPy optimization engine with real framework integration"""
    
    def __init__(
        self,
        websocket_manager=None,
        template_manager=None,
        training_data_manager=None
    ):
        self.websocket_manager = websocket_manager
        self.template_manager = template_manager
        self.training_data_manager = training_data_manager
        
        # Module registry
        self.modules: Dict[str, Any] = {}
        
        # Job tracking
        self.optimization_jobs: Dict[str, OptimizationJob] = {}
        
        # Evaluators
        self.evaluators = {
            "business_metric": BusinessMetricEvaluator(),
            "conversion_rate": ConversionRateEvaluator(),
            "satisfaction_score": SatisfactionScoreEvaluator(),
            "accuracy": AccuracyEvaluator()
        }
        
        logger.info("DSPy Optimization Engine initialized")

    async def initialize_modules(self):
        """Initialize business-specific DSPy modules"""
        try:
            # Legal Analysis Module
            self.modules["legal_analysis"] = LegalAnalysisModule()
            
            # Marketing Content Module
            self.modules["marketing_content"] = MarketingContentModule()
            
            # Sales Optimization Module
            self.modules["sales_optimization"] = SalesOptimizationModule()
            
            # Support Response Module
            self.modules["support_response"] = SupportResponseModule()
            
            logger.info(f"Initialized {len(self.modules)} DSPy modules")
            
        except Exception as e:
            logger.error(f"Failed to initialize modules: {e}")
            raise

    async def analyze_legal_document(
        self,
        document_content: str,
        document_type: str,
        language: str = "en",
        analysis_depth: str = "detailed",
        optimization_version: Optional[str] = None
    ) -> Dict[str, Any]:
        """Analyze legal document using optimized DSPy module"""
        try:
            module = self.modules.get("legal_analysis")
            if not module:
                raise ValueError("Legal analysis module not initialized")

            # Use specific optimization version if requested
            if optimization_version and hasattr(module, 'load_optimization_version'):
                module.load_optimization_version(optimization_version)

            # Create input
            input_data = {
                "document_content": document_content,
                "document_type": document_type,
                "language": language,
                "analysis_depth": analysis_depth
            }

            # Execute analysis
            start_time = datetime.utcnow()
            result = module.forward(**input_data)
            execution_time = (datetime.utcnow() - start_time).total_seconds() * 1000

            # Add metadata
            result.dspy_metadata = {
                "module_used": "legal_analysis",
                "optimization_version": getattr(module, 'optimization_version', '1.0.0'),
                "compilation_timestamp": datetime.utcnow().isoformat(),
                "performance_metrics": {
                    "response_time_ms": execution_time,
                    "token_usage": self._estimate_token_usage(document_content, result),
                    "confidence_score": self._calculate_confidence_score(result)
                }
            }

            return asdict(result)

        except Exception as e:
            logger.error(f"Legal document analysis failed: {e}")
            raise

    async def optimize_marketing_content(
        self,
        content_type: str,
        target_audience: str,
        content_draft: str,
        optimization_goals: List[str]
    ) -> Dict[str, Any]:
        """Optimize marketing content using DSPy"""
        try:
            module = self.modules.get("marketing_content")
            if not module:
                raise ValueError("Marketing content module not initialized")

            input_data = {
                "content_type": content_type,
                "target_audience": target_audience,
                "content_draft": content_draft,
                "optimization_goals": optimization_goals
            }

            result = module.forward(**input_data)
            return asdict(result)

        except Exception as e:
            logger.error(f"Marketing content optimization failed: {e}")
            raise

    async def optimize_sales_communication(
        self,
        communication_type: str,
        prospect_profile: Dict[str, Any],
        message_draft: str,
        conversion_goals: List[str]
    ) -> Dict[str, Any]:
        """Optimize sales communication using DSPy"""
        try:
            module = self.modules.get("sales_optimization")
            if not module:
                raise ValueError("Sales optimization module not initialized")

            input_data = {
                "communication_type": communication_type,
                "prospect_profile": prospect_profile,
                "message_draft": message_draft,
                "conversion_goals": conversion_goals
            }

            result = module.forward(**input_data)
            return asdict(result)

        except Exception as e:
            logger.error(f"Sales communication optimization failed: {e}")
            raise

    async def optimize_support_response(
        self,
        issue_type: str,
        customer_context: Dict[str, Any],
        response_draft: str,
        satisfaction_goals: List[str]
    ) -> Dict[str, Any]:
        """Optimize customer support response using DSPy"""
        try:
            module = self.modules.get("support_response")
            if not module:
                raise ValueError("Support response module not initialized")

            input_data = {
                "issue_type": issue_type,
                "customer_context": customer_context,
                "response_draft": response_draft,
                "satisfaction_goals": satisfaction_goals
            }

            result = module.forward(**input_data)
            return asdict(result)

        except Exception as e:
            logger.error(f"Support response optimization failed: {e}")
            raise

    async def start_optimization(
        self,
        module_name: str,
        config: OptimizationConfig,
        dataset: List[Dict[str, Any]]
    ) -> str:
        """Start DSPy module optimization job"""
        try:
            # Validate module exists
            if module_name not in self.modules:
                raise ValueError(f"Module '{module_name}' not found")

            module = self.modules[module_name]

            # Create optimization job
            job_id = str(uuid.uuid4())
            job = OptimizationJob(
                id=job_id,
                module_name=module_name,
                config=config,
                status=OptimizationStatus.PENDING,
                started_at=datetime.utcnow()
            )

            self.optimization_jobs[job_id] = job

            # Start optimization in background
            asyncio.create_task(self._run_optimization(job, module, dataset))

            logger.info(f"Started optimization job {job_id} for module {module_name}")
            return job_id

        except Exception as e:
            logger.error(f"Failed to start optimization: {e}")
            raise

    async def _run_optimization(
        self,
        job: OptimizationJob,
        module: Any,
        dataset: List[Dict[str, Any]]
    ):
        """Run DSPy optimization process"""
        try:
            job.status = OptimizationStatus.RUNNING
            job.message = "Initializing optimization"
            await self._notify_progress(job.id, 5, "Preparing dataset")

            # Prepare training and validation datasets
            train_dataset, val_dataset = self._split_dataset(dataset, split_ratio=0.8)
            
            await self._notify_progress(job.id, 10, "Dataset prepared")

            # Get evaluator
            evaluator = self.evaluators.get(job.config.metric, self.evaluators["accuracy"])

            # Baseline evaluation
            await self._notify_progress(job.id, 15, "Running baseline evaluation")
            baseline_score = await self._evaluate_module(module, val_dataset, evaluator)
            
            logger.info(f"Baseline score for {job.module_name}: {baseline_score}")

            # Configure DSPy optimizer
            await self._notify_progress(job.id, 25, "Configuring optimizer")
            optimizer = self._create_optimizer(job.config, evaluator)

            # Run optimization
            await self._notify_progress(job.id, 30, "Starting optimization process")
            
            start_time = datetime.utcnow()
            optimization_history = []

            # Compile module with DSPy
            compiled_module = optimizer.compile(
                module,
                trainset=train_dataset,
                valset=val_dataset,
                verbose=True
            )

            compilation_time = (datetime.utcnow() - start_time).total_seconds()

            await self._notify_progress(job.id, 80, "Evaluating optimized module")

            # Final evaluation
            final_score = await self._evaluate_module(compiled_module, val_dataset, evaluator)
            improvement = ((final_score - baseline_score) / baseline_score) * 100

            await self._notify_progress(job.id, 95, "Finalizing results")

            # Create results
            results = OptimizationResults(
                performance_before=baseline_score,
                performance_after=final_score,
                improvement_percentage=improvement,
                compilation_time_seconds=compilation_time,
                iterations_completed=getattr(optimizer, 'num_rounds', 1),
                best_program=str(compiled_module),
                validation_metrics={"accuracy": final_score},
                optimization_history=optimization_history,
                compiled_module=compiled_module
            )

            # Update job
            job.status = OptimizationStatus.COMPLETED
            job.progress = 100.0
            job.message = f"Optimization completed with {improvement:.2f}% improvement"
            job.completed_at = datetime.utcnow()
            job.results = results

            # Save optimized module if improvement is significant
            if improvement > 5.0:  # 5% minimum improvement threshold
                await self._save_optimized_module(job.module_name, compiled_module, results)

            await self._notify_progress(job.id, 100, f"Completed with {improvement:.2f}% improvement")

            logger.info(f"Optimization job {job.id} completed successfully")

        except Exception as e:
            logger.error(f"Optimization job {job.id} failed: {e}")
            job.status = OptimizationStatus.FAILED
            job.error_message = str(e)
            job.completed_at = datetime.utcnow()
            await self._notify_progress(job.id, job.progress, f"Failed: {str(e)}")

    def _create_optimizer(self, config: OptimizationConfig, evaluator):
        """Create DSPy optimizer based on configuration"""
        if config.optimizer_type == OptimizerType.BOOTSTRAP_FEW_SHOT:
            return BootstrapFewShot(
                metric=evaluator,
                max_bootstrapped_demos=config.max_bootstrapped_demos,
                max_labeled_demos=config.max_labeled_demos,
                max_rounds=config.max_rounds,
                max_errors=config.max_errors
            )
        
        elif config.optimizer_type == OptimizerType.BOOTSTRAP_FEW_SHOT_RANDOM_SEARCH:
            return BootstrapFewShotWithRandomSearch(
                metric=evaluator,
                max_bootstrapped_demos=config.max_bootstrapped_demos,
                max_labeled_demos=config.max_labeled_demos,
                max_rounds=config.max_rounds,
                num_candidate_programs=config.num_candidate_programs,
                max_errors=config.max_errors
            )
        
        elif config.optimizer_type == OptimizerType.MIPRO:
            return MIPRO(
                metric=evaluator,
                num_threads=config.num_threads,
                verbose=True
            )
        
        else:
            # Default to BootstrapFewShot
            return BootstrapFewShot(
                metric=evaluator,
                max_bootstrapped_demos=config.max_bootstrapped_demos,
                max_labeled_demos=config.max_labeled_demos
            )

    def _split_dataset(self, dataset: List[Dict[str, Any]], split_ratio: float = 0.8):
        """Split dataset into training and validation sets"""
        import random
        random.shuffle(dataset)
        
        split_index = int(len(dataset) * split_ratio)
        train_dataset = dataset[:split_index]
        val_dataset = dataset[split_index:]
        
        # Convert to DSPy Examples
        train_examples = [dspy.Example(**item) for item in train_dataset]
        val_examples = [dspy.Example(**item) for item in val_dataset]
        
        return train_examples, val_examples

    async def _evaluate_module(self, module: Any, dataset: List[Any], evaluator) -> float:
        """Evaluate module performance on dataset"""
        try:
            scores = []
            for example in dataset:
                try:
                    prediction = module(**example.inputs())
                    score = evaluator.evaluate(example, prediction)
                    scores.append(score)
                except Exception as e:
                    logger.warning(f"Evaluation failed for example: {e}")
                    scores.append(0.0)
            
            return sum(scores) / len(scores) if scores else 0.0
            
        except Exception as e:
            logger.error(f"Module evaluation failed: {e}")
            return 0.0

    async def _save_optimized_module(self, module_name: str, compiled_module: Any, results: OptimizationResults):
        """Save optimized module for future use"""
        try:
            if self.template_manager:
                await self.template_manager.save_optimized_module(
                    module_name=module_name,
                    compiled_module=compiled_module,
                    optimization_results=results
                )
            
            logger.info(f"Saved optimized module {module_name}")
            
        except Exception as e:
            logger.error(f"Failed to save optimized module: {e}")

    async def _notify_progress(self, job_id: str, progress: float, message: str):
        """Notify optimization progress via WebSocket"""
        try:
            if self.websocket_manager:
                await self.websocket_manager.broadcast_progress(job_id, {
                    "job_id": job_id,
                    "progress": progress,
                    "message": message,
                    "timestamp": datetime.utcnow().isoformat()
                })
                
            # Update job progress
            if job_id in self.optimization_jobs:
                self.optimization_jobs[job_id].progress = progress
                self.optimization_jobs[job_id].message = message
                
        except Exception as e:
            logger.error(f"Failed to notify progress: {e}")

    def get_optimization_job(self, job_id: str) -> Optional[OptimizationJob]:
        """Get optimization job by ID"""
        return self.optimization_jobs.get(job_id)

    def list_optimization_jobs(
        self,
        status: Optional[str] = None,
        module_name: Optional[str] = None,
        limit: int = 50,
        offset: int = 0
    ) -> List[OptimizationJob]:
        """List optimization jobs with filtering"""
        jobs = list(self.optimization_jobs.values())
        
        # Apply filters
        if status:
            jobs = [job for job in jobs if job.status.value == status]
        
        if module_name:
            jobs = [job for job in jobs if job.module_name == module_name]
        
        # Sort by start time (newest first)
        jobs.sort(key=lambda job: job.started_at or datetime.min, reverse=True)
        
        # Apply pagination
        return jobs[offset:offset + limit]

    def list_modules(self) -> List[Dict[str, Any]]:
        """List available DSPy modules"""
        return [
            {
                "name": name,
                "type": type(module).__name__,
                "description": getattr(module, 'description', ''),
                "optimization_version": getattr(module, 'optimization_version', '1.0.0')
            }
            for name, module in self.modules.items()
        ]

    def get_optimization_metrics(self) -> Dict[str, Any]:
        """Get optimization performance metrics"""
        jobs = list(self.optimization_jobs.values())
        completed_jobs = [job for job in jobs if job.status == OptimizationStatus.COMPLETED]
        
        return {
            "total_jobs": len(jobs),
            "completed_jobs": len(completed_jobs),
            "failed_jobs": len([job for job in jobs if job.status == OptimizationStatus.FAILED]),
            "running_jobs": len([job for job in jobs if job.status == OptimizationStatus.RUNNING]),
            "average_improvement": (
                sum(job.results.improvement_percentage for job in completed_jobs if job.results)
                / len(completed_jobs)
            ) if completed_jobs else 0.0,
            "optimizer_distribution": self._get_optimizer_distribution(jobs)
        }

    def _get_optimizer_distribution(self, jobs: List[OptimizationJob]) -> Dict[str, int]:
        """Get distribution of optimizer types used"""
        distribution = {}
        for job in jobs:
            optimizer_type = job.config.optimizer_type.value
            distribution[optimizer_type] = distribution.get(optimizer_type, 0) + 1
        return distribution

    def _estimate_token_usage(self, input_text: str, result: Any) -> int:
        """Estimate token usage for the operation"""
        # Rough token estimation (1 token ≈ 4 characters for English)
        input_tokens = len(input_text) // 4
        output_tokens = len(str(result)) // 4
        return input_tokens + output_tokens

    def _calculate_confidence_score(self, result: Any) -> float:
        """Calculate confidence score for the result"""
        # This would be customized based on the specific result structure
        if hasattr(result, 'findings') and result.findings:
            avg_confidence = sum(
                finding.get('confidence_score', 0.5) 
                for finding in result.findings
            ) / len(result.findings)
            return avg_confidence
        return 0.5

    async def cleanup(self):
        """Cleanup resources"""
        try:
            # Cancel running jobs
            running_jobs = [
                job for job in self.optimization_jobs.values()
                if job.status == OptimizationStatus.RUNNING
            ]
            
            for job in running_jobs:
                job.status = OptimizationStatus.CANCELLED
                job.completed_at = datetime.utcnow()
            
            logger.info("DSPy Optimization Engine cleaned up")
            
        except Exception as e:
            logger.error(f"Cleanup failed: {e}")