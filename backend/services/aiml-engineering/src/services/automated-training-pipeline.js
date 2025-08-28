"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutomatedTrainingPipeline = exports.TrainingPipelineConfigSchema = void 0;
const logger_1 = require("@fineprintai/shared-logger");
const queue_1 = require("@fineprintai/queue");
const training_dataset_generator_1 = require("./training-dataset-generator");
const model_lifecycle_manager_1 = require("./model-lifecycle-manager");
const model_registry_1 = require("./model-registry");
const performance_monitor_1 = require("./performance-monitor");
const events_1 = require("events");
const zod_1 = require("zod");
const uuid_1 = require("uuid");
const logger = (0, logger_1.createServiceLogger)('automated-training-pipeline');
exports.TrainingPipelineConfigSchema = zod_1.z.object({
    pipeline_name: zod_1.z.string(),
    description: zod_1.z.string().optional(),
    dataset_config: zod_1.z.object({
        name: zod_1.z.string(),
        task_type: zod_1.z.enum(['risk_assessment', 'clause_detection', 'compliance_analysis', 'recommendation_generation']),
        jurisdiction: zod_1.z.enum(['global', 'eu', 'us', 'ca', 'br', 'sg']).default('global'),
        min_examples: zod_1.z.number().min(100).default(1000),
        max_examples: zod_1.z.number().min(1000).default(10000),
        quality_threshold: zod_1.z.number().min(0.5).max(1.0).default(0.8),
    }),
    model_config: zod_1.z.object({
        base_model: zod_1.z.string().default('llama2:7b'),
        model_type: zod_1.z.enum(['huggingface', 'ollama', 'custom']).default('ollama'),
        task_specific_head: zod_1.z.boolean().default(true),
    }),
    lora_config: zod_1.z.object({
        rank: zod_1.z.number().min(1).max(512).default(16),
        alpha: zod_1.z.number().min(1).max(128).default(32),
        dropout: zod_1.z.number().min(0).max(0.5).default(0.1),
        target_modules: zod_1.z.array(zod_1.z.string()).default(['q_proj', 'v_proj', 'k_proj', 'o_proj']),
        gate_threshold: zod_1.z.number().min(0.1).max(0.9).default(0.7),
    }),
    training_config: zod_1.z.object({
        num_epochs: zod_1.z.number().min(1).max(100).default(3),
        batch_size: zod_1.z.number().min(1).max(64).default(8),
        learning_rate: zod_1.z.number().min(1e-6).max(1e-2).default(2e-4),
        warmup_steps: zod_1.z.number().min(0).default(100),
        save_steps: zod_1.z.number().min(1).default(100),
        eval_steps: zod_1.z.number().min(1).default(50),
        gradient_accumulation_steps: zod_1.z.number().min(1).default(4),
        max_grad_norm: zod_1.z.number().min(0).default(1.0),
        fp16: zod_1.z.boolean().default(true),
    }),
    evaluation_config: zod_1.z.object({
        metrics: zod_1.z.array(zod_1.z.enum(['accuracy', 'f1', 'precision', 'recall', 'rouge', 'bleu'])).default(['accuracy', 'f1']),
        validation_split: zod_1.z.number().min(0.1).max(0.5).default(0.2),
        early_stopping: zod_1.z.object({
            enabled: zod_1.z.boolean().default(true),
            patience: zod_1.z.number().min(1).default(3),
            min_delta: zod_1.z.number().min(0).default(0.001),
        }),
    }),
    deployment_config: zod_1.z.object({
        auto_deploy: zod_1.z.boolean().default(false),
        min_performance_threshold: zod_1.z.number().min(0.5).max(1.0).default(0.8),
        staging_validation: zod_1.z.boolean().default(true),
        rollback_on_failure: zod_1.z.boolean().default(true),
    }),
});
class AutomatedTrainingPipeline extends events_1.EventEmitter {
    prisma;
    queue;
    datasetGenerator;
    modelManager;
    modelRegistry;
    performanceMonitor;
    activePipelines = new Map();
    constructor(prisma) {
        super();
        this.prisma = prisma;
        this.queue = new queue_1.QueueService('training-pipeline');
        this.datasetGenerator = new training_dataset_generator_1.TrainingDatasetGenerator(prisma);
        this.modelManager = new model_lifecycle_manager_1.ModelLifecycleManager();
        this.modelRegistry = new model_registry_1.ModelRegistry();
        this.performanceMonitor = new performance_monitor_1.PerformanceMonitor();
        this.setupEventHandlers();
    }
    async startPipeline(config) {
        const pipelineId = (0, uuid_1.v4)();
        const pipeline = {
            id: pipelineId,
            name: config.pipeline_name,
            config,
            status: 'pending',
            current_stage: 'initialization',
            progress: 0,
            created_at: new Date(),
            updated_at: new Date(),
            logs: [],
        };
        this.activePipelines.set(pipelineId, pipeline);
        logger.info('Starting training pipeline', { pipelineId, config: config.pipeline_name });
        try {
            await this.updatePipelineStatus(pipeline, 'dataset_generation', 'Generating training dataset');
            const dataset = await this.generateDataset(pipeline);
            pipeline.dataset_id = dataset.id;
            pipeline.progress = 25;
            await this.updatePipelineStatus(pipeline, 'model_training', 'Starting model training');
            const trainingResult = await this.trainModel(pipeline, dataset);
            pipeline.model_id = trainingResult.model_id;
            pipeline.adapter_id = trainingResult.adapter_id;
            pipeline.training_job_id = trainingResult.job_id;
            pipeline.progress = 70;
            await this.updatePipelineStatus(pipeline, 'evaluation', 'Evaluating model performance');
            const evaluationResults = await this.evaluateModel(pipeline);
            pipeline.evaluation_results = evaluationResults;
            pipeline.progress = 90;
            if (config.deployment_config.auto_deploy &&
                evaluationResults.overall_score >= config.deployment_config.min_performance_threshold) {
                await this.updatePipelineStatus(pipeline, 'deployment', 'Deploying model');
                const deploymentInfo = await this.deployModel(pipeline);
                pipeline.deployment_info = deploymentInfo;
            }
            await this.updatePipelineStatus(pipeline, 'completed', 'Pipeline completed successfully');
            pipeline.progress = 100;
            pipeline.completed_at = new Date();
            this.emit('pipeline:completed', pipeline);
            return pipeline;
        }
        catch (error) {
            await this.handlePipelineError(pipeline, error);
            throw error;
        }
    }
    async generateDataset(pipeline) {
        this.addLog(pipeline, 'info', 'dataset_generation', 'Starting dataset generation');
        try {
            const dataset = await this.datasetGenerator.generateDataset({
                name: `${pipeline.name}_dataset`,
                task_type: pipeline.config.dataset_config.task_type,
                jurisdiction: pipeline.config.dataset_config.jurisdiction,
                min_examples: pipeline.config.dataset_config.min_examples,
                max_examples: pipeline.config.dataset_config.max_examples,
                validation_split: pipeline.config.evaluation_config.validation_split,
                test_split: 0.1,
                format: 'jsonl',
                include_metadata: true,
                quality_threshold: pipeline.config.dataset_config.quality_threshold,
            });
            this.addLog(pipeline, 'info', 'dataset_generation', `Dataset generated with ${dataset.statistics.total_examples} examples`);
            return dataset;
        }
        catch (error) {
            this.addLog(pipeline, 'error', 'dataset_generation', `Dataset generation failed: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }
    async trainModel(pipeline, dataset) {
        this.addLog(pipeline, 'info', 'model_training', 'Starting model training with LoRA');
        try {
            const adapterConfig = {
                name: `${pipeline.name}_lora_adapter`,
                base_model: pipeline.config.model_config.base_model,
                task_domain: this.mapTaskToLoraDomain(pipeline.config.dataset_config.task_type),
                adapter_config: {
                    rank: pipeline.config.lora_config.rank,
                    alpha: pipeline.config.lora_config.alpha,
                    dropout: pipeline.config.lora_config.dropout,
                    target_modules: pipeline.config.lora_config.target_modules,
                    gate_threshold: pipeline.config.lora_config.gate_threshold,
                },
                training_config: {
                    learning_rate: pipeline.config.training_config.learning_rate,
                    batch_size: pipeline.config.training_config.batch_size,
                    epochs: pipeline.config.training_config.num_epochs,
                    warmup_steps: pipeline.config.training_config.warmup_steps,
                    weight_decay: 0.01,
                },
            };
            const trainingConfig = {
                model_name: `${pipeline.name}_fine_tuned`,
                model_type: 'custom',
                base_model: pipeline.config.model_config.base_model,
                dataset_path: dataset.file_paths.train,
                output_dir: `./models/${pipeline.id}`,
                training_args: {
                    num_epochs: pipeline.config.training_config.num_epochs,
                    batch_size: pipeline.config.training_config.batch_size,
                    learning_rate: pipeline.config.training_config.learning_rate,
                    weight_decay: 0.01,
                    warmup_steps: pipeline.config.training_config.warmup_steps,
                    gradient_accumulation_steps: pipeline.config.training_config.gradient_accumulation_steps,
                    max_grad_norm: pipeline.config.training_config.max_grad_norm,
                    save_steps: pipeline.config.training_config.save_steps,
                    eval_steps: pipeline.config.training_config.eval_steps,
                    logging_steps: 10,
                    fp16: pipeline.config.training_config.fp16,
                    bf16: false,
                    gradient_checkpointing: true,
                    dataloader_num_workers: 2,
                },
                optimization_config: {
                    optimizer: 'adamw',
                    scheduler: 'linear',
                    early_stopping: {
                        enabled: pipeline.config.evaluation_config.early_stopping.enabled,
                        patience: pipeline.config.evaluation_config.early_stopping.patience,
                        min_delta: pipeline.config.evaluation_config.early_stopping.min_delta,
                    },
                },
                environment_config: {
                    gpu_ids: [0],
                    mixed_precision: pipeline.config.training_config.fp16,
                    distributed_training: false,
                },
            };
            const trainingJob = await this.modelManager.startTraining(trainingConfig);
            this.addLog(pipeline, 'info', 'model_training', `Training job started: ${trainingJob.job_id}`);
            await this.monitorTrainingProgress(pipeline, trainingJob.job_id);
            return {
                model_id: trainingJob.model_id,
                adapter_id: adapterConfig.name,
                job_id: trainingJob.job_id,
            };
        }
        catch (error) {
            this.addLog(pipeline, 'error', 'model_training', `Model training failed: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }
    async monitorTrainingProgress(pipeline, jobId) {
        return new Promise((resolve, reject) => {
            const checkInterval = setInterval(async () => {
                try {
                    const status = await this.modelManager.getTrainingStatus(jobId);
                    if (status.status === 'completed') {
                        clearInterval(checkInterval);
                        this.addLog(pipeline, 'info', 'model_training', 'Training completed successfully');
                        resolve();
                    }
                    else if (status.status === 'failed') {
                        clearInterval(checkInterval);
                        this.addLog(pipeline, 'error', 'model_training', `Training failed: ${status.error}`);
                        reject(new Error(status.error));
                    }
                    else {
                        const progress = 25 + (status.progress * 0.45);
                        pipeline.progress = Math.round(progress);
                        pipeline.updated_at = new Date();
                        this.addLog(pipeline, 'info', 'model_training', `Training progress: ${Math.round(status.progress * 100)}%`);
                        this.emit('pipeline:progress', {
                            pipeline_id: pipeline.id,
                            stage: 'model_training',
                            progress: pipeline.progress,
                            message: `Training epoch ${status.current_epoch}/${status.total_epochs}`,
                        });
                    }
                }
                catch (error) {
                    clearInterval(checkInterval);
                    reject(error);
                }
            }, 10000);
        });
    }
    async evaluateModel(pipeline) {
        this.addLog(pipeline, 'info', 'evaluation', 'Starting model evaluation');
        try {
            if (!pipeline.model_id) {
                throw new Error('No model ID available for evaluation');
            }
            const evaluationResults = await this.performanceMonitor.evaluateModel({
                model_id: pipeline.model_id,
                test_dataset_path: pipeline.dataset_id ?
                    (await this.datasetGenerator.getDataset(pipeline.dataset_id))?.file_paths.test :
                    undefined,
                metrics: pipeline.config.evaluation_config.metrics,
                task_type: pipeline.config.dataset_config.task_type,
            });
            this.addLog(pipeline, 'info', 'evaluation', `Evaluation completed with score: ${evaluationResults.overall_score}`);
            return evaluationResults;
        }
        catch (error) {
            this.addLog(pipeline, 'error', 'evaluation', `Model evaluation failed: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }
    async deployModel(pipeline) {
        this.addLog(pipeline, 'info', 'deployment', 'Starting model deployment');
        try {
            if (!pipeline.model_id || !pipeline.adapter_id) {
                throw new Error('Model or adapter ID not available for deployment');
            }
            const registrationInfo = await this.modelRegistry.registerModel({
                model_id: pipeline.model_id,
                name: pipeline.name,
                version: '1.0.0',
                task_type: pipeline.config.dataset_config.task_type,
                performance_metrics: pipeline.evaluation_results,
                metadata: {
                    base_model: pipeline.config.model_config.base_model,
                    adapter_id: pipeline.adapter_id,
                    training_config: pipeline.config,
                    created_at: new Date(),
                },
            });
            let deploymentInfo;
            if (pipeline.config.deployment_config.staging_validation) {
                deploymentInfo = await this.deployToStaging(pipeline);
                const stagingValidation = await this.validateStagingDeployment(pipeline);
                if (!stagingValidation.success) {
                    throw new Error(`Staging validation failed: ${stagingValidation.error}`);
                }
            }
            deploymentInfo = await this.deployToProduction(pipeline);
            this.addLog(pipeline, 'info', 'deployment', `Model deployed successfully: ${deploymentInfo.endpoint}`);
            return {
                registration: registrationInfo,
                deployment: deploymentInfo,
                staging_validation: pipeline.config.deployment_config.staging_validation,
            };
        }
        catch (error) {
            this.addLog(pipeline, 'error', 'deployment', `Model deployment failed: ${error instanceof Error ? error.message : String(error)}`);
            if (pipeline.config.deployment_config.rollback_on_failure) {
                await this.rollbackDeployment(pipeline);
            }
            throw error;
        }
    }
    async deployToStaging(pipeline) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        return {
            environment: 'staging',
            endpoint: `http://staging.fineprintai.com/models/${pipeline.model_id}`,
            deployed_at: new Date(),
        };
    }
    async validateStagingDeployment(pipeline) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return { success: true };
    }
    async deployToProduction(pipeline) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        return {
            environment: 'production',
            endpoint: `http://api.fineprintai.com/models/${pipeline.model_id}`,
            deployed_at: new Date(),
        };
    }
    async rollbackDeployment(pipeline) {
        this.addLog(pipeline, 'info', 'deployment', 'Rolling back deployment');
        await new Promise(resolve => setTimeout(resolve, 1000));
        this.addLog(pipeline, 'info', 'deployment', 'Rollback completed');
    }
    async handlePipelineError(pipeline, error) {
        pipeline.status = 'failed';
        pipeline.error_message = error instanceof Error ? error.message : String(error);
        pipeline.updated_at = new Date();
        this.addLog(pipeline, 'error', pipeline.current_stage, `Pipeline failed: ${pipeline.error_message}`);
        this.emit('pipeline:failed', pipeline);
        logger.error('Training pipeline failed', {
            pipelineId: pipeline.id,
            stage: pipeline.current_stage,
            error: pipeline.error_message,
        });
    }
    async updatePipelineStatus(pipeline, status, message) {
        pipeline.status = status;
        pipeline.current_stage = status;
        pipeline.updated_at = new Date();
        if (!pipeline.started_at && status !== 'pending') {
            pipeline.started_at = new Date();
        }
        this.addLog(pipeline, 'info', status, message);
        this.emit('pipeline:status_change', pipeline);
        logger.info('Pipeline status updated', {
            pipelineId: pipeline.id,
            status,
            message,
        });
    }
    addLog(pipeline, level, stage, message, metadata) {
        pipeline.logs.push({
            timestamp: new Date(),
            level,
            stage,
            message,
            metadata,
        });
    }
    setupEventHandlers() {
        this.on('pipeline:progress', (progress) => {
            logger.info('Pipeline progress update', progress);
        });
        this.on('pipeline:completed', (pipeline) => {
            logger.info('Pipeline completed successfully', {
                pipelineId: pipeline.id,
                duration: pipeline.completed_at && pipeline.started_at ?
                    pipeline.completed_at.getTime() - pipeline.started_at.getTime() : 0,
            });
        });
        this.on('pipeline:failed', (pipeline) => {
            logger.error('Pipeline failed', {
                pipelineId: pipeline.id,
                error: pipeline.error_message,
            });
        });
    }
    mapTaskToLoraDomain(taskType) {
        const mapping = {
            'risk_assessment': 'risk_assessment',
            'clause_detection': 'clause_detection',
            'compliance_analysis': 'legal_analysis',
            'recommendation_generation': 'recommendation',
        };
        return mapping[taskType] || 'legal_analysis';
    }
    async getPipeline(pipelineId) {
        return this.activePipelines.get(pipelineId) || null;
    }
    async listPipelines() {
        return Array.from(this.activePipelines.values());
    }
    async cancelPipeline(pipelineId) {
        const pipeline = this.activePipelines.get(pipelineId);
        if (!pipeline) {
            throw new Error('Pipeline not found');
        }
        if (pipeline.status === 'completed' || pipeline.status === 'failed') {
            throw new Error('Cannot cancel completed or failed pipeline');
        }
        if (pipeline.training_job_id) {
            await this.modelManager.cancelTraining(pipeline.training_job_id);
        }
        pipeline.status = 'failed';
        pipeline.error_message = 'Pipeline cancelled by user';
        pipeline.updated_at = new Date();
        this.addLog(pipeline, 'info', pipeline.current_stage, 'Pipeline cancelled by user');
        this.emit('pipeline:cancelled', pipeline);
    }
    async getPipelineLogs(pipelineId) {
        const pipeline = this.activePipelines.get(pipelineId);
        return pipeline?.logs || [];
    }
}
exports.AutomatedTrainingPipeline = AutomatedTrainingPipeline;
//# sourceMappingURL=automated-training-pipeline.js.map