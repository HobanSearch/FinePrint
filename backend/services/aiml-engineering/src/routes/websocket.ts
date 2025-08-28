import { FastifyInstance } from 'fastify';
import { SocketStream } from '@fastify/websocket';

export default async function websocketRoutes(fastify: FastifyInstance) {
  // Real-time training progress updates
  fastify.get('/training/:jobId', { websocket: true }, (connection: SocketStream, request) => {
    const jobId = (request.params as any).jobId;
    
    connection.socket.on('message', (message) => {
      const data = JSON.parse(message.toString());
      
      if (data.type === 'subscribe') {
        // Register for training progress updates
        const aimlServices = fastify.aimlServices;
        
        const handleProgress = (progressData: any) => {
          if (progressData.jobId === jobId) {
            connection.socket.send(JSON.stringify({
              type: 'training_progress',
              data: progressData,
            }));
          }
        };
        
        aimlServices.modelLifecycleManager.on('training_progress', handleProgress);
        
        connection.socket.on('close', () => {
          aimlServices.modelLifecycleManager.off('training_progress', handleProgress);
        });
      }
    });
    
    // Send initial status
    const job = fastify.aimlServices.modelLifecycleManager.getJob(jobId);
    if (job) {
      connection.socket.send(JSON.stringify({
        type: 'job_status',
        data: job,
      }));
    }
  });

  // Real-time optimization study updates
  fastify.get('/optimization/:studyId', { websocket: true }, (connection: SocketStream, request) => {
    const studyId = (request.params as any).studyId;
    
    connection.socket.on('message', (message) => {
      const data = JSON.parse(message.toString());
      
      if (data.type === 'subscribe') {
        const aimlServices = fastify.aimlServices;
        
        const handleProgress = (progressData: any) => {
          if (progressData.studyId === studyId) {
            connection.socket.send(JSON.stringify({
              type: 'optimization_progress',
              data: progressData,
            }));
          }
        };
        
        aimlServices.hyperparameterOptimizer.on('optimization_progress', handleProgress);
        
        connection.socket.on('close', () => {
          aimlServices.hyperparameterOptimizer.off('optimization_progress', handleProgress);
        });
      }
    });
  });

  // Real-time performance alerts
  fastify.get('/alerts', { websocket: true }, (connection: SocketStream, request) => {
    connection.socket.on('message', (message) => {
      const data = JSON.parse(message.toString());
      
      if (data.type === 'subscribe') {
        const aimlServices = fastify.aimlServices;
        
        const handleAlert = (alert: any) => {
          connection.socket.send(JSON.stringify({
            type: 'performance_alert',
            data: alert,
          }));
        };
        
        aimlServices.performanceMonitor.on('alert_created', handleAlert);
        
        connection.socket.on('close', () => {
          aimlServices.performanceMonitor.off('alert_created', handleAlert);
        });
      }
    });
  });

  // System status updates
  fastify.get('/system', { websocket: true }, (connection: SocketStream, request) => {
    let statusInterval: NodeJS.Timeout;
    
    connection.socket.on('message', (message) => {
      const data = JSON.parse(message.toString());
      
      if (data.type === 'subscribe') {
        // Send system status every 30 seconds
        statusInterval = setInterval(() => {
          const systemStatus = {
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            cpu: process.cpuUsage(),
            services: {
              training_jobs: fastify.aimlServices.modelLifecycleManager.getServiceMetrics(),
              optimization_studies: fastify.aimlServices.hyperparameterOptimizer.getServiceMetrics(),
              models: fastify.aimlServices.modelRegistry.getServiceMetrics(),
              monitoring: fastify.aimlServices.performanceMonitor.getServiceMetrics(),
            },
          };
          
          connection.socket.send(JSON.stringify({
            type: 'system_status',
            data: systemStatus,
          }));
        }, 30000);
      }
    });
    
    connection.socket.on('close', () => {
      if (statusInterval) {
        clearInterval(statusInterval);
      }
    });
  });
}