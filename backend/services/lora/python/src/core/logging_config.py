"""
Logging configuration for Fine Print AI LoRA Training Service
"""

import logging
import sys
import json
from datetime import datetime
from typing import Any, Dict
from pathlib import Path

from rich.console import Console
from rich.logging import RichHandler

from .config import settings


class JSONFormatter(logging.Formatter):
    """JSON formatter for structured logging"""
    
    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }
        
        # Add extra fields
        if hasattr(record, "extra"):
            log_entry.update(record.extra)
            
        # Add exception info if present
        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)
            
        return json.dumps(log_entry, ensure_ascii=False)


def setup_logging() -> logging.Logger:
    """Setup logging configuration"""
    
    # Create logger
    logger = logging.getLogger("fineprintai.lora")
    logger.setLevel(getattr(logging, settings.log_level.upper()))
    
    # Clear existing handlers
    logger.handlers.clear()
    
    # Console handler
    if settings.log_format == "json":
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setFormatter(JSONFormatter())
    else:
        # Rich handler for development
        console = Console()
        console_handler = RichHandler(
            console=console,
            show_time=True,
            show_path=True,
            markup=True,
            rich_tracebacks=True,
            tracebacks_show_locals=True
        )
        console_handler.setFormatter(
            logging.Formatter(
                fmt="%(message)s",
                datefmt="[%X]"
            )
        )
    
    console_handler.setLevel(getattr(logging, settings.log_level.upper()))
    logger.addHandler(console_handler)
    
    # File handler if specified
    if settings.log_file:
        log_file_path = Path(settings.log_file)
        log_file_path.parent.mkdir(parents=True, exist_ok=True)
        
        file_handler = logging.FileHandler(log_file_path)
        file_handler.setFormatter(JSONFormatter())
        file_handler.setLevel(logging.DEBUG)
        logger.addHandler(file_handler)
    
    # Disable propagation to avoid duplicate logs
    logger.propagate = False
    
    # Set third-party logging levels
    logging.getLogger("transformers").setLevel(logging.WARNING)
    logging.getLogger("torch").setLevel(logging.WARNING)
    logging.getLogger("datasets").setLevel(logging.WARNING)
    logging.getLogger("asyncio").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    
    return logger


class ContextLogger:
    """Logger with context support"""
    
    def __init__(self, logger: logging.Logger, context: Dict[str, Any] = None):
        self.logger = logger
        self.context = context or {}
    
    def _log_with_context(self, level: int, message: str, **kwargs):
        """Log message with context"""
        extra = {"extra": {**self.context, **kwargs}}
        self.logger.log(level, message, extra=extra)
    
    def debug(self, message: str, **kwargs):
        self._log_with_context(logging.DEBUG, message, **kwargs)
    
    def info(self, message: str, **kwargs):
        self._log_with_context(logging.INFO, message, **kwargs)
    
    def warning(self, message: str, **kwargs):
        self._log_with_context(logging.WARNING, message, **kwargs)
    
    def error(self, message: str, **kwargs):
        self._log_with_context(logging.ERROR, message, **kwargs)
    
    def critical(self, message: str, **kwargs):
        self._log_with_context(logging.CRITICAL, message, **kwargs)
    
    def exception(self, message: str, **kwargs):
        """Log exception with traceback"""
        extra = {"extra": {**self.context, **kwargs}}
        self.logger.exception(message, extra=extra)
    
    def with_context(self, **context) -> "ContextLogger":
        """Create new logger with additional context"""
        new_context = {**self.context, **context}
        return ContextLogger(self.logger, new_context)


# Global logger instance
_logger = None


def get_logger(name: str = None, context: Dict[str, Any] = None) -> ContextLogger:
    """Get logger instance with optional context"""
    global _logger
    
    if _logger is None:
        _logger = setup_logging()
    
    if name:
        named_logger = _logger.getChild(name)
    else:
        named_logger = _logger
    
    return ContextLogger(named_logger, context)


# Export for easy importing
__all__ = ["setup_logging", "get_logger", "ContextLogger"]