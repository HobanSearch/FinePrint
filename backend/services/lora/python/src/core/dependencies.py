"""
Dependency injection for Fine Print AI LoRA Training Service
"""

import asyncio
from functools import lru_cache
from typing import AsyncGenerator, Optional

import asyncpg
import redis.asyncio as aioredis
from prometheus_client import CollectorRegistry, Counter, Histogram, Gauge
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

from .config import settings
from .logging_config import get_logger

logger = get_logger("dependencies")

# Global instances
_database_engine = None
_redis_client = None
_metrics_registry = None


async def get_database() -> AsyncGenerator[AsyncSession, None]:
    """Get database session"""
    global _database_engine
    
    if _database_engine is None:
        _database_engine = create_async_engine(
            settings.database_url,
            pool_size=settings.database_pool_size,
            max_overflow=settings.database_max_overflow,
            echo=settings.debug,
            future=True
        )
    
    async_session = async_sessionmaker(
        _database_engine,
        class_=AsyncSession,
        expire_on_commit=False
    )
    
    async with async_session() as session:
        try:
            yield session
        except Exception as e:
            logger.error("Database session error", error=str(e))
            await session.rollback()
            raise
        finally:
            await session.close()


async def get_redis() -> aioredis.Redis:
    """Get Redis client"""
    global _redis_client
    
    if _redis_client is None:
        try:
            _redis_client = aioredis.from_url(
                settings.redis_url,
                password=settings.redis_password,
                db=settings.redis_db,
                encoding="utf-8",
                decode_responses=True,
                retry_on_timeout=True,
                health_check_interval=30
            )
            
            # Test connection
            await _redis_client.ping()
            logger.info("Redis connection established")
            
        except Exception as e:
            logger.error("Failed to connect to Redis", error=str(e))
            raise
    
    return _redis_client


@lru_cache()
def get_metrics_collector():
    """Get Prometheus metrics collector"""
    global _metrics_registry
    
    if _metrics_registry is None:
        _metrics_registry = MetricsCollector()
    
    return _metrics_registry


class MetricsCollector:
    """Prometheus metrics collector"""
    
    def __init__(self):
        self.registry = CollectorRegistry()
        
        # Training metrics
        self.training_jobs_total = Counter(
            'lora_training_jobs_total',
            'Total number of training jobs',
            ['business_type', 'status'],
            registry=self.registry
        )
        
        self.training_duration_seconds = Histogram(
            'lora_training_duration_seconds',
            'Training job duration in seconds',
            ['business_type'],
            buckets=[60, 300, 900, 1800, 3600, 7200, 14400, 28800],
            registry=self.registry
        )
        
        self.training_loss = Gauge(
            'lora_training_loss',
            'Current training loss',
            ['job_id', 'epoch'],
            registry=self.registry
        )
        
        # Model metrics
        self.models_registered_total = Counter(
            'lora_models_registered_total',
            'Total number of registered models',
            ['business_type'],
            registry=self.registry
        )
        
        self.model_size_bytes = Gauge(
            'lora_model_size_bytes',
            'Model size in bytes',
            ['model_id', 'business_type'],
            registry=self.registry
        )
        
        # Deployment metrics
        self.deployments_total = Counter(
            'lora_deployments_total',
            'Total number of deployments',
            ['status'],
            registry=self.registry
        )
        
        self.inference_requests_total = Counter(
            'lora_inference_requests_total',
            'Total inference requests',
            ['model_id', 'business_type'],
            registry=self.registry
        )
        
        self.inference_duration_seconds = Histogram(
            'lora_inference_duration_seconds',
            'Inference duration in seconds',
            ['model_id'],
            buckets=[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0],
            registry=self.registry
        )
        
        # System metrics
        self.gpu_memory_usage_bytes = Gauge(
            'lora_gpu_memory_usage_bytes',
            'GPU memory usage in bytes',
            ['gpu_id'],
            registry=self.registry
        )
        
        self.gpu_utilization_percent = Gauge(
            'lora_gpu_utilization_percent',
            'GPU utilization percentage',
            ['gpu_id'],
            registry=self.registry
        )
        
        self.system_memory_usage_bytes = Gauge(
            'lora_system_memory_usage_bytes',
            'System memory usage in bytes',
            registry=self.registry
        )
        
        # Service health metrics
        self.service_health = Gauge(
            'lora_service_health',
            'Service health status (1=healthy, 0=unhealthy)',
            ['service_name'],
            registry=self.registry
        )
        
        self.active_training_jobs = Gauge(
            'lora_active_training_jobs',
            'Number of active training jobs',
            registry=self.registry
        )
        
        self.queue_size = Gauge(
            'lora_queue_size',
            'Training queue size',
            ['priority'],
            registry=self.registry
        )
    
    def generate_latest(self):
        """Generate latest metrics in Prometheus format"""
        from prometheus_client import generate_latest
        return generate_latest(self.registry)
    
    def record_training_job(self, business_type: str, status: str):
        """Record training job completion"""
        self.training_jobs_total.labels(
            business_type=business_type,
            status=status
        ).inc()
    
    def record_training_duration(self, business_type: str, duration: float):
        """Record training duration"""
        self.training_duration_seconds.labels(
            business_type=business_type
        ).observe(duration)
    
    def update_training_loss(self, job_id: str, epoch: int, loss: float):
        """Update training loss"""
        self.training_loss.labels(
            job_id=job_id,
            epoch=str(epoch)
        ).set(loss)
    
    def record_model_registration(self, business_type: str, size_bytes: float, model_id: str):
        """Record model registration"""
        self.models_registered_total.labels(
            business_type=business_type
        ).inc()
        
        self.model_size_bytes.labels(
            model_id=model_id,
            business_type=business_type
        ).set(size_bytes)
    
    def record_deployment(self, status: str):
        """Record deployment"""
        self.deployments_total.labels(status=status).inc()
    
    def record_inference_request(self, model_id: str, business_type: str, duration: float):
        """Record inference request"""
        self.inference_requests_total.labels(
            model_id=model_id,
            business_type=business_type
        ).inc()
        
        self.inference_duration_seconds.labels(
            model_id=model_id
        ).observe(duration)
    
    def update_gpu_metrics(self, gpu_id: str, memory_used: float, utilization: float):
        """Update GPU metrics"""
        self.gpu_memory_usage_bytes.labels(gpu_id=gpu_id).set(memory_used)
        self.gpu_utilization_percent.labels(gpu_id=gpu_id).set(utilization)
    
    def update_system_memory(self, memory_used: float):
        """Update system memory usage"""
        self.system_memory_usage_bytes.set(memory_used)
    
    def update_service_health(self, service_name: str, healthy: bool):
        """Update service health"""
        self.service_health.labels(service_name=service_name).set(1 if healthy else 0)
    
    def update_active_jobs(self, count: int):
        """Update active training jobs count"""
        self.active_training_jobs.set(count)
    
    def update_queue_size(self, priority: str, size: int):
        """Update queue size"""
        self.queue_size.labels(priority=priority).set(size)


