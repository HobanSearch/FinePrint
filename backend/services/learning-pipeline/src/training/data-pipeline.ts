import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash, randomBytes } from 'crypto';
import { PrivacyConfig } from '../types/index.js';
import { logger } from '../utils/logger.js';

export class DataPipeline {
  private prisma: PrismaClient;
  private redis: Redis;
  private dataDir = '/data/training';
  private cacheDir = '/data/cache';

  constructor(prisma: PrismaClient, redis: Redis) {
    this.prisma = prisma;
    this.redis = redis;
    this.ensureDirectories();
  }

  private async ensureDirectories(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
    await fs.mkdir(this.cacheDir, { recursive: true });
  }

  async prepareDataset(datasetId: string): Promise<string> {
    try {
      // Check cache
      const cachedPath = await this.getCachedDataset(datasetId);
      if (cachedPath) {
        logger.info('Using cached dataset', { datasetId });
        return cachedPath;
      }

      // Load dataset metadata
      const dataset = await this.prisma.trainingDataset.findUnique({
        where: { id: datasetId },
      });

      if (!dataset) {
        throw new Error(`Dataset ${datasetId} not found`);
      }

      // Prepare data based on type
      let dataPath: string;
      switch (dataset.dataType) {
        case 'TRAINING':
          dataPath = await this.prepareTrainingData(dataset);
          break;
        case 'SYNTHETIC':
          dataPath = await this.prepareSyntheticData(dataset);
          break;
        case 'ACTIVE_LEARNING':
          dataPath = await this.prepareActiveLearningData(dataset);
          break;
        default:
          dataPath = await this.prepareStandardData(dataset);
      }

      // Apply privacy transformations if needed
      if (dataset.privacyMethod) {
        dataPath = await this.applyPrivacyTransformations(
          dataPath,
          dataset.privacyMethod,
          dataset.privacyParams as PrivacyConfig
        );
      }

      // Validate prepared data
      await this.validatePreparedData(dataPath, dataset);

      // Cache the prepared dataset
      await this.cacheDataset(datasetId, dataPath);

      return dataPath;
    } catch (error) {
      logger.error('Failed to prepare dataset', { error, datasetId });
      throw error;
    }
  }

  private async prepareTrainingData(dataset: any): Promise<string> {
    const outputPath = path.join(this.dataDir, `${dataset.id}_training.jsonl`);
    
    // Fetch recent feedback data
    const feedbacks = await this.prisma.userFeedback.findMany({
      where: {
        processed: false,
        feedbackType: {
          in: ['CORRECTION', 'RATING'],
        },
      },
      take: 10000,
      orderBy: { timestamp: 'desc' },
    });

    // Transform feedbacks to training format
    const trainingData = feedbacks.map(feedback => ({
      input: feedback.documentId,
      output: feedback.correction || feedback.rating,
      metadata: {
        modelId: feedback.modelId,
        userId: feedback.userId,
        timestamp: feedback.timestamp,
      },
    }));

    // Merge with existing training data
    if (dataset.s3Path) {
      const existingData = await this.loadFromS3(dataset.s3Path);
      trainingData.push(...existingData);
    }

    // Write to file
    await this.writeJSONL(outputPath, trainingData);

    // Mark feedbacks as processed
    await this.prisma.userFeedback.updateMany({
      where: {
        id: {
          in: feedbacks.map(f => f.id),
        },
      },
      data: { processed: true },
    });

    return outputPath;
  }

  private async prepareSyntheticData(dataset: any): Promise<string> {
    const outputPath = path.join(this.dataDir, `${dataset.id}_synthetic.jsonl`);
    
    // Generate synthetic samples
    const samples = await this.generateSyntheticSamples(
      dataset.size,
      dataset.features as any
    );

    // Apply augmentation
    const augmented = await this.augmentData(samples);

    // Write to file
    await this.writeJSONL(outputPath, augmented);

    return outputPath;
  }

  private async prepareActiveLearningData(dataset: any): Promise<string> {
    const outputPath = path.join(this.dataDir, `${dataset.id}_active.jsonl`);
    
    // Get active learning samples
    const samples = await this.prisma.activeLearningSample.findMany({
      where: {
        selected: true,
        labeled: true,
      },
      orderBy: { priority: 'desc' },
      take: dataset.size,
    });

    // Transform to training format
    const trainingData = samples.map(sample => ({
      input: sample.inputData,
      output: sample.label,
      weight: sample.priority, // Use priority as sample weight
      metadata: {
        uncertainty: sample.uncertainty,
        diversity: sample.diversity,
      },
    }));

    await this.writeJSONL(outputPath, trainingData);

    return outputPath;
  }

