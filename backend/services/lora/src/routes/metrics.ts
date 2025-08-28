import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const MetricsRoutes: FastifyPluginAsync = async (fastify) => {
  // Get system metrics
  fastify.get('/system', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            timestamp: { type: 'string' },
            system: {
              type: 'object',
              properties: {
                cpu: {
                  type: 'object',
                  properties: {
                    usage: { type: 'number' },
                    cores: { type: 'number' }
                  }
                },
                memory: {
                  type: 'object',
                  properties: {
                    used: { type: 'number' },
                    total: { type: 'number' },
                    percentage: { type: 'number' }
                  }
                },
                disk: {
                  type: 'object',
                  properties: {
                    used: { type: 'number' },
                    total: { type: 'number' },
                    percentage: { type: 'number' }
                  }
                },
                gpu: {
                  type: 'object',
                  properties: {
                    count: { type: 'number' },
                    utilization: {
                      type: 'array',
                      items: { type: 'number' }
                    },
                    memory: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          used: { type: 'number' },
                          total: { type: 'number' },
                          percentage: { type: 'number' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const systemMetrics = await fastify.performanceMonitor.getSystemMetrics();
      return reply.code(200).send({
        timestamp: new Date().toISOString(),
        system: systemMetrics
      });
    } catch (error) {
      fastify.log.error('Failed to get system metrics:', error);
      return reply.code(500).send({
        timestamp: new Date().toISOString(),
        system: {
          cpu: { usage: 0, cores: 0 },
          memory: { used: 0, total: 0, percentage: 0 },
          disk: { used: 0, total: 0, percentage: 0 }
        }
      });
    }
  });

  // Get training metrics
  fastify.get('/training/:jobId', {
    schema: {
      params: {
        type: 'object',
        required: ['jobId'],
        properties: {
          jobId: { type: 'string' }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          timeRange: { type: 'string', enum: ['1h', '6h', '24h', '7d'], default: '1h' },
          metric: { type: 'string', enum: ['loss', 'accuracy', 'learning_rate', 'gpu_utilization'] }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            jobId: { type: 'string' },
            timeRange: { type: 'string' },
            metrics: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  timestamp: { type: 'string' },
                  step: { type: 'number' },
                  epoch: { type: 'number' },
                  trainLoss: { type: 'number' },
                  evalLoss: { type: 'number' },
                  accuracy: { type: 'number' },
                  learningRate: { type: 'number' },
                  gpuUtilization: { type: 'number' },
                  memoryUsage: { type: 'number' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { jobId } = request.params as { jobId: string };
      const { timeRange, metric } = request.query as { timeRange: '1h' | '6h' | '24h' | '7d'; metric?: 'loss' | 'accuracy' | 'learning_rate' | 'gpu_utilization' };
      
      const trainingMetrics = await fastify.performanceMonitor.getTrainingMetrics(
        jobId,
        { timeRange, metric }
      );
      
      return reply.code(200).send({
        jobId,
        timeRange,
        metrics: trainingMetrics
      });
    } catch (error) {
      fastify.log.error('Failed to get training metrics:', error);
      return reply.code(404).send({
        jobId: (request.params as { jobId: string }).jobId,
        timeRange: (request.query as { timeRange?: string }).timeRange || '1h',
        metrics: []
      });
    }
  });

  // Get service health metrics
  fastify.get('/health', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
            timestamp: { type: 'string' },
            services: {
              type: 'object',
              properties: {
                database: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', enum: ['up', 'down'] },
                    responseTime: { type: 'number' },
                    lastChecked: { type: 'string' }
                  }
                },
                redis: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', enum: ['up', 'down'] },
                    responseTime: { type: 'number' },
                    lastChecked: { type: 'string' }
                  }
                },
                gatedLoRA: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', enum: ['up', 'down'] },
                    activeJobs: { type: 'number' },
                    queueSize: { type: 'number' },
                    lastChecked: { type: 'string' }
                  }
                }
              }
            },
            performance: {
              type: 'object',
              properties: {
                requestsPerSecond: { type: 'number' },
                averageResponseTime: { type: 'number' },
                errorRate: { type: 'number' },
                uptime: { type: 'number' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const healthMetrics = await fastify.performanceMonitor.getHealthMetrics();
      return reply.code(200).send({
        status: healthMetrics.status,
        timestamp: new Date().toISOString(),
        services: healthMetrics.services,
        performance: healthMetrics.performance
      });
    } catch (error) {
      fastify.log.error('Failed to get health metrics:', error);
      return reply.code(500).send({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        services: {
          database: { status: 'down', responseTime: 0, lastChecked: new Date().toISOString() },
          redis: { status: 'down', responseTime: 0, lastChecked: new Date().toISOString() },
          gatedLoRA: { status: 'down', activeJobs: 0, queueSize: 0, lastChecked: new Date().toISOString() }
        },
        performance: {
          requestsPerSecond: 0,
          averageResponseTime: 0,
          errorRate: 1,
          uptime: 0
        }
      });
    }
  });

  // Get model performance metrics
  fastify.get('/model/:modelName/:version', {
    schema: {
      params: {
        type: 'object',
        required: ['modelName', 'version'],
        properties: {
          modelName: { type: 'string' },
          version: { type: 'string' }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          timeRange: { type: 'string', enum: ['1h', '6h', '24h', '7d'], default: '1h' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            modelName: { type: 'string' },
            version: { type: 'string' },
            timeRange: { type: 'string' },
            metrics: {
              type: 'object',
              properties: {
                inferenceCount: { type: 'number' },
                averageLatency: { type: 'number' },
                p95Latency: { type: 'number' },
                p99Latency: { type: 'number' },
                errorRate: { type: 'number' },
                throughput: { type: 'number' },
                accuracy: { type: 'number' },
                memoryUsage: { type: 'number' },
                diskUsage: { type: 'number' }
              }
            },
            timeSeries: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  timestamp: { type: 'string' },
                  latency: { type: 'number' },
                  throughput: { type: 'number' },
                  errors: { type: 'number' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { modelName, version } = request.params as { modelName: string; version: string };
      const { timeRange } = request.query as { timeRange: '1h' | '6h' | '24h' | '7d' };
      
      const modelMetrics = await fastify.performanceMonitor.getModelMetrics(
        modelName,
        version,
        timeRange
      );
      
      return reply.code(200).send({
        modelName,
        version,
        timeRange,
        metrics: modelMetrics.summary,
        timeSeries: modelMetrics.timeSeries
      });
    } catch (error) {
      fastify.log.error('Failed to get model metrics:', error);
      return reply.code(404).send({
        modelName: (request.params as { modelName: string }).modelName,
        version: (request.params as { version: string }).version,
        timeRange: (request.query as { timeRange?: string }).timeRange || '1h',
        metrics: {
          inferenceCount: 0,
          averageLatency: 0,
          p95Latency: 0,
          p99Latency: 0,
          errorRate: 0,
          throughput: 0,
          memoryUsage: 0,
          diskUsage: 0
        },
        timeSeries: []
      });
    }
  });

  // Get queue metrics
  fastify.get('/queue', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          queueName: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            queues: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  waiting: { type: 'number' },
                  active: { type: 'number' },
                  completed: { type: 'number' },
                  failed: { type: 'number' },
                  delayed: { type: 'number' },
                  paused: { type: 'boolean' },
                  processingRate: { type: 'number' },
                  avgProcessingTime: { type: 'number' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { queueName } = request.query as { queueName?: string };
      const queueMetrics = await fastify.performanceMonitor.getQueueMetrics(queueName);
      
      return reply.code(200).send({
        queues: queueMetrics
      });
    } catch (error) {
      fastify.log.error('Failed to get queue metrics:', error);
      return reply.code(500).send({
        queues: []
      });
    }
  });

  // Export metrics in Prometheus format
  fastify.get('/prometheus', async (request, reply) => {
    try {
      const prometheusMetrics = await fastify.performanceMonitor.getPrometheusMetrics();
      
      return reply
        .type('text/plain; version=0.0.4; charset=utf-8')
        .code(200)
        .send(prometheusMetrics);
    } catch (error) {
      fastify.log.error('Failed to get Prometheus metrics:', error);
      return reply.code(500).send('# Failed to generate metrics\n');
    }
  });
};

export default MetricsRoutes;