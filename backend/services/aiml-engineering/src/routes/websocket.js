"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = websocketRoutes;
async function websocketRoutes(fastify) {
    fastify.get('/training/:jobId', { websocket: true }, (connection, request) => {
        const jobId = request.params.jobId;
        connection.socket.on('message', (message) => {
            const data = JSON.parse(message.toString());
            if (data.type === 'subscribe') {
                const aimlServices = fastify.aimlServices;
                const handleProgress = (progressData) => {
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
        const job = fastify.aimlServices.modelLifecycleManager.getJob(jobId);
        if (job) {
            connection.socket.send(JSON.stringify({
                type: 'job_status',
                data: job,
            }));
        }
    });
    fastify.get('/optimization/:studyId', { websocket: true }, (connection, request) => {
        const studyId = request.params.studyId;
        connection.socket.on('message', (message) => {
            const data = JSON.parse(message.toString());
            if (data.type === 'subscribe') {
                const aimlServices = fastify.aimlServices;
                const handleProgress = (progressData) => {
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
    fastify.get('/alerts', { websocket: true }, (connection, request) => {
        connection.socket.on('message', (message) => {
            const data = JSON.parse(message.toString());
            if (data.type === 'subscribe') {
                const aimlServices = fastify.aimlServices;
                const handleAlert = (alert) => {
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
    fastify.get('/system', { websocket: true }, (connection, request) => {
        let statusInterval;
        connection.socket.on('message', (message) => {
            const data = JSON.parse(message.toString());
            if (data.type === 'subscribe') {
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
//# sourceMappingURL=websocket.js.map