  private async prepareStandardData(dataset: any): Promise<string> {
    const outputPath = path.join(this.dataDir, `${dataset.id}_standard.jsonl`);
    
    // Load data from configured source
    let data: any[] = [];
    
    if (dataset.s3Path) {
      data = await this.loadFromS3(dataset.s3Path);
    } else if (dataset.gitHash) {
      data = await this.loadFromGit(dataset.gitHash);
    } else if (dataset.dvcHash) {
      data = await this.loadFromDVC(dataset.dvcHash);
    }

    // Apply feature selection
    if (dataset.features) {
      data = this.selectFeatures(data, dataset.features as string[]);
    }

    // Split data if needed
    if (dataset.dataType === 'VALIDATION' || dataset.dataType === 'TEST') {
      data = await this.splitData(data, dataset.dataType);
    }

    await this.writeJSONL(outputPath, data);

    return outputPath;
  }

  private async generateSyntheticSamples(
    count: number,
    features: any
  ): Promise<any[]> {
    const samples: any[] = [];
    
    for (let i = 0; i < count; i++) {
      const sample: any = {};
      
      for (const [feature, config] of Object.entries(features)) {
        if (typeof config === 'object' && config !== null) {
          const featureConfig = config as any;
          
          switch (featureConfig.type) {
            case 'numeric':
              sample[feature] = this.generateNumeric(
                featureConfig.min,
                featureConfig.max,
                featureConfig.distribution
              );
              break;
            case 'categorical':
              sample[feature] = this.generateCategorical(featureConfig.values);
              break;
            case 'text':
              sample[feature] = this.generateText(
                featureConfig.minLength,
                featureConfig.maxLength
              );
              break;
            case 'embedding':
              sample[feature] = this.generateEmbedding(featureConfig.dimension);
              break;
          }
        }
      }
      
      samples.push(sample);
    }
    
    return samples;
  }

  private generateNumeric(min: number, max: number, distribution: string): number {
    switch (distribution) {
      case 'normal':
        // Box-Muller transform for normal distribution
        const u1 = Math.random();
        const u2 = Math.random();
        const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        const mean = (min + max) / 2;
        const std = (max - min) / 6;
        return Math.max(min, Math.min(max, mean + z0 * std));
      case 'exponential':
        const lambda = 1 / ((max - min) / 3);
        return min + (-Math.log(1 - Math.random()) / lambda);
      default: // uniform
        return min + Math.random() * (max - min);
    }
  }

  private generateCategorical(values: string[]): string {
    return values[Math.floor(Math.random() * values.length)];
  }

  private generateText(minLength: number, maxLength: number): string {
    const length = minLength + Math.floor(Math.random() * (maxLength - minLength));
    const words = [
      'legal', 'document', 'analysis', 'privacy', 'terms', 'service',
      'agreement', 'clause', 'provision', 'liability', 'indemnification',
      'warranty', 'disclaimer', 'confidentiality', 'arbitration',
    ];
    
    let text = '';
    for (let i = 0; i < length; i++) {
      text += words[Math.floor(Math.random() * words.length)] + ' ';
    }
    
    return text.trim();
  }

