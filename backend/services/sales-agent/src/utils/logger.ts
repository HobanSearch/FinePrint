import { config } from '../config';

export const logger = {
  level: config.logLevel,
  
  serializers: {
    req: (req: any) => ({
      method: req.method,
      url: req.url,
      headers: {
        'user-agent': req.headers['user-agent'],
        'content-type': req.headers['content-type'],
      },
      remoteAddress: req.ip,
      remotePort: req.socket?.remotePort,
    }),
    
    res: (res: any) => ({
      statusCode: res.statusCode,
      headers: {
        'content-type': res.getHeader('content-type'),
        'content-length': res.getHeader('content-length'),
      },
    }),
    
    err: (err: any) => ({
      type: err.constructor.name,
      message: err.message,
      stack: err.stack,
      code: err.code,
      statusCode: err.statusCode,
    }),
  },
  
  formatters: {
    level: (label: string) => ({ level: label }),
    log: (obj: any) => ({
      ...obj,
      service: 'sales-agent',
      timestamp: new Date().toISOString(),
    }),
  },
  
  // Development formatting
  transport: config.nodeEnv === 'development' ? {
    target: 'pino-pretty',
    options: {
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname',
      colorize: true,
    },
  } : undefined,
};