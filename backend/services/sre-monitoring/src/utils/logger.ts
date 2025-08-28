import pino from 'pino';
import { config } from '../config';

// Create Loki transport for centralized logging
const lokiTransport = config.loki ? {
  target: 'pino-loki',
  options: {
    host: `http://${config.loki.host}:${config.loki.port}`,
    labels: config.loki.labels,
    batching: true,
    batchSize: config.loki.batchSize,
    interval: config.loki.batchInterval,
  },
} : undefined;

// Configure transports
const transports = [];
if (lokiTransport) {
  transports.push(lokiTransport);
}

// Create logger instance
export const logger = pino({
  level: config.logging.level,
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: config.logging.redact,
  serializers: {
    error: pino.stdSerializers.err,
    request: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      headers: req.headers,
      remoteAddress: req.ip,
    }),
    response: (res) => ({
      statusCode: res.statusCode,
    }),
  },
  transport: transports.length > 0 ? { targets: transports } : undefined,
  ...(config.logging.pretty && config.environment === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),
});

// Create child loggers for specific components
export const metricsLogger = logger.child({ component: 'metrics' });
export const incidentLogger = logger.child({ component: 'incident' });
export const alertLogger = logger.child({ component: 'alert' });
export const chaosLogger = logger.child({ component: 'chaos' });
export const healthLogger = logger.child({ component: 'health' });

export default logger;