class DatabaseManager:
    """Database connection manager"""
    
    def __init__(self):
        self.engine = None
        self.session_factory = None
    
    async def initialize(self):
        """Initialize database connection"""
        try:
            self.engine = create_async_engine(
                settings.database_url,
                pool_size=settings.database_pool_size,
                max_overflow=settings.database_max_overflow,
                echo=settings.debug,
                future=True
            )
            
            self.session_factory = async_sessionmaker(
                self.engine,
                class_=AsyncSession,
                expire_on_commit=False
            )
            
            # Test connection
            async with self.engine.begin() as conn:
                await conn.execute("SELECT 1")
            
            logger.info("Database connection initialized")
            
        except Exception as e:
            logger.error("Failed to initialize database", error=str(e))
            raise
    
    async def get_session(self) -> AsyncSession:
        """Get database session"""
        if not self.session_factory:
            await self.initialize()
        
        return self.session_factory()
    
    async def health_check(self) -> bool:
        """Check database health"""
        try:
            async with self.engine.begin() as conn:
                await conn.execute("SELECT 1")
            return True
        except Exception as e:
            logger.error("Database health check failed", error=str(e))
            return False
    
    async def cleanup(self):
        """Cleanup database connections"""
        if self.engine:
            await self.engine.dispose()
            logger.info("Database connections closed")


class RedisManager:
    """Redis connection manager"""
    
    def __init__(self):
        self.client = None
    
    async def initialize(self):
        """Initialize Redis connection"""
        try:
            self.client = aioredis.from_url(
                settings.redis_url,
                password=settings.redis_password,
                db=settings.redis_db,
                encoding="utf-8",
                decode_responses=True,
                retry_on_timeout=True,
                health_check_interval=30
            )
            
            # Test connection
            await self.client.ping()
            logger.info("Redis connection initialized")
            
        except Exception as e:
            logger.error("Failed to initialize Redis", error=str(e))
            raise
    
    async def get_client(self) -> aioredis.Redis:
        """Get Redis client"""
        if not self.client:
            await self.initialize()
        
        return self.client
    
    async def health_check(self) -> bool:
        """Check Redis health"""
        try:
            await self.client.ping()
            return True
        except Exception as e:
            logger.error("Redis health check failed", error=str(e))
            return False
    
    async def cleanup(self):
        """Cleanup Redis connections"""
        if self.client:
            await self.client.close()
            logger.info("Redis connections closed")


# Global managers
database_manager = DatabaseManager()
redis_manager = RedisManager()


async def initialize_dependencies():
    """Initialize all dependencies"""
    logger.info("Initializing dependencies")
    
    await database_manager.initialize()
    await redis_manager.initialize()
    
    logger.info("All dependencies initialized")


async def cleanup_dependencies():
    """Cleanup all dependencies"""
    logger.info("Cleaning up dependencies")
    
    await database_manager.cleanup()
    await redis_manager.cleanup()
    
    logger.info("All dependencies cleaned up")


# Export for easy importing
__all__ = [
    "get_database",
    "get_redis", 
    "get_metrics_collector",
    "MetricsCollector",
    "DatabaseManager",
    "RedisManager",
    "initialize_dependencies",
    "cleanup_dependencies"
]