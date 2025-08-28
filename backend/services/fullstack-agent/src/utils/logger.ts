import pino from 'pino';
import { config } from '@/config';

export class Logger {
  private static instance: Logger;
  private logger: pino.Logger;

  private constructor() {
    this.logger = pino({
      level: config.logger.level,
      ...(config.logger.prettyPrint && {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        },
      }),
      redact: config.logger.redactPaths,
      serializers: {
        err: pino.stdSerializers.err,
        req: pino.stdSerializers.req,
        res: pino.stdSerializers.res,
      },
      base: {
        service: 'fullstack-agent',
        version: '1.0.0',
      },
    });
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  info(message: string, meta?: any): void {
    this.logger.info(meta, message);
  }

  error(message: string, meta?: any): void {
    this.logger.error(meta, message);
  }

  warn(message: string, meta?: any): void {
    this.logger.warn(meta, message);
  }

  debug(message: string, meta?: any): void {
    this.logger.debug(meta, message);
  }

  trace(message: string, meta?: any): void {
    this.logger.trace(meta, message);
  }

  fatal(message: string, meta?: any): void {
    this.logger.fatal(meta, message);
  }

  child(bindings: pino.Bindings): pino.Logger {
    return this.logger.child(bindings);
  }
}