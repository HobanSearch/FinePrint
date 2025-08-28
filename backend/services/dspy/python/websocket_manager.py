"""
WebSocket Manager
Real-time communication for DSPy optimization progress
"""

import asyncio
import json
from datetime import datetime
from typing import Dict, List, Any, Optional, Set
from fastapi import WebSocket, WebSocketDisconnect
from loguru import logger

class WebSocketManager:
    """Manages WebSocket connections for real-time optimization updates"""
    
    def __init__(self):
        # job_id -> set of WebSocket connections
        self.job_connections: Dict[str, Set[WebSocket]] = {}
        
        # WebSocket -> job_id mapping for cleanup
        self.connection_jobs: Dict[WebSocket, str] = {}
        
        # General broadcast connections (for global updates)
        self.broadcast_connections: Set[WebSocket] = set()
        
        logger.info("WebSocket Manager initialized")
    
    async def add_client(self, job_id: str, websocket: WebSocket):
        """Add WebSocket client for specific optimization job"""
        try:
            if job_id not in self.job_connections:
                self.job_connections[job_id] = set()
            
            self.job_connections[job_id].add(websocket)
            self.connection_jobs[websocket] = job_id
            
            logger.info(f"Added WebSocket client for job {job_id}")
            
            # Send initial connection confirmation
            await self._send_message(websocket, {
                "type": "connection_established",
                "job_id": job_id,
                "timestamp": datetime.utcnow().isoformat(),
                "message": f"Connected to optimization job {job_id}"
            })
            
        except Exception as e:
            logger.error(f"Failed to add WebSocket client: {e}")
    
    async def remove_client(self, job_id: str, websocket: WebSocket):
        """Remove WebSocket client"""
        try:
            if job_id in self.job_connections:
                self.job_connections[job_id].discard(websocket)
                
                # Clean up empty job connections
                if not self.job_connections[job_id]:
                    del self.job_connections[job_id]
            
            self.connection_jobs.pop(websocket, None)
            self.broadcast_connections.discard(websocket)
            
            logger.info(f"Removed WebSocket client for job {job_id}")
            
        except Exception as e:
            logger.error(f"Failed to remove WebSocket client: {e}")
    
    async def add_broadcast_client(self, websocket: WebSocket):
        """Add client for general broadcasts"""
        try:
            self.broadcast_connections.add(websocket)
            
            # Send welcome message
            await self._send_message(websocket, {
                "type": "broadcast_connected",
                "timestamp": datetime.utcnow().isoformat(),
                "message": "Connected to DSPy optimization broadcasts"
            })
            
            logger.info("Added broadcast WebSocket client")
            
        except Exception as e:
            logger.error(f"Failed to add broadcast client: {e}")
    
    async def broadcast_progress(self, job_id: str, progress_data: Dict[str, Any]):
        """Broadcast optimization progress to job-specific clients"""
        try:
            if job_id not in self.job_connections:
                return
            
            message = {
                "type": "optimization_progress",
                "job_id": job_id,
                "data": progress_data,
                "timestamp": datetime.utcnow().isoformat()
            }
            
            # Send to all clients connected to this job
            clients_to_remove = []
            for websocket in self.job_connections[job_id].copy():
                try:
                    await self._send_message(websocket, message)
                except WebSocketDisconnect:
                    clients_to_remove.append(websocket)
                except Exception as e:
                    logger.warning(f"Failed to send progress to client: {e}")
                    clients_to_remove.append(websocket)
            
            # Clean up disconnected clients
            for websocket in clients_to_remove:
                await self.remove_client(job_id, websocket)
            
            logger.debug(f"Broadcast progress for job {job_id} to {len(self.job_connections[job_id])} clients")
            
        except Exception as e:
            logger.error(f"Failed to broadcast progress: {e}")
    
    async def broadcast_job_status(self, job_id: str, status: str, message: str):
        """Broadcast job status change"""
        try:
            status_data = {
                "type": "job_status_change",
                "job_id": job_id,
                "status": status,
                "message": message,
                "timestamp": datetime.utcnow().isoformat()
            }
            
            # Send to job-specific clients
            await self.broadcast_progress(job_id, status_data)
            
            # Also send to broadcast listeners
            await self.broadcast_general(status_data)
            
        except Exception as e:
            logger.error(f"Failed to broadcast job status: {e}")
    
    async def broadcast_general(self, message_data: Dict[str, Any]):
        """Broadcast general message to all broadcast clients"""
        try:
            message = {
                "type": "general_broadcast",
                "data": message_data,
                "timestamp": datetime.utcnow().isoformat()
            }
            
            clients_to_remove = []
            for websocket in self.broadcast_connections.copy():
                try:
                    await self._send_message(websocket, message)
                except WebSocketDisconnect:
                    clients_to_remove.append(websocket)
                except Exception as e:
                    logger.warning(f"Failed to send broadcast to client: {e}")
                    clients_to_remove.append(websocket)
            
            # Clean up disconnected clients
            for websocket in clients_to_remove:
                self.broadcast_connections.discard(websocket)
            
            logger.debug(f"General broadcast sent to {len(self.broadcast_connections)} clients")
            
        except Exception as e:
            logger.error(f"Failed to send general broadcast: {e}")
    
    async def _send_message(self, websocket: WebSocket, message: Dict[str, Any]):
        """Send JSON message to WebSocket client"""
        try:
            await websocket.send_text(json.dumps(message))
        except WebSocketDisconnect:
            raise
        except Exception as e:
            logger.error(f"WebSocket send failed: {e}")
            raise
    
    async def send_job_completion(
        self,
        job_id: str,
        results: Dict[str, Any],
        success: bool = True
    ):
        """Send job completion notification"""
        try:
            completion_data = {
                "type": "job_completed" if success else "job_failed",
                "job_id": job_id,
                "results": results if success else None,
                "error": results if not success else None,
                "timestamp": datetime.utcnow().isoformat()
            }
            
            await self.broadcast_progress(job_id, completion_data)
            
            # Auto-disconnect clients after completion (with delay)
            asyncio.create_task(self._delayed_disconnect(job_id, delay_seconds=30))
            
        except Exception as e:
            logger.error(f"Failed to send job completion: {e}")
    
    async def _delayed_disconnect(self, job_id: str, delay_seconds: int = 30):
        """Disconnect clients after a delay"""
        try:
            await asyncio.sleep(delay_seconds)
            
            if job_id in self.job_connections:
                clients = list(self.job_connections[job_id])
                for websocket in clients:
                    try:
                        await self._send_message(websocket, {
                            "type": "auto_disconnect",
                            "job_id": job_id,
                            "message": "Job completed, disconnecting in 10 seconds",
                            "timestamp": datetime.utcnow().isoformat()
                        })
                        
                        await asyncio.sleep(10)
                        await websocket.close(code=1000, reason="Job completed")
                        
                    except Exception as e:
                        logger.warning(f"Failed to auto-disconnect client: {e}")
                
                # Clean up
                if job_id in self.job_connections:
                    del self.job_connections[job_id]
            
        except Exception as e:
            logger.error(f"Failed to perform delayed disconnect: {e}")
    
    def get_connection_stats(self) -> Dict[str, Any]:
        """Get WebSocket connection statistics"""
        try:
            return {
                "active_job_connections": len(self.job_connections),
                "total_job_clients": sum(len(clients) for clients in self.job_connections.values()),
                "broadcast_clients": len(self.broadcast_connections),
                "jobs_with_clients": list(self.job_connections.keys()),
                "timestamp": datetime.utcnow().isoformat()
            }
        except Exception as e:
            logger.error(f"Failed to get connection stats: {e}")
            return {}
    
    async def ping_all_clients(self):
        """Send ping to all connected clients to keep connections alive"""
        try:
            ping_message = {
                "type": "ping",
                "timestamp": datetime.utcnow().isoformat()
            }
            
            # Ping job-specific clients
            for job_id, clients in self.job_connections.items():
                for websocket in clients.copy():
                    try:
                        await websocket.ping()
                    except Exception:
                        await self.remove_client(job_id, websocket)
            
            # Ping broadcast clients
            for websocket in self.broadcast_connections.copy():
                try:
                    await websocket.ping()
                except Exception:
                    self.broadcast_connections.discard(websocket)
            
            logger.debug("Pinged all WebSocket clients")
            
        except Exception as e:
            logger.error(f"Failed to ping clients: {e}")
    
    async def cleanup_disconnected_clients(self):
        """Clean up disconnected WebSocket clients"""
        try:
            # Check job connections
            for job_id in list(self.job_connections.keys()):
                clients_to_remove = []
                
                for websocket in self.job_connections[job_id]:
                    try:
                        # Try to send a small message to check connection
                        await websocket.ping()
                    except Exception:
                        clients_to_remove.append(websocket)
                
                for websocket in clients_to_remove:
                    await self.remove_client(job_id, websocket)
            
            # Check broadcast connections
            clients_to_remove = []
            for websocket in self.broadcast_connections:
                try:
                    await websocket.ping()
                except Exception:
                    clients_to_remove.append(websocket)
            
            for websocket in clients_to_remove:
                self.broadcast_connections.discard(websocket)
            
            if clients_to_remove:
                logger.info(f"Cleaned up {len(clients_to_remove)} disconnected clients")
            
        except Exception as e:
            logger.error(f"Failed to cleanup disconnected clients: {e}")
    
    async def send_system_notification(
        self,
        notification_type: str,
        message: str,
        data: Optional[Dict[str, Any]] = None
    ):
        """Send system-wide notification"""
        try:
            notification = {
                "type": "system_notification",
                "notification_type": notification_type,
                "message": message,
                "data": data or {},
                "timestamp": datetime.utcnow().isoformat()
            }
            
            await self.broadcast_general(notification)
            
        except Exception as e:
            logger.error(f"Failed to send system notification: {e}")
    
    async def send_performance_update(
        self,
        job_id: str,
        metrics: Dict[str, float],
        iteration: int
    ):
        """Send performance metrics update"""
        try:
            update_data = {
                "type": "performance_update",
                "job_id": job_id,
                "iteration": iteration,
                "metrics": metrics,
                "timestamp": datetime.utcnow().isoformat()
            }
            
            await self.broadcast_progress(job_id, update_data)
            
        except Exception as e:
            logger.error(f"Failed to send performance update: {e}")
    
    async def start_periodic_cleanup(self, interval_seconds: int = 300):
        """Start periodic cleanup of disconnected clients"""
        try:
            while True:
                await asyncio.sleep(interval_seconds)
                await self.cleanup_disconnected_clients()
                await self.ping_all_clients()
                
        except asyncio.CancelledError:
            logger.info("Periodic cleanup cancelled")
        except Exception as e:
            logger.error(f"Periodic cleanup failed: {e}")
    
    def __len__(self) -> int:
        """Return total number of connected clients"""
        job_clients = sum(len(clients) for clients in self.job_connections.values())
        return job_clients + len(self.broadcast_connections)