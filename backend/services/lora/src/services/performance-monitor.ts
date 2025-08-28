export interface SystemMetrics {
  cpu: {
    usage: number;
    cores: number;
  };
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  disk: {
    used: number;
    total: number;
    percentage: number;
  };
  gpu?: {
    count: number;
    utilization: number[];
    memory: Array<{
      used: number;
      total: number;
      percentage: number;
    }>;
  };
}

export interface TrainingMetric {
  timestamp: string;
  step: number;
  epoch?: number;
  trainLoss?: number;
  evalLoss?: number;
  accuracy?: number;
  learningRate?: number;
  gpuUtilization?: number;
  memoryUsage?: number;
}

export interface HealthMetrics {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: {
    database: {
      status: 'up' | 'down';
      responseTime: number;
      lastChecked: string;
    };
    redis: {
      status: 'up' | 'down';
      responseTime: number;
      lastChecked: string;
    };
    gatedLoRA: {
      status: 'up' | 'down';
      activeJobs: number;
      queueSize: number;
      lastChecked: string;
    };
  };
  performance: {
    requestsPerSecond: number;
    averageResponseTime: number;
    errorRate: number;
    uptime: number;
  };
}

export interface ModelMetrics {
  summary: {
    inferenceCount: number;
    averageLatency: number;
    p95Latency: number;
    p99Latency: number;
    errorRate: number;
    throughput: number;
    accuracy?: number;
    memoryUsage: number;
    diskUsage: number;
  };
  timeSeries: Array<{
    timestamp: string;
    latency: number;
    throughput: number;
    errors: number;
  }>;
}

export interface QueueMetric {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
  processingRate: number;
  avgProcessingTime: number;
}

export class PerformanceMonitor {
  private startTime = Date.now();
  private requestCount = 0;
  private errorCount = 0;
  private responseTimes: number[] = [];
  private trainingMetrics = new Map<string, TrainingMetric[]>();

  async getSystemMetrics(): Promise<SystemMetrics> {
    // Mock system metrics - in production, you'd use actual system APIs
    const mockMetrics: SystemMetrics = {
      cpu: {
        usage: Math.random() * 50 + 20, // 20-70% usage
        cores: 8
      },
      memory: {
        used: Math.random() * 8000000000 + 2000000000, // 2-10GB used
        total: 16000000000, // 16GB total
        percentage: 0
      },
      disk: {
        used: Math.random() * 500000000000 + 100000000000, // 100-600GB used
        total: 1000000000000, // 1TB total
        percentage: 0
      },
      gpu: {
        count: 1,
        utilization: [Math.random() * 80 + 10], // 10-90% utilization
        memory: [{
          used: Math.random() * 12000000000 + 2000000000, // 2-14GB used
          total: 16000000000, // 16GB total
          percentage: 0
        }]
      }
    };

    // Calculate percentages
    mockMetrics.memory.percentage = (mockMetrics.memory.used / mockMetrics.memory.total) * 100;
    mockMetrics.disk.percentage = (mockMetrics.disk.used / mockMetrics.disk.total) * 100;
    if (mockMetrics.gpu) {
      mockMetrics.gpu.memory[0].percentage = (mockMetrics.gpu.memory[0].used / mockMetrics.gpu.memory[0].total) * 100;
    }

    return mockMetrics;
  }

  async getTrainingMetrics(
    jobId: string,
    options: { timeRange: string; metric?: string }
  ): Promise<TrainingMetric[]> {
    let metrics = this.trainingMetrics.get(jobId);

    if (!metrics) {
      // Generate mock training metrics
      metrics = this.generateMockTrainingMetrics();
      this.trainingMetrics.set(jobId, metrics);
    }

    // Filter by time range
    const now = new Date();
    const timeRangeMs = this.parseTimeRange(options.timeRange);
    const cutoffTime = new Date(now.getTime() - timeRangeMs);

    const filteredMetrics = metrics.filter(
      metric => new Date(metric.timestamp) >= cutoffTime
    );

    return filteredMetrics;
  }

