export interface ModelMetadata {
  name: string;
  version: string;
  description?: string;
  tags: string[];
  size?: number;
  parameters?: number;
  architecture?: string;
  baseModel?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ModelDetails extends ModelMetadata {
  adapters: Array<{
    adapterId: string;
    name: string;
    status: string;
    createdAt: string;
  }>;
  metrics?: {
    accuracy?: number;
    f1Score?: number;
    precision?: number;
    recall?: number;
    perplexity?: number;
  };
}

export class ModelRegistry {
  private models = new Map<string, ModelMetadata>();
  private modelCounter = 0;

  async listModels(options: {
    baseModel?: string;
    tags?: string[];
    limit: number;
    offset: number;
  }): Promise<{
    models: Array<ModelMetadata & { createdAt: string; updatedAt: string }>;
    total: number;
    limit: number;
    offset: number;
  }> {
    let allModels = Array.from(this.models.values());
    
    // Filter by base model
    if (options.baseModel) {
      allModels = allModels.filter(model => model.baseModel === options.baseModel);
    }
    
    // Filter by tags
    if (options.tags && options.tags.length > 0) {
      allModels = allModels.filter(model =>
        options.tags!.some(tag => model.tags.includes(tag))
      );
    }
    
    const total = allModels.length;
    const models: Array<ModelMetadata & { createdAt: string; updatedAt: string }> = allModels
      .slice(options.offset, options.offset + options.limit)
      .map(model => ({
        name: model.name,
        version: model.version,
        description: model.description,
        tags: model.tags,
        size: model.size,
        parameters: model.parameters,
        architecture: model.architecture,
        baseModel: model.baseModel,
        createdAt: model.createdAt.toISOString(),
        updatedAt: model.updatedAt.toISOString()
      } as ModelMetadata & { createdAt: string; updatedAt: string }));
    
    return {
      models,
      total,
      limit: options.limit,
      offset: options.offset
    };
  }

  async getModelDetails(modelName: string, version: string): Promise<ModelDetails> {
    const key = `${modelName}:${version}`;
    const model = this.models.get(key);
    
    if (!model) {
      throw new Error(`Model ${modelName}:${version} not found`);
    }
    
    // Mock adapters and metrics data
    const adapters = [
      {
        adapterId: 'adapter_1',
        name: 'Legal Document Classification',
        status: 'completed',
        createdAt: new Date().toISOString()
      },
      {
        adapterId: 'adapter_2',
        name: 'Privacy Policy Analysis',
        status: 'training',
        createdAt: new Date().toISOString()
      }
    ];
    
    const metrics = {
      accuracy: 0.92,
      f1Score: 0.89,
      precision: 0.91,
      recall: 0.87,
      perplexity: 3.21
    };
    
    return {
      ...model,
      adapters,
      metrics,
      createdAt: model.createdAt,
      updatedAt: model.updatedAt
    };
  }

  async registerModel(modelData: Omit<ModelMetadata, 'createdAt' | 'updatedAt'>): Promise<{ modelId: string }> {
    const key = `${modelData.name}:${modelData.version}`;
    const modelId = `model_${++this.modelCounter}_${Date.now()}`;
    
    const model: ModelMetadata = {
      ...modelData,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    this.models.set(key, model);
    
    return { modelId };
  }

  async updateModel(
    modelName: string,
    version: string,
    updates: Partial<Omit<ModelMetadata, 'name' | 'version' | 'createdAt' | 'updatedAt'>>
  ): Promise<void> {
    const key = `${modelName}:${version}`;
    const model = this.models.get(key);
    
    if (!model) {
      throw new Error(`Model ${modelName}:${version} not found`);
    }
    
    const updatedModel: ModelMetadata = {
      ...model,
      ...updates,
      updatedAt: new Date()
    };
    
    this.models.set(key, updatedModel);
  }

  async deleteModel(modelName: string, version: string): Promise<void> {
    const key = `${modelName}:${version}`;
    
    if (!this.models.has(key)) {
      throw new Error(`Model ${modelName}:${version} not found`);
    }
    
    this.models.delete(key);
  }

  async getModelDownloadUrl(
    modelName: string,
    version: string,
    format: 'pytorch' | 'onnx' | 'tensorrt'
  ): Promise<string> {
    const key = `${modelName}:${version}`;
    
    if (!this.models.has(key)) {
      throw new Error(`Model ${modelName}:${version} not found`);
    }
    
    // Mock download URL
    return `https://models.fineprintai.com/${modelName}/${version}/${format}/model.${format === 'pytorch' ? 'pth' : format}`;
  }

  async uploadModelFile(
    modelName: string,
    version: string,
    fileData: any
  ): Promise<{ fileId: string }> {
    const key = `${modelName}:${version}`;
    
    if (!this.models.has(key)) {
      throw new Error(`Model ${modelName}:${version} not found`);
    }
    
    // Mock file upload
    const fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // In a real implementation, you would:
    // 1. Validate the file
    // 2. Upload to object storage (S3, GCS, etc.)
    // 3. Update model metadata with file references
    
    return { fileId };
  }

  // Initialize with some default models
  async initialize(): Promise<void> {
    // Add some default models for testing
    await this.registerModel({
      name: 'llama2',
      version: '7b',
      description: 'Llama 2 7B parameter model',
      tags: ['llm', 'general', 'meta'],
      size: 13_000_000_000, // 13GB
      parameters: 7_000_000_000, // 7B parameters
      architecture: 'transformer',
      baseModel: 'llama2'
    });

    await this.registerModel({
      name: 'mistral',
      version: '7b-instruct',
      description: 'Mistral 7B Instruct model',
      tags: ['llm', 'instruct', 'mistral'],
      size: 14_000_000_000, // 14GB
      parameters: 7_300_000_000, // 7.3B parameters
      architecture: 'transformer',
      baseModel: 'mistral'
    });
  }
}

export default ModelRegistry;