import { createServer } from 'http'
import { Server } from 'socket.io'
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

const httpServer = createServer()

// Add a simple health check endpoint
httpServer.on('request', (req, res) => {
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: 'websocket',
    }))
    return
  }
  
  if (req.url === '/metrics' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end(`# HELP fineprintai_websocket_connections Total number of WebSocket connections
# TYPE fineprintai_websocket_connections gauge
fineprintai_websocket_connections ${io.engine.clientsCount}
`)
    return
  }

  res.writeHead(404)
  res.end('Not found')
})

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
    methods: ['GET', 'POST'],
  },
})

io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`)

  socket.on('join_room', (room: string) => {
    socket.join(room)
    logger.info(`Client ${socket.id} joined room: ${room}`)
    socket.emit('joined_room', room)
  })

  socket.on('leave_room', (room: string) => {
    socket.leave(room)
    logger.info(`Client ${socket.id} left room: ${room}`)
    socket.emit('left_room', room)
  })

  socket.on('analysis_progress', (data) => {
    logger.info(`Analysis progress update: ${JSON.stringify(data)}`)
    // Broadcast to room if specified, otherwise to all clients
    if (data.room) {
      socket.to(data.room).emit('analysis_update', data)
    } else {
      socket.broadcast.emit('analysis_update', data)
    }
  })

  socket.on('disconnect', (reason) => {
    logger.info(`Client disconnected: ${socket.id}, reason: ${reason}`)
  })

  // Send welcome message
  socket.emit('welcome', {
    message: 'Connected to Fine Print AI WebSocket server',
    timestamp: new Date().toISOString(),
  })
})

const start = async () => {
  const port = Number(process.env.WS_PORT) || 8001
  const host = process.env.WS_HOST || '0.0.0.0'

  httpServer.listen(port, host, () => {
    logger.info(`🔌 Fine Print AI WebSocket server listening on http://${host}:${port}`)
    logger.info(`🔍 Health check available at http://${host}:${port}/health`)
  })
}

start().catch((err) => {
  logger.error('Failed to start WebSocket server:', err)
  process.exit(1)
})