  async getHealthMetrics(): Promise<HealthMetrics> {
    const uptime = (Date.now() - this.startTime) / 1000;
    const requestsPerSecond = this.requestCount / (uptime || 1);
    const averageResponseTime = this.responseTimes.length > 0
      ? this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length
      : 0;
    const errorRate = this.requestCount > 0 ? this.errorCount / this.requestCount : 0;

    // Mock service health checks
    const healthMetrics: HealthMetrics = {
      status: errorRate < 0.05 ? 'healthy' : errorRate < 0.1 ? 'degraded' : 'unhealthy',
      services: {
        database: {
          status: Math.random() > 0.1 ? 'up' : 'down',
          responseTime: Math.random() * 50 + 10,
          lastChecked: new Date().toISOString()
        },
        redis: {
          status: Math.random() > 0.05 ? 'up' : 'down',
          responseTime: Math.random() * 20 + 5,
          lastChecked: new Date().toISOString()
        },
        gatedLoRA: {
          status: Math.random() > 0.1 ? 'up' : 'down',
          activeJobs: Math.floor(Math.random() * 10),
          queueSize: Math.floor(Math.random() * 50),
          lastChecked: new Date().toISOString()
        }
      },
      performance: {
        requestsPerSecond,
        averageResponseTime,
        errorRate,
        uptime
      }
    };

    return healthMetrics;
  }

  async getModelMetrics(
    modelName: string,
    version: string,
    timeRange: string
  ): Promise<ModelMetrics> {
    // Mock model metrics
    const summary = {
      inferenceCount: Math.floor(Math.random() * 10000) + 1000,
      averageLatency: Math.random() * 100 + 50,
      p95Latency: Math.random() * 200 + 100,
      p99Latency: Math.random() * 500 + 200,
      errorRate: Math.random() * 0.05,
      throughput: Math.random() * 100 + 50,
      accuracy: Math.random() * 0.2 + 0.8,
      memoryUsage: Math.random() * 2000000000 + 1000000000, // 1-3GB
      diskUsage: Math.random() * 10000000000 + 5000000000 // 5-15GB
    };

    // Generate time series data
    const timeRangeMs = this.parseTimeRange(timeRange);
    const points = 50;
    const interval = timeRangeMs / points;
    const timeSeries = [];

    for (let i = 0; i < points; i++) {
      const timestamp = new Date(Date.now() - timeRangeMs + (i * interval));
      timeSeries.push({
        timestamp: timestamp.toISOString(),
        latency: summary.averageLatency + (Math.random() - 0.5) * 20,
        throughput: summary.throughput + (Math.random() - 0.5) * 10,
        errors: Math.floor(Math.random() * 5)
      });
    }

    return { summary, timeSeries };
  }

  async getQueueMetrics(queueName?: string): Promise<QueueMetric[]> {
    const queues = ['training', 'inference', 'data-processing', 'model-registry'];
    const filteredQueues = queueName ? [queueName] : queues;

    return filteredQueues.map(name => ({
      name,
      waiting: Math.floor(Math.random() * 50),
      active: Math.floor(Math.random() * 10),
      completed: Math.floor(Math.random() * 1000) + 500,
      failed: Math.floor(Math.random() * 20),
      delayed: Math.floor(Math.random() * 5),
      paused: Math.random() > 0.9,
      processingRate: Math.random() * 50 + 10,
      avgProcessingTime: Math.random() * 5000 + 1000
    }));
  }

