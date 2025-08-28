import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { config } from '../config';
import { logger } from '../utils/logger';

let sdk: NodeSDK;

export async function initializeOpenTelemetry(): Promise<void> {
  logger.info('Initializing OpenTelemetry');

  const resource = new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: config.jaeger.serviceName,
    [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: config.environment,
  });

  // Configure Jaeger exporter for traces
  const jaegerExporter = new JaegerExporter({
    endpoint: config.jaeger.endpoint,
  });

  // Configure Prometheus exporter for metrics
  const prometheusExporter = new PrometheusExporter({
    port: config.prometheus.port,
    endpoint: config.prometheus.path,
  });

  const metricReader = new PeriodicExportingMetricReader({
    exporter: prometheusExporter,
    exportIntervalMillis: config.prometheus.scrapeInterval,
  });

  sdk = new NodeSDK({
    resource,
    traceExporter: jaegerExporter,
    metricReader,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': {
          enabled: false, // Disable fs instrumentation to reduce noise
        },
      }),
    ],
  });

  await sdk.start();
  logger.info('OpenTelemetry initialized successfully');
}

export async function shutdownOpenTelemetry(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    logger.info('OpenTelemetry shut down');
  }
}