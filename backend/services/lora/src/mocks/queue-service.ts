export class QueueService {
  private queues: Map<string, { jobs: any[]; processor?: (job: any) => Promise<any> }> = new Map();

  async createQueue(name: string, options: any = {}): Promise<void> {
    if (!this.queues.has(name)) {
      this.queues.set(name, { jobs: [] });
    }
  }

  async add(queueName: string, data: any, options: any = {}): Promise<string> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    const job = {
      id: `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      data,
      options,
      status: 'waiting',
      createdAt: new Date().toISOString()
    };

    queue.jobs.push(job);

    // Process job immediately for simplicity in mock
    if (queue.processor) {
      setTimeout(async () => {
        try {
          job.status = 'active';
          await queue.processor!(job);
          job.status = 'completed';
        } catch (error) {
          job.status = 'failed';
        }
      }, 100);
    }

    return job.id;
  }

  process(queueName: string, concurrency: number, processor: (job: any) => Promise<any>): void {
    const queue = this.queues.get(queueName);
    if (queue) {
      queue.processor = processor;
    }
  }

  async getJob(queueName: string, jobId: string): Promise<any | null> {
    const queue = this.queues.get(queueName);
    if (!queue) return null;

    return queue.jobs.find(job => job.id === jobId) || null;
  }

  async getJobs(queueName: string, status?: string): Promise<any[]> {
    const queue = this.queues.get(queueName);
    if (!queue) return [];

    if (status) {
      return queue.jobs.filter(job => job.status === status);
    }

    return queue.jobs;
  }
}