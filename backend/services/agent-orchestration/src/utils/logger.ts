import pino from 'pino';
import { config } from '../config';

export class Logger {
  private static instance: pino.Logger;

  public static getInstance(): pino.Logger {
    if (!Logger.instance) {
      Logger.instance = pino({
        name: 'agent-orchestration',
        level: config.environment === 'development' ? 'debug' : 'info',
        transport: config.environment === 'development' ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        } : undefined,
        formatters: {
          level: (label) => {
            return { level: label.toUpperCase() };
          },
        },
        timestamp: pino.stdTimeFunctions.isoTime,
        serializers: {
          req: pino.stdSerializers.req,
          res: pino.stdSerializers.res,
          err: pino.stdSerializers.err,
        },
      });
    }
    
    return Logger.instance;
  }

  public static child(bindings: pino.Bindings): pino.Logger {
    return Logger.getInstance().child(bindings);
  }
}