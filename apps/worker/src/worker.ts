import pino from 'pino'

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss.l',
      ignore: 'pid,hostname',
    },
  } : undefined,
})

// Simulate job processing
class WorkerService {
  private isRunning = false
  private jobCount = 0

  async start() {
    this.isRunning = true
    logger.info('🔧 Fine Print AI Worker Service started')
    
    // Simulate processing jobs
    this.processJobs()
    
    // Handle graceful shutdown
    process.on('SIGTERM', () => this.shutdown())
    process.on('SIGINT', () => this.shutdown())
  }

  private async processJobs() {
    while (this.isRunning) {
      try {
        // Simulate job processing
        await this.simulateJob()
        await this.sleep(5000) // Process every 5 seconds
      } catch (error) {
        logger.error('Error processing job:', error)
        await this.sleep(1000) // Wait before retrying
      }
    }
  }

  private async simulateJob() {
    this.jobCount++
    const jobId = `job_${this.jobCount}_${Date.now()}`
    
    logger.info(`Processing job: ${jobId}`)
    
    // Simulate different types of jobs
    const jobTypes = ['document_analysis', 'tos_monitoring', 'notification_send']
    const jobType = jobTypes[Math.floor(Math.random() * jobTypes.length)]
    
    logger.info(`Job ${jobId} type: ${jobType}`)
    
    // Simulate processing time
    const processingTime = Math.random() * 2000 + 500 // 500ms to 2.5s
    await this.sleep(processingTime)
    
    logger.info(`Job ${jobId} completed in ${Math.round(processingTime)}ms`)
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private async shutdown() {
    logger.info('Shutting down worker service...')
    this.isRunning = false
    
    // Give time for current job to finish
    await this.sleep(1000)
    
    logger.info('Worker service stopped')
    process.exit(0)
  }
}

// Start the worker
const worker = new WorkerService()
worker.start().catch((error) => {
  logger.error('Failed to start worker service:', error)
  process.exit(1)
})