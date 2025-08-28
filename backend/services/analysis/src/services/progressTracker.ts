import { createServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { createServiceLogger } from '@fineprintai/shared-logger';
import { queueManager } from './queueManager';
import { EventEmitter } from 'events';

const logger = createServiceLogger('progress-tracker');

export interface ProgressUpdate {
  analysisId: string;
  jobId?: string;
  userId: string;
  step: string;
  percentage: number;
  message: string;
  timestamp: Date;
  estimatedTimeRemaining?: number;
  currentOperation?: string;
  metadata?: { [key: string]: any };
}

export interface ConnectionInfo {
  socketId: string;
  userId: string;
  connectedAt: Date;
  subscribedAnalyses: string[];
  lastActivity: Date;
}

export class ProgressTracker extends EventEmitter {
  private io: SocketIOServer;
  private httpServer: any;
  private connections: Map<string, ConnectionInfo> = new Map();
  private analysisSubscribers: Map<string, Set<string>> = new Map(); // analysisId -> socketIds
  private userSockets: Map<string, Set<string>> = new Map(); // userId -> socketIds
  private port: number;
  private isStarted = false;

  // Progress tracking state
  private activeAnalyses: Map<string, ProgressUpdate> = new Map();
  private analysisHistory: Map<string, ProgressUpdate[]> = new Map();

  constructor(port: number = 8001) {
    super();
    this.port = port;
    
    // Create HTTP server
    this.httpServer = createServer();
    
    // Initialize Socket.IO
    this.io = new SocketIOServer(this.httpServer, {
      cors: {
        origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
        methods: ['GET', 'POST'],
        credentials: true
      },
      transports: ['websocket', 'polling']
    });

    this.setupHealthEndpoint();
    this.setupSocketHandlers();
    this.setupQueueListeners();
  }

  async start(): Promise<void> {
    if (this.isStarted) {
      logger.warn('Progress Tracker already started');
      return;
    }

    try {
      await new Promise<void>((resolve, reject) => {
        this.httpServer.listen(this.port, '0.0.0.0', (err?: Error) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });

      this.isStarted = true;
      
      // Start cleanup tasks
      this.startCleanupTasks();
      
      logger.info('Progress Tracker started successfully', {
        port: this.port,
        transports: ['websocket', 'polling']
      });

    } catch (error) {
      logger.error('Failed to start Progress Tracker', { error: error.message });
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isStarted) return;

    logger.info('Stopping Progress Tracker');

    // Close all connections
    this.io.close();
    
    // Close HTTP server
    await new Promise<void>((resolve) => {
      this.httpServer.close(() => resolve());
    });

    this.isStarted = false;
    this.connections.clear();
    this.analysisSubscribers.clear();
    this.userSockets.clear();

    logger.info('Progress Tracker stopped');
  }

  // Main method to broadcast progress updates
  broadcastProgress(progress: ProgressUpdate): void {
    const subscribers = this.analysisSubscribers.get(progress.analysisId);
    
    if (!subscribers || subscribers.size === 0) {
      logger.debug('No subscribers for analysis', { analysisId: progress.analysisId });
      return;
    }

    // Update active analysis state
    this.activeAnalyses.set(progress.analysisId, progress);
    
    // Add to history
    if (!this.analysisHistory.has(progress.analysisId)) {
      this.analysisHistory.set(progress.analysisId, []);
    }
    this.analysisHistory.get(progress.analysisId)!.push(progress);

    // Broadcast to all subscribers
    const message = {
      type: 'analysis_progress',
      data: {
        ...progress,
        timestamp: progress.timestamp.toISOString()
      }
    };

    let broadcastCount = 0;
    subscribers.forEach(socketId => {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit('analysis_progress', message);
        broadcastCount++;
      } else {
        // Clean up dead socket
        subscribers.delete(socketId);
      }
    });

    logger.debug('Progress broadcasted', {
      analysisId: progress.analysisId,
      step: progress.step,
      percentage: progress.percentage,
      subscribersNotified: broadcastCount
    });

    this.emit('progressBroadcast', { progress, subscribersNotified: broadcastCount });
  }

  // Broadcast analysis completion
  broadcastAnalysisComplete(analysisId: string, result: any): void {
    const subscribers = this.analysisSubscribers.get(analysisId);
    
    if (subscribers && subscribers.size > 0) {
      const message = {
        type: 'analysis_complete',
        data: {
          analysisId,
          result,
          timestamp: new Date().toISOString()
        }
      };

      subscribers.forEach(socketId => {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.emit('analysis_complete', message);
        }
      });

      logger.info('Analysis completion broadcasted', {
        analysisId,
        subscribersNotified: subscribers.size
      });
    }

    // Clean up
    this.activeAnalyses.delete(analysisId);
    this.analysisSubscribers.delete(analysisId);
  }

  // Broadcast analysis failure
  broadcastAnalysisError(analysisId: string, error: string): void {
    const subscribers = this.analysisSubscribers.get(analysisId);
    
    if (subscribers && subscribers.size > 0) {
      const message = {
        type: 'analysis_error',
        data: {
          analysisId,
          error,
          timestamp: new Date().toISOString()
        }
      };

      subscribers.forEach(socketId => {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.emit('analysis_error', message);
        }
      });

      logger.warn('Analysis error broadcasted', {
        analysisId,
        error,
        subscribersNotified: subscribers.size
      });
    }

    // Clean up
    this.activeAnalyses.delete(analysisId);
    this.analysisSubscribers.delete(analysisId);
  }

  // Get current progress for an analysis
  getAnalysisProgress(analysisId: string): ProgressUpdate | null {
    return this.activeAnalyses.get(analysisId) || null;
  }

  // Get progress history for an analysis
  getAnalysisHistory(analysisId: string): ProgressUpdate[] {
    return this.analysisHistory.get(analysisId) || [];
  }

  // Get statistics
  getStats(): {
    totalConnections: number;
    activeAnalyses: number;
    totalSubscriptions: number;
    connectionsPerUser: { [userId: string]: number };
  } {
    const connectionsPerUser: { [userId: string]: number } = {};
    
    this.connections.forEach(conn => {
      connectionsPerUser[conn.userId] = (connectionsPerUser[conn.userId] || 0) + 1;
    });

    return {
      totalConnections: this.connections.size,
      activeAnalyses: this.activeAnalyses.size,
      totalSubscriptions: Array.from(this.analysisSubscribers.values())
        .reduce((sum, subs) => sum + subs.size, 0),
      connectionsPerUser
    };
  }

  private setupHealthEndpoint(): void {
    this.httpServer.on('request', (req: any, res: any) => {
      if (req.url === '/health' && req.method === 'GET') {
        const stats = this.getStats();
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ok',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          service: 'progress-tracker',
          stats
        }));
        return;
      }

      if (req.url === '/metrics' && req.method === 'GET') {
        const stats = this.getStats();
        
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(`# HELP fineprintai_websocket_connections Total WebSocket connections
# TYPE fineprintai_websocket_connections gauge
fineprintai_websocket_connections ${stats.totalConnections}

# HELP fineprintai_active_analyses Active analysis sessions
# TYPE fineprintai_active_analyses gauge
fineprintai_active_analyses ${stats.activeAnalyses}

# HELP fineprintai_total_subscriptions Total analysis subscriptions
# TYPE fineprintai_total_subscriptions gauge
fineprintai_total_subscriptions ${stats.totalSubscriptions}
`);
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });
  }

  private setupSocketHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      logger.info('Client connected', { socketId: socket.id });

      // Handle authentication/user identification
      socket.on('authenticate', (data: { userId: string; token?: string }) => {
        try {
          // In a real implementation, you'd validate the token
          const { userId } = data;
          
          if (!userId) {
            socket.emit('auth_error', { message: 'User ID required' });
            return;
          }

          // Store connection info
          const connectionInfo: ConnectionInfo = {
            socketId: socket.id,
            userId,
            connectedAt: new Date(),
            subscribedAnalyses: [],
            lastActivity: new Date()
          };

          this.connections.set(socket.id, connectionInfo);

          // Track user sockets
          if (!this.userSockets.has(userId)) {
            this.userSockets.set(userId, new Set());
          }
          this.userSockets.get(userId)!.add(socket.id);

          socket.emit('authenticated', {
            userId,
            socketId: socket.id,
            timestamp: new Date().toISOString()
          });

          logger.info('Client authenticated', { socketId: socket.id, userId });

        } catch (error) {
          logger.error('Authentication failed', { 
            socketId: socket.id, 
            error: error.message 
          });
          socket.emit('auth_error', { message: 'Authentication failed' });
        }
      });

      // Handle analysis subscription
      socket.on('subscribe_analysis', (data: { analysisId: string }) => {
        const connection = this.connections.get(socket.id);
        if (!connection) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        const { analysisId } = data;
        
        // Add to analysis subscribers
        if (!this.analysisSubscribers.has(analysisId)) {
          this.analysisSubscribers.set(analysisId, new Set());
        }
        this.analysisSubscribers.get(analysisId)!.add(socket.id);

        // Update connection info
        connection.subscribedAnalyses.push(analysisId);
        connection.lastActivity = new Date();

        // Send current progress if available
        const currentProgress = this.getAnalysisProgress(analysisId);
        if (currentProgress) {
          socket.emit('analysis_progress', {
            type: 'analysis_progress',
            data: {
              ...currentProgress,
              timestamp: currentProgress.timestamp.toISOString()
            }
          });
        }

        socket.emit('subscribed', { analysisId });
        
        logger.info('Client subscribed to analysis', {
          socketId: socket.id,
          userId: connection.userId,
          analysisId
        });
      });

      // Handle analysis unsubscription
      socket.on('unsubscribe_analysis', (data: { analysisId: string }) => {
        const connection = this.connections.get(socket.id);
        if (!connection) return;

        const { analysisId } = data;
        
        // Remove from analysis subscribers
        const subscribers = this.analysisSubscribers.get(analysisId);
        if (subscribers) {
          subscribers.delete(socket.id);
          if (subscribers.size === 0) {
            this.analysisSubscribers.delete(analysisId);
          }
        }

        // Update connection info
        const index = connection.subscribedAnalyses.indexOf(analysisId);
        if (index > -1) {
          connection.subscribedAnalyses.splice(index, 1);
        }
        connection.lastActivity = new Date();

        socket.emit('unsubscribed', { analysisId });
        
        logger.info('Client unsubscribed from analysis', {
          socketId: socket.id,
          userId: connection.userId,
          analysisId
        });
      });

      // Handle get analysis history
      socket.on('get_analysis_history', (data: { analysisId: string }) => {
        const connection = this.connections.get(socket.id);
        if (!connection) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        const history = this.getAnalysisHistory(data.analysisId);
        socket.emit('analysis_history', {
          analysisId: data.analysisId,
          history: history.map(h => ({
            ...h,
            timestamp: h.timestamp.toISOString()
          }))
        });
      });

      // Handle ping/pong for connection health
      socket.on('ping', () => {
        const connection = this.connections.get(socket.id);
        if (connection) {
          connection.lastActivity = new Date();
        }
        socket.emit('pong', { timestamp: new Date().toISOString() });
      });

      // Handle disconnection
      socket.on('disconnect', (reason: string) => {
        const connection = this.connections.get(socket.id);
        
        if (connection) {
          // Clean up subscriptions
          connection.subscribedAnalyses.forEach(analysisId => {
            const subscribers = this.analysisSubscribers.get(analysisId);
            if (subscribers) {
              subscribers.delete(socket.id);
              if (subscribers.size === 0) {
                this.analysisSubscribers.delete(analysisId);
              }
            }
          });

          // Clean up user sockets
          const userSockets = this.userSockets.get(connection.userId);
          if (userSockets) {
            userSockets.delete(socket.id);
            if (userSockets.size === 0) {
              this.userSockets.delete(connection.userId);
            }
          }

          this.connections.delete(socket.id);

          logger.info('Client disconnected', {
            socketId: socket.id,
            userId: connection.userId,
            reason,
            connectionDuration: Date.now() - connection.connectedAt.getTime()
          });
        }
      });

      // Send welcome message
      socket.emit('connected', {
        message: 'Connected to Fine Print AI Progress Tracker',
        socketId: socket.id,
        timestamp: new Date().toISOString(),
        serverTime: new Date().toISOString()
      });
    });
  }

  private setupQueueListeners(): void {
    // Listen to queue manager events
    queueManager.on('jobStarted', (job) => {
      this.broadcastProgress({
        analysisId: job.analysisId,
        jobId: job.id,
        userId: job.userId,
        step: 'started',
        percentage: 0,
        message: 'Analysis started',
        timestamp: new Date(),
        estimatedTimeRemaining: job.estimatedDuration,
        currentOperation: 'Initializing analysis'
      });
    });

    queueManager.on('jobProgress', (data) => {
      this.broadcastProgress({
        analysisId: data.jobId, // This should be mapped to analysisId
        userId: '', // Would need to be passed from job data
        step: data.step,
        percentage: data.percentage,
        message: data.message,
        timestamp: new Date(),
        currentOperation: data.step
      });
    });

    queueManager.on('jobCompleted', (job) => {
      this.broadcastAnalysisComplete(job.analysisId, job.result);
    });

    queueManager.on('jobFailed', (job) => {
      this.broadcastAnalysisError(job.analysisId, job.error || 'Analysis failed');
    });

    logger.info('Queue event listeners setup completed');
  }

  private startCleanupTasks(): void {
    // Clean up old progress history every hour
    setInterval(() => {
      this.cleanupOldHistory();
    }, 60 * 60 * 1000);

    // Clean up inactive connections every 5 minutes
    setInterval(() => {
      this.cleanupInactiveConnections();
    }, 5 * 60 * 1000);
  }

  private cleanupOldHistory(): void {
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    let cleanedAnalyses = 0;

    for (const [analysisId, history] of this.analysisHistory.entries()) {
      // Remove history older than 24 hours
      const filteredHistory = history.filter(h => h.timestamp.getTime() > oneDayAgo);
      
      if (filteredHistory.length === 0) {
        this.analysisHistory.delete(analysisId);
        cleanedAnalyses++;
      } else if (filteredHistory.length < history.length) {
        this.analysisHistory.set(analysisId, filteredHistory);
      }
    }

    if (cleanedAnalyses > 0) {
      logger.info('Cleaned up old analysis history', { cleanedAnalyses });
    }
  }

  private cleanupInactiveConnections(): void {
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    const toRemove: string[] = [];

    for (const [socketId, connection] of this.connections.entries()) {
      if (connection.lastActivity.getTime() < fiveMinutesAgo) {
        // Check if socket is still connected
        const socket = this.io.sockets.sockets.get(socketId);
        if (!socket || !socket.connected) {
          toRemove.push(socketId);
        }
      }
    }

    toRemove.forEach(socketId => {
      const connection = this.connections.get(socketId);
      if (connection) {
        // Clean up subscriptions
        connection.subscribedAnalyses.forEach(analysisId => {
          const subscribers = this.analysisSubscribers.get(analysisId);
          if (subscribers) {
            subscribers.delete(socketId);
            if (subscribers.size === 0) {
              this.analysisSubscribers.delete(analysisId);
            }
          }
        });

        this.connections.delete(socketId);
      }
    });

    if (toRemove.length > 0) {
      logger.info('Cleaned up inactive connections', { count: toRemove.length });
    }
  }

  // Method to send direct message to user
  sendToUser(userId: string, event: string, data: any): boolean {
    const userSockets = this.userSockets.get(userId);
    if (!userSockets || userSockets.size === 0) {
      return false;
    }

    let sent = 0;
    userSockets.forEach(socketId => {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit(event, data);
        sent++;
      }
    });

    return sent > 0;
  }

  // Method to broadcast to all authenticated users
  broadcastToAll(event: string, data: any): number {
    let sent = 0;
    
    this.connections.forEach((connection, socketId) => {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit(event, data);
        sent++;
      }
    });

    return sent;
  }
}

// Singleton instance
export const progressTracker = new ProgressTracker();