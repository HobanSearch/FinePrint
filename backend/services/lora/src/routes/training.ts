import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const TrainingRoutes: FastifyPluginAsync = async (fastify) => {
  // Business domain training schema
  const BusinessTrainingJobSchema = z.object({
    domain: z.enum(['legal_analysis', 'marketing_content', 'sales_communication', 'customer_support']),
    baseModel: z.string().default('microsoft/DialoGPT-medium'),
    trainingData: z.array(z.object({
      document_text: z.string().optional(),
      analysis_result: z.string().optional(),
      campaign_objective: z.string().optional(),
      target_audience: z.string().optional(),
      brand_voice: z.string().optional(),
      generated_content: z.string().optional(),
      prospect_context: z.string().optional(),
      company: z.string().optional(),
      role: z.string().optional(),
      sales_stage: z.string().optional(),
      email_content: z.string().optional(),
      customer_issue: z.string().optional(),
      customer_tier: z.string().optional(),
      interaction_history: z.string().optional(),
      support_response: z.string().optional(),
    })).min(1),
    trainingConfig: z.object({
      epochs: z.number().min(1).max(100).default(3),
      batch_size: z.number().min(1).max(32).default(4),
      learning_rate: z.number().min(0.00001).max(0.01).default(0.0002),
      gradient_accumulation_steps: z.number().min(1).max(16).default(4),
    }).optional(),
  });

  // Start business domain training job
  fastify.post('/start', {
    schema: {
      body: {
        type: 'object',
        required: ['domain', 'trainingData'],
        properties: {
          domain: { 
            type: 'string', 
            enum: ['legal_analysis', 'marketing_content', 'sales_communication', 'customer_support'] 
          },
          baseModel: { type: 'string', default: 'microsoft/DialoGPT-medium' },
          trainingData: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              properties: {
                document_text: { type: 'string' },
                analysis_result: { type: 'string' },
                campaign_objective: { type: 'string' },
                target_audience: { type: 'string' },
                brand_voice: { type: 'string' },
                generated_content: { type: 'string' },
                prospect_context: { type: 'string' },
                company: { type: 'string' },
                role: { type: 'string' },
                sales_stage: { type: 'string' },
                email_content: { type: 'string' },
                customer_issue: { type: 'string' },
                customer_tier: { type: 'string' },
                interaction_history: { type: 'string' },
                support_response: { type: 'string' },
              }
            }
          },
          trainingConfig: {
            type: 'object',
            properties: {
              epochs: { type: 'number', minimum: 1, maximum: 100, default: 3 },
              batch_size: { type: 'number', minimum: 1, maximum: 32, default: 4 },
              learning_rate: { type: 'number', minimum: 0.00001, maximum: 0.01, default: 0.0002 },
              gradient_accumulation_steps: { type: 'number', minimum: 1, maximum: 16, default: 4 },
            }
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            job_id: { type: 'string' },
            domain: { type: 'string' },
            base_model: { type: 'string' },
            status: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const trainingRequest = BusinessTrainingJobSchema.parse(request.body);
      
      // Start training job with Python LoRA backend
      const trainingJob = await fastify.pythonLoRAIntegration.startTraining({
        domain: trainingRequest.domain,
        base_model: trainingRequest.baseModel,
        training_data: trainingRequest.trainingData,
        training_config: trainingRequest.trainingConfig,
      });
      
      return reply.code(200).send({
        success: true,
        job_id: trainingJob.job_id,
        domain: trainingJob.domain,
        base_model: trainingJob.base_model,
        status: trainingJob.status,
        message: trainingJob.message
      });
    } catch (error) {
      fastify.log.error('Failed to start training job:', error);
      return reply.code(500).send({
        success: false,
        job_id: '',
        domain: '',
        base_model: '',
        status: 'failed',
        message: error instanceof Error ? error.message : 'Failed to start training job'
      });
    }
  });

  // Get training job status
  fastify.get('/status', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            current_job: {
              type: 'object',
              properties: {
                job_id: { type: 'string' },
                domain: { type: 'string' },
                base_model: { type: 'string' },
                status: { type: 'string' },
                progress: { type: 'number' },
                message: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const status = await fastify.pythonLoRAIntegration.getTrainingStatus();
      return reply.code(200).send({ current_job: status });
    } catch (error) {
      fastify.log.error('Failed to get training status:', error);
      return reply.code(500).send({
        current_job: {
          status: 'idle'
        }
      });
    }
  });

  // Get training history
  fastify.get('/history', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            history: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  job_id: { type: 'string' },
                  domain: { type: 'string' },
                  base_model: { type: 'string' },
                  status: { type: 'string' },
                  created_at: { type: 'string' },
                  completed_at: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const history = await fastify.pythonLoRAIntegration.getTrainingHistory();
      return reply.code(200).send({ history });
    } catch (error) {
      fastify.log.error('Failed to get training history:', error);
      return reply.code(500).send({
        history: []
      });
    }
  });

  // List available adapters
  fastify.get('/adapters', {
    schema: {
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              job_id: { type: 'string' },
              domain: { type: 'string' },
              base_model: { type: 'string' },
              adapter_path: { type: 'string' },
              created_at: { type: 'string' },
              performance_metrics: {
                type: 'object',
                properties: {
                  final_loss: { type: 'number' },
                  parameters_added: { type: 'number' },
                  memory_overhead_mb: { type: 'number' },
                  inference_speedup: { type: 'number' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const adapters = await fastify.pythonLoRAIntegration.listAdapters();
      return reply.code(200).send(adapters);
    } catch (error) {
      fastify.log.error('Failed to list adapters:', error);
      return reply.code(500).send([]);
    }
  });

  // Evaluate adapter performance
  fastify.post('/evaluate', {
    schema: {
      body: {
        type: 'object',
        required: ['adapter_path', 'test_data'],
        properties: {
          adapter_path: { type: 'string' },
          test_data: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              properties: {
                document_text: { type: 'string' },
                analysis_result: { type: 'string' },
                campaign_objective: { type: 'string' },
                target_audience: { type: 'string' },
                brand_voice: { type: 'string' },
                generated_content: { type: 'string' },
                prospect_context: { type: 'string' },
                company: { type: 'string' },
                role: { type: 'string' },
                sales_stage: { type: 'string' },
                email_content: { type: 'string' },
                customer_issue: { type: 'string' },
                customer_tier: { type: 'string' },
                interaction_history: { type: 'string' },
                support_response: { type: 'string' },
              }
            }
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            adapter_path: { type: 'string' },
            average_score: { type: 'number' },
            total_samples: { type: 'number' },
            score_distribution: {
              type: 'object',
              properties: {
                min: { type: 'number' },
                max: { type: 'number' },
                std: { type: 'number' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { adapter_path, test_data } = request.body as { adapter_path: string; test_data: Array<Record<string, any>> };
      const evaluation = await fastify.pythonLoRAIntegration.evaluateAdapter(adapter_path, test_data);
      return reply.code(200).send(evaluation);
    } catch (error) {
      fastify.log.error('Failed to evaluate adapter:', error);
      return reply.code(500).send({
        adapter_path: '',
        average_score: 0,
        total_samples: 0,
        score_distribution: { min: 0, max: 0, std: 0 }
      });
    }
  });

  // Deploy adapter to Ollama
  fastify.post('/deploy', {
    schema: {
      body: {
        type: 'object',
        required: ['adapter_path', 'model_name'],
        properties: {
          adapter_path: { type: 'string' },
          model_name: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            deployment_info: {
              type: 'object',
              properties: {
                model_name: { type: 'string' },
                adapter_path: { type: 'string' },
                modelfile_path: { type: 'string' },
                deployed_at: { type: 'string' },
                base_model: { type: 'string' },
                domain: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { adapter_path, model_name } = request.body as { adapter_path: string; model_name: string };
      const deploymentInfo = await fastify.pythonLoRAIntegration.deployAdapter(adapter_path, model_name);
      return reply.code(200).send({ deployment_info: deploymentInfo });
    } catch (error) {
      fastify.log.error('Failed to deploy adapter:', error);
      return reply.code(500).send({
        deployment_info: {
          model_name: '',
          adapter_path: '',
          modelfile_path: '',
          deployed_at: '',
          base_model: '',
          domain: ''
        }
      });
    }
  });

  // Demo endpoints for development
  fastify.post('/demo/generate-sample-data', {
    schema: {
      querystring: {
        type: 'object',
        required: ['domain'],
        properties: {
          domain: { 
            type: 'string', 
            enum: ['legal_analysis', 'marketing_content', 'sales_communication', 'customer_support'] 
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            sample_data: {
              type: 'array',
              items: { type: 'object' }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { domain } = request.query as { domain: string };
      const sampleData = await fastify.pythonLoRAIntegration.generateSampleData(domain);
      return reply.code(200).send({ sample_data: sampleData });
    } catch (error) {
      fastify.log.error('Failed to generate sample data:', error);
      return reply.code(500).send({
        sample_data: []
      });
    }
  });

  // Quick demo training with sample data
  fastify.post('/demo/quick-train', {
    schema: {
      querystring: {
        type: 'object',
        required: ['domain'],
        properties: {
          domain: { 
            type: 'string', 
            enum: ['legal_analysis', 'marketing_content', 'sales_communication', 'customer_support'] 
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            training_response: {
              type: 'object',
              properties: {
                job_id: { type: 'string' },
                domain: { type: 'string' },
                base_model: { type: 'string' },
                status: { type: 'string' },
                message: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { domain } = request.query as { domain: string };
      const trainingJob = await fastify.pythonLoRAIntegration.quickTrainDemo(domain);
      return reply.code(200).send({ training_response: trainingJob });
    } catch (error) {
      fastify.log.error('Failed to start quick training demo:', error);
      return reply.code(500).send({
        training_response: {
          job_id: '',
          domain: '',
          base_model: '',
          status: 'failed',
          message: error instanceof Error ? error.message : 'Failed to start demo training'
        }
      });
    }
  });
};

export default TrainingRoutes;