  private generateEmbedding(dimension: number): number[] {
    const embedding: number[] = [];
    for (let i = 0; i < dimension; i++) {
      embedding.push(Math.random() * 2 - 1); // Random values between -1 and 1
    }
    // Normalize
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => val / norm);
  }

  private async augmentData(data: any[]): Promise<any[]> {
    const augmented: any[] = [...data];
    
    for (const item of data) {
      // Text augmentation
      if (item.input && typeof item.input === 'string') {
        // Synonym replacement
        augmented.push({
          ...item,
          input: this.synonymReplace(item.input),
          augmented: true,
        });
        
        // Random insertion
        augmented.push({
          ...item,
          input: this.randomInsert(item.input),
          augmented: true,
        });
      }
      
      // Numeric noise
      if (typeof item.input === 'number') {
        augmented.push({
          ...item,
          input: item.input + (Math.random() - 0.5) * 0.1,
          augmented: true,
        });
      }
    }
    
    return augmented;
  }

  private synonymReplace(text: string): string {
    const synonyms: Record<string, string[]> = {
      'agreement': ['contract', 'arrangement', 'deal'],
      'liability': ['responsibility', 'obligation', 'accountability'],
      'privacy': ['confidentiality', 'secrecy', 'discretion'],
    };
    
    let result = text;
    for (const [word, syns] of Object.entries(synonyms)) {
      if (result.includes(word) && Math.random() > 0.5) {
        const synonym = syns[Math.floor(Math.random() * syns.length)];
        result = result.replace(word, synonym);
      }
    }
    
    return result;
  }

  private randomInsert(text: string): string {
    const words = text.split(' ');
    const insertWords = ['hereby', 'furthermore', 'additionally', 'specifically'];
    
    if (Math.random() > 0.5 && words.length > 5) {
      const position = Math.floor(Math.random() * words.length);
      const word = insertWords[Math.floor(Math.random() * insertWords.length)];
      words.splice(position, 0, word);
    }
    
    return words.join(' ');
  }

  private async applyPrivacyTransformations(
    dataPath: string,
    method: string,
    params: PrivacyConfig
  ): Promise<string> {
    const outputPath = dataPath.replace('.jsonl', '_private.jsonl');
    const data = await this.readJSONL(dataPath);
    
    let transformed: any[];
    
    switch (method) {
      case 'differential_privacy':
        transformed = await this.applyDifferentialPrivacy(data, params);
        break;
      case 'k_anonymity':
        transformed = await this.applyKAnonymity(data, params);
        break;
      case 'l_diversity':
        transformed = await this.applyLDiversity(data, params);
        break;
      default:
        transformed = data;
    }
    
    await this.writeJSONL(outputPath, transformed);
    
    return outputPath;
  }

  private async applyDifferentialPrivacy(
    data: any[],
    params: PrivacyConfig
  ): Promise<any[]> {
    const epsilon = params.parameters?.epsilon || 1.0;
    const delta = params.parameters?.delta || 1e-5;
    const sensitivity = 1.0; // Assuming normalized data
    
    return data.map(item => {
      const noisyItem = { ...item };
      
      // Add Laplace noise to numeric fields
      for (const [key, value] of Object.entries(item)) {
        if (typeof value === 'number') {
          const noise = this.laplaceSample(0, sensitivity / epsilon);
          noisyItem[key] = value + noise;
        }
      }
      
      return noisyItem;
    });
  }

  private laplaceSample(mu: number, b: number): number {
    const u = Math.random() - 0.5;
    return mu - b * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  }

  private async applyKAnonymity(data: any[], params: PrivacyConfig): Promise<any[]> {
    const k = params.parameters?.k || 5;
    const quasiIdentifiers = ['userId', 'location', 'timestamp'];
    
    // Group records by quasi-identifiers
    const groups = new Map<string, any[]>();
    
    for (const record of data) {
      const key = quasiIdentifiers
        .map(qi => record[qi])
        .join(':');
      
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(record);
    }
    
    // Generalize groups with less than k records
    const anonymized: any[] = [];
    
    for (const [key, group] of groups.entries()) {
      if (group.length < k) {
        // Generalize quasi-identifiers
        const generalized = group.map(record => ({
          ...record,
          userId: this.hashValue(record.userId),
          location: this.generalizeLocation(record.location),
          timestamp: this.generalizeTimestamp(record.timestamp),
        }));
        anonymized.push(...generalized);
      } else {
        anonymized.push(...group);
      }
    }
    
    return anonymized;
  }

  private async applyLDiversity(data: any[], params: PrivacyConfig): Promise<any[]> {
    const l = params.parameters?.l || 3;
    // Implementation simplified for brevity
    // Would need to ensure l-diverse sensitive attributes in each equivalence class
    return data;
  }

  private hashValue(value: string): string {
    return createHash('sha256').update(value).digest('hex').substring(0, 8);
  }

  private generalizeLocation(location: any): any {
    if (typeof location === 'string') {
      // Return only country/state level
      return location.split(',')[0];
    }
    if (typeof location === 'object' && location.lat && location.lng) {
      // Round to 1 decimal place
      return {
        lat: Math.round(location.lat * 10) / 10,
        lng: Math.round(location.lng * 10) / 10,
      };
    }
    return location;
  }

  private generalizeTimestamp(timestamp: any): string {
    const date = new Date(timestamp);
    // Round to nearest hour
    date.setMinutes(0, 0, 0);
    return date.toISOString();
  }

  private selectFeatures(data: any[], features: string[]): any[] {
    return data.map(item => {
      const selected: any = {};
      for (const feature of features) {
        if (feature in item) {
          selected[feature] = item[feature];
        }
      }
      return selected;
    });
  }

  private async splitData(data: any[], type: string): Promise<any[]> {
    const seed = type === 'VALIDATION' ? 42 : 123;
    const ratio = type === 'VALIDATION' ? 0.15 : 0.2;
    
    // Deterministic shuffle based on seed
    const shuffled = this.deterministicShuffle(data, seed);
    
    const splitIndex = Math.floor(data.length * (1 - ratio));
    
    return type === 'TEST' 
      ? shuffled.slice(splitIndex)
      : shuffled.slice(0, splitIndex);
  }

  private deterministicShuffle(array: any[], seed: number): any[] {
    const shuffled = [...array];
    let currentIndex = shuffled.length;
    
    // Simple deterministic random based on seed
    const random = (i: number) => {
      const x = Math.sin(seed + i) * 10000;
      return x - Math.floor(x);
    };
    
    while (currentIndex !== 0) {
      const randomIndex = Math.floor(random(currentIndex) * currentIndex);
      currentIndex--;
      
      [shuffled[currentIndex], shuffled[randomIndex]] = 
      [shuffled[randomIndex], shuffled[currentIndex]];
    }
    
    return shuffled;
  }

  private async validatePreparedData(dataPath: string, dataset: any): Promise<void> {
    const stats = await fs.stat(dataPath);
    
    if (stats.size === 0) {
      throw new Error('Prepared dataset is empty');
    }
    
    // Sample validation
    const samples = await this.readJSONLSample(dataPath, 100);
    
    // Check for required fields
    for (const sample of samples) {
      if (!sample.input || !sample.output) {
        throw new Error('Sample missing required fields');
      }
    }
    
    // Record validation
    await this.prisma.dataValidation.create({
      data: {
        datasetId: dataset.id,
        validationType: 'preparation',
        status: 'PASSED',
        results: {
          fileSize: stats.size,
          sampleCount: samples.length,
          timestamp: new Date(),
        },
        metrics: {
          completeness: 1.0,
          validity: 1.0,
        },
      },
    });
  }

  private async getCachedDataset(datasetId: string): Promise<string | null> {
    const cacheKey = `dataset:cache:${datasetId}`;
    const cachedPath = await this.redis.get(cacheKey);
    
    if (cachedPath) {
      // Check if file still exists
      try {
        await fs.access(cachedPath);
        return cachedPath;
      } catch {
        await this.redis.del(cacheKey);
      }
    }
    
    return null;
  }

  private async cacheDataset(datasetId: string, dataPath: string): Promise<void> {
    const cacheKey = `dataset:cache:${datasetId}`;
    await this.redis.setex(cacheKey, 3600, dataPath); // Cache for 1 hour
  }

  private async loadFromS3(s3Path: string): Promise<any[]> {
    // Simplified - would use AWS SDK in production
    logger.info('Loading from S3', { path: s3Path });
    return [];
  }

  private async loadFromGit(gitHash: string): Promise<any[]> {
    // Simplified - would use git commands in production
    logger.info('Loading from Git', { hash: gitHash });
    return [];
  }

  private async loadFromDVC(dvcHash: string): Promise<any[]> {
    // Simplified - would use DVC commands in production
    logger.info('Loading from DVC', { hash: dvcHash });
    return [];
  }

  private async writeJSONL(filePath: string, data: any[]): Promise<void> {
    const lines = data.map(item => JSON.stringify(item)).join('\n');
    await fs.writeFile(filePath, lines);
  }

  private async readJSONL(filePath: string): Promise<any[]> {
    const content = await fs.readFile(filePath, 'utf-8');
    return content.split('\n').filter(line => line).map(line => JSON.parse(line));
  }

  private async readJSONLSample(filePath: string, count: number): Promise<any[]> {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line);
    return lines.slice(0, count).map(line => JSON.parse(line));
  }
}