  async getPrometheusMetrics(): Promise<string> {
    const systemMetrics = await this.getSystemMetrics();
    const healthMetrics = await this.getHealthMetrics();
    const queueMetrics = await this.getQueueMetrics();

    let metrics = '';

    // System metrics
    metrics += `# HELP fineprintai_cpu_usage_percent CPU usage percentage\n`;
    metrics += `# TYPE fineprintai_cpu_usage_percent gauge\n`;
    metrics += `fineprintai_cpu_usage_percent ${systemMetrics.cpu.usage}\n\n`;

    metrics += `# HELP fineprintai_memory_usage_bytes Memory usage in bytes\n`;
    metrics += `# TYPE fineprintai_memory_usage_bytes gauge\n`;
    metrics += `fineprintai_memory_usage_bytes ${systemMetrics.memory.used}\n\n`;

    if (systemMetrics.gpu) {
      metrics += `# HELP fineprintai_gpu_utilization_percent GPU utilization percentage\n`;
      metrics += `# TYPE fineprintai_gpu_utilization_percent gauge\n`;
      systemMetrics.gpu.utilization.forEach((util, index) => {
        metrics += `fineprintai_gpu_utilization_percent{gpu="${index}"} ${util}\n`;
      });
      metrics += '\n';
    }

    // Performance metrics
    metrics += `# HELP fineprintai_requests_per_second Requests per second\n`;
    metrics += `# TYPE fineprintai_requests_per_second gauge\n`;
    metrics += `fineprintai_requests_per_second ${healthMetrics.performance.requestsPerSecond}\n\n`;

    metrics += `# HELP fineprintai_response_time_avg Average response time in milliseconds\n`;
    metrics += `# TYPE fineprintai_response_time_avg gauge\n`;
    metrics += `fineprintai_response_time_avg ${healthMetrics.performance.averageResponseTime}\n\n`;

    // Queue metrics
    queueMetrics.forEach(queue => {
      metrics += `# HELP fineprintai_queue_waiting_jobs Number of waiting jobs in queue\n`;
      metrics += `# TYPE fineprintai_queue_waiting_jobs gauge\n`;
      metrics += `fineprintai_queue_waiting_jobs{queue="${queue.name}"} ${queue.waiting}\n\n`;

      metrics += `# HELP fineprintai_queue_active_jobs Number of active jobs in queue\n`;
      metrics += `# TYPE fineprintai_queue_active_jobs gauge\n`;
      metrics += `fineprintai_queue_active_jobs{queue="${queue.name}"} ${queue.active}\n\n`;
    });

    return metrics;
  }

  // Helper methods
  recordRequest(responseTime: number, isError: boolean = false): void {
    this.requestCount++;
    this.responseTimes.push(responseTime);
    
    if (isError) {
      this.errorCount++;
    }

    // Keep only recent response times (last 1000)
    if (this.responseTimes.length > 1000) {
      this.responseTimes = this.responseTimes.slice(-1000);
    }
  }

  private parseTimeRange(timeRange: string): number {
    const ranges = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000
    };
    
    return ranges[timeRange as keyof typeof ranges] || ranges['1h'];
  }

  private generateMockTrainingMetrics(): TrainingMetric[] {
    const metrics: TrainingMetric[] = [];
    const totalSteps = 1000;
    const epochs = 10;
    const stepsPerEpoch = totalSteps / epochs;

    for (let step = 1; step <= totalSteps; step++) {
      const epoch = Math.ceil(step / stepsPerEpoch);
      const timestamp = new Date(Date.now() - (totalSteps - step) * 1000).toISOString();
      
      metrics.push({
        timestamp,
        step,
        epoch,
        trainLoss: 2.0 * Math.exp(-step / 200) + Math.random() * 0.1,
        evalLoss: 2.2 * Math.exp(-step / 180) + Math.random() * 0.15,
        accuracy: (1 - Math.exp(-step / 150)) * 0.95 + Math.random() * 0.02,
        learningRate: 0.001 * Math.pow(0.95, epoch - 1),
        gpuUtilization: Math.random() * 20 + 70,
        memoryUsage: Math.random() * 2000000000 + 8000000000
      });
    }

    return metrics;
  }
}

export default PerformanceMonitor;