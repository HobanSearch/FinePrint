/**
 * S3 Storage Service - Cold Tier
 * Provides long-term archival storage with compression and lifecycle management
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createGzip, createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { Readable, PassThrough } from 'stream';
import { 
  StorageTier, 
  MemoryType, 
  ImportanceLevel,
  MemorySearchResult 
} from '../../types';
import { Logger } from '../../utils/logger';
import { Metrics } from '../../utils/metrics';

export interface S3StorageConfig {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  compressionLevel: number;
  keyPrefix: string;
  lifecycleRules: {
    transitionToIA: number; // days
    transitionToGlacier: number; // days
    expiration: number; // days
  };
}

export interface ArchivedMemory {
  id: string;
  type: MemoryType;
  title: string;
  content: Record<string, any>;
  metadata: Record<string, any>;
  importance: ImportanceLevel;
  archivedAt: Date;
  originalSize: number;
  compressedSize: number;
  checksumMD5: string;
}

export class S3StorageService {
  private s3Client: S3Client;
  private logger: Logger;
  private metrics: Metrics;
  private config: S3StorageConfig;

  constructor(config: S3StorageConfig) {
    this.config = config;
    this.logger = Logger.getInstance('S3Storage');
    this.metrics = Metrics.getInstance();

    this.s3Client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  /**
   * Archive memory to S3 cold storage
   */
  async archive(memory: MemorySearchResult): Promise<string> {
    const startTime = Date.now();
    
    try {
      const archivedMemory: ArchivedMemory = {
        id: memory.id,
        type: memory.type,
        title: memory.title,
        content: memory.content,
        metadata: memory.metadata,
        importance: ImportanceLevel.MEDIUM, // Default, should be provided
        archivedAt: new Date(),
        originalSize: 0,
        compressedSize: 0,
        checksumMD5: '',
      };

      // Serialize and compress the memory
      const serialized = JSON.stringify(archivedMemory);
      const originalSize = Buffer.byteLength(serialized, 'utf8');
      
      const compressed = await this.compress(serialized);
      const compressedSize = compressed.length;
      
      // Update sizes
      archivedMemory.originalSize = originalSize;
      archivedMemory.compressedSize = compressedSize;
      
      // Generate S3 key
      const s3Key = this.generateS3Key(memory.id, memory.type);
      
      // Upload to S3
      const putCommand = new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: s3Key,
        Body: compressed,
        ContentType: 'application/gzip',
        ContentEncoding: 'gzip',
        Metadata: {
          memoryId: memory.id,
          memoryType: memory.type,
          originalSize: originalSize.toString(),
          compressedSize: compressedSize.toString(),
          archivedAt: archivedMemory.archivedAt.toISOString(),
        },
        StorageClass: 'STANDARD_IA', // Start with Infrequent Access
      });

      await this.s3Client.send(putCommand);
      
      const responseTime = Date.now() - startTime;
      this.metrics.histogram('s3.archive.duration', responseTime);
      this.metrics.histogram('s3.archive.original_size', originalSize);
      this.metrics.histogram('s3.archive.compressed_size', compressedSize);
      this.metrics.histogram('s3.archive.compression_ratio', compressedSize / originalSize);
      this.metrics.increment('s3.archive.success');

      this.logger.info(`Archived memory ${memory.id} to S3 at ${s3Key} (${originalSize} -> ${compressedSize} bytes, ${responseTime}ms)`);
      
      return s3Key;
    } catch (error) {
      this.metrics.increment('s3.archive.errors');
      this.logger.error(`Failed to archive memory ${memory.id} to S3:`, error);
      throw error;
    }
  }

  /**
   * Retrieve memory from S3 cold storage
   */
  async retrieve(s3Key: string): Promise<ArchivedMemory | null> {
    const startTime = Date.now();
    
    try {
      // Check if object exists
      const headCommand = new HeadObjectCommand({
        Bucket: this.config.bucket,
        Key: s3Key,
      });

      let headResponse;
      try {
        headResponse = await this.s3Client.send(headCommand);
      } catch (error) {
        if (error.name === 'NotFound') {
          this.metrics.increment('s3.retrieve.miss');
          return null;
        }
        throw error;
      }

      // Get the object
      const getCommand = new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: s3Key,
      });

      const response = await this.s3Client.send(getCommand);
      
      if (!response.Body) {
        throw new Error('Empty response body from S3');
      }

      // Convert stream to buffer
      const compressed = await this.streamToBuffer(response.Body as Readable);
      
      // Decompress and parse
      const decompressed = await this.decompress(compressed);
      const memory = JSON.parse(decompressed) as ArchivedMemory;

      const responseTime = Date.now() - startTime;
      this.metrics.histogram('s3.retrieve.duration', responseTime);
      this.metrics.increment('s3.retrieve.hit');

      this.logger.debug(`Retrieved memory ${memory.id} from S3 at ${s3Key} (${responseTime}ms)`);
      
      return memory;
    } catch (error) {
      this.metrics.increment('s3.retrieve.errors');
      this.logger.error(`Failed to retrieve memory from S3 at ${s3Key}:`, error);
      throw error;
    }
  }

  /**
   * Delete memory from S3 cold storage
   */
  async delete(s3Key: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      const deleteCommand = new DeleteObjectCommand({
        Bucket: this.config.bucket,
        Key: s3Key,
      });

      await this.s3Client.send(deleteCommand);

      const responseTime = Date.now() - startTime;
      this.metrics.histogram('s3.delete.duration', responseTime);
      this.metrics.increment('s3.delete.success');

      this.logger.debug(`Deleted memory from S3 at ${s3Key} (${responseTime}ms)`);
    } catch (error) {
      this.metrics.increment('s3.delete.errors');
      this.logger.error(`Failed to delete memory from S3 at ${s3Key}:`, error);
      throw error;
    }
  }

  /**
   * List archived memories with pagination
   */
  async list(options: {
    prefix?: string;
    maxKeys?: number;
    continuationToken?: string;
  } = {}): Promise<{
    memories: Array<{
      key: string;
      memoryId: string;
      memoryType: MemoryType;
      size: number;
      lastModified: Date;
      storageClass: string;
    }>;
    nextContinuationToken?: string;
    isTruncated: boolean;
  }> {
    const startTime = Date.now();
    
    try {
      const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');
      
      const listCommand = new ListObjectsV2Command({
        Bucket: this.config.bucket,
        Prefix: options.prefix || this.config.keyPrefix,
        MaxKeys: options.maxKeys || 1000,
        ContinuationToken: options.continuationToken,
      });

      const response = await this.s3Client.send(listCommand);
      
      const memories = (response.Contents || []).map(obj => ({
        key: obj.Key!,
        memoryId: this.extractMemoryIdFromKey(obj.Key!),
        memoryType: this.extractMemoryTypeFromKey(obj.Key!) as MemoryType,
        size: obj.Size || 0,
        lastModified: obj.LastModified || new Date(),
        storageClass: obj.StorageClass || 'STANDARD',
      }));

      const responseTime = Date.now() - startTime;
      this.metrics.histogram('s3.list.duration', responseTime);
      this.metrics.increment('s3.list.success');

      this.logger.debug(`Listed ${memories.length} memories from S3 (${responseTime}ms)`);

      return {
        memories,
        nextContinuationToken: response.NextContinuationToken,
        isTruncated: response.IsTruncated || false,
      };
    } catch (error) {
      this.metrics.increment('s3.list.errors');
      this.logger.error('Failed to list memories from S3:', error);
      throw error;
    }
  }

  /**
   * Generate presigned URL for direct access
   */
  async generatePresignedUrl(
    s3Key: string, 
    operation: 'GET' | 'PUT' = 'GET',
    expiresIn: number = 3600
  ): Promise<string> {
    try {
      const command = operation === 'GET' 
        ? new GetObjectCommand({ Bucket: this.config.bucket, Key: s3Key })
        : new PutObjectCommand({ Bucket: this.config.bucket, Key: s3Key });

      const url = await getSignedUrl(this.s3Client, command, { expiresIn });
      
      this.metrics.increment('s3.presigned_url.generated');
      this.logger.debug(`Generated presigned URL for ${s3Key} (${operation})`);
      
      return url;
    } catch (error) {
      this.metrics.increment('s3.presigned_url.errors');
      this.logger.error(`Failed to generate presigned URL for ${s3Key}:`, error);
      throw error;
    }
  }

  /**
   * Bulk archive multiple memories
   */
  async bulkArchive(memories: MemorySearchResult[]): Promise<Array<{ memoryId: string; s3Key: string; error?: string }>> {
    const results: Array<{ memoryId: string; s3Key: string; error?: string }> = [];
    
    const batchSize = 10; // Process in batches to avoid overwhelming S3
    for (let i = 0; i < memories.length; i += batchSize) {
      const batch = memories.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (memory) => {
        try {
          const s3Key = await this.archive(memory);
          return { memoryId: memory.id, s3Key };
        } catch (error) {
          return { memoryId: memory.id, s3Key: '', error: error.message };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Small delay between batches
      if (i + batchSize < memories.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    const successCount = results.filter(r => !r.error).length;
    const errorCount = results.filter(r => r.error).length;
    
    this.logger.info(`Bulk archive completed: ${successCount} success, ${errorCount} errors`);
    
    return results;
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<{
    totalObjects: number;
    totalSize: number;
    storageClasses: Record<string, { count: number; size: number }>;
    compressionStats: {
      averageCompressionRatio: number;
      totalOriginalSize: number;
      totalCompressedSize: number;
    };
  }> {
    try {
      const allObjects = [];
      let continuationToken: string | undefined;
      
      do {
        const listResult = await this.list({
          maxKeys: 1000,
          continuationToken,
        });
        
        allObjects.push(...listResult.memories);
        continuationToken = listResult.nextContinuationToken;
      } while (continuationToken);

      const storageClasses: Record<string, { count: number; size: number }> = {};
      let totalSize = 0;
      let totalOriginalSize = 0;
      let totalCompressedSize = 0;

      for (const obj of allObjects) {
        totalSize += obj.size;
        
        if (!storageClasses[obj.storageClass]) {
          storageClasses[obj.storageClass] = { count: 0, size: 0 };
        }
        storageClasses[obj.storageClass].count++;
        storageClasses[obj.storageClass].size += obj.size;

        // Try to get original size from metadata (if available)
        try {
          const headCommand = new HeadObjectCommand({
            Bucket: this.config.bucket,
            Key: obj.key,
          });
          const head = await this.s3Client.send(headCommand);
          
          if (head.Metadata?.originalSize) {
            totalOriginalSize += parseInt(head.Metadata.originalSize);
            totalCompressedSize += obj.size;
          }
        } catch (error) {
          // Ignore metadata errors
        }
      }

      return {
        totalObjects: allObjects.length,
        totalSize,
        storageClasses,
        compressionStats: {
          averageCompressionRatio: totalOriginalSize > 0 ? totalCompressedSize / totalOriginalSize : 0,
          totalOriginalSize,
          totalCompressedSize,
        },
      };
    } catch (error) {
      this.logger.error('Failed to get S3 stats:', error);
      throw error;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    try {
      const start = Date.now();
      
      // Try to list a few objects to test connectivity
      await this.list({ maxKeys: 1 });
      
      const responseTime = Date.now() - start;

      return {
        healthy: true,
        details: {
          responseTime,
          bucket: this.config.bucket,
          region: this.config.region,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        details: { error: error.message },
      };
    }
  }

  /**
   * Cleanup old archived memories based on lifecycle rules
   */
  async cleanup(): Promise<{
    deletedCount: number;
    transitionedCount: number;
    errors: string[];
  }> {
    const startTime = Date.now();
    const results = {
      deletedCount: 0,
      transitionedCount: 0,
      errors: [] as string[],
    };

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.lifecycleRules.expiration);

      let continuationToken: string | undefined;
      
      do {
        const listResult = await this.list({
          maxKeys: 1000,
          continuationToken,
        });

        for (const obj of listResult.memories) {
          try {
            if (obj.lastModified < cutoffDate) {
              // Delete old objects
              await this.delete(obj.key);
              results.deletedCount++;
            }
          } catch (error) {
            results.errors.push(`Failed to process ${obj.key}: ${error.message}`);
          }
        }

        continuationToken = listResult.nextContinuationToken;
      } while (continuationToken);

      const responseTime = Date.now() - startTime;
      this.logger.info(`S3 cleanup completed in ${responseTime}ms: deleted ${results.deletedCount}, errors ${results.errors.length}`);

      return results;
    } catch (error) {
      this.logger.error('Failed to cleanup S3:', error);
      results.errors.push(`Cleanup failed: ${error.message}`);
      return results;
    }
  }

  // Private helper methods

  private generateS3Key(memoryId: string, memoryType: MemoryType): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return `${this.config.keyPrefix}${memoryType}/${year}/${month}/${day}/${memoryId}.json.gz`;
  }

  private extractMemoryIdFromKey(key: string): string {
    const parts = key.split('/');
    const filename = parts[parts.length - 1];
    return filename.replace('.json.gz', '');
  }

  private extractMemoryTypeFromKey(key: string): string {
    const parts = key.split('/');
    // Assuming format: prefix/type/year/month/day/id.json.gz
    return parts[1] || 'UNKNOWN';
  }

  private async compress(data: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const input = Readable.from([data]);
      const gzip = createGzip({ level: this.config.compressionLevel });
      const chunks: Buffer[] = [];

      pipeline(input, gzip)
        .then(() => {
          resolve(Buffer.concat(chunks));
        })
        .catch(reject);

      gzip.on('data', (chunk) => {
        chunks.push(chunk);
      });
    });
  }

  private async decompress(data: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
      const input = Readable.from([data]);
      const gunzip = createGunzip();
      const chunks: Buffer[] = [];

      pipeline(input, gunzip)
        .then(() => {
          resolve(Buffer.concat(chunks).toString('utf8'));
        })
        .catch(reject);

      gunzip.on('data', (chunk) => {
        chunks.push(chunk);
      });
    });
  }

  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => {
        chunks.push(chunk);
      });
      
      stream.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
      
      stream.on('error', reject);
    });
  }
}