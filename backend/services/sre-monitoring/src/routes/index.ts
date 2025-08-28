import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { MetricsCollector } from '../metrics/collector';
import { IncidentManager } from '../incident/manager';
import { ChaosEngineer } from '../chaos/engineer';
import { HealthChecker } from '../health/checker';
import { AlertingEngine } from '../alerting/engine';
import { CapacityPlanner } from '../capacity/planner';
import { SLOManager } from '../slo/manager';

interface Components {
  metricsCollector: MetricsCollector;
  incidentManager: IncidentManager;
  chaosEngineer: ChaosEngineer;
  healthChecker: HealthChecker;
  alertingEngine: AlertingEngine;
  capacityPlanner: CapacityPlanner;
  sloManager: SLOManager;
}

export async function registerRoutes(server: FastifyInstance, components: Components) {
  // Health endpoints
  server.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    return { status: 'healthy', timestamp: new Date() };
  });

  server.get('/health/live', async (request: FastifyRequest, reply: FastifyReply) => {
    const isLive = await components.healthChecker.checkLiveness();
    reply.status(isLive ? 200 : 503).send({ live: isLive });
  });

  server.get('/health/ready', async (request: FastifyRequest, reply: FastifyReply) => {
    const isReady = await components.healthChecker.checkReadiness();
    reply.status(isReady ? 200 : 503).send({ ready: isReady });
  });

  server.get('/health/startup', async (request: FastifyRequest, reply: FastifyReply) => {
    const hasStarted = await components.healthChecker.checkStartup();
    reply.status(hasStarted ? 200 : 503).send({ started: hasStarted });
  });

  // Metrics endpoints
  server.get('/metrics', async (request: FastifyRequest, reply: FastifyReply) => {
    const metrics = await components.metricsCollector.getMetrics();
    reply
      .header('Content-Type', components.metricsCollector.getContentType())
      .send(metrics);
  });

  server.get('/api/metrics/:name', async (request: FastifyRequest<{
    Params: { name: string }
  }>, reply: FastifyReply) => {
    const value = await components.metricsCollector.getMetricValue(request.params.name);
    if (!value) {
      return reply.status(404).send({ error: 'Metric not found' });
    }
    return { metric: request.params.name, value };
  });

  // SLO endpoints
  server.get('/api/slo/status', async (request: FastifyRequest<{
    Querystring: { service?: string }
  }>, reply: FastifyReply) => {
    const status = await components.sloManager.getSLOStatus(request.query.service);
    return Array.from(status.entries()).map(([service, data]) => ({
      service,
      ...data,
    }));
  });

  server.get('/api/slo/report/:service', async (request: FastifyRequest<{
    Params: { service: string };
    Querystring: { period?: string };
  }>, reply: FastifyReply) => {
    const report = await components.sloManager.generateReport(
      request.params.service,
      request.query.period
    );
    return report;
  });

  // Incident endpoints
  server.get('/api/incidents', async (request: FastifyRequest<{
    Querystring: {
      status?: string;
      severity?: string;
      service?: string;
      team?: string;
    }
  }>, reply: FastifyReply) => {
    const incidents = await components.incidentManager.getIncidents(request.query);
    return incidents;
  });

  const CreateIncidentSchema = z.object({
    title: z.string(),
    description: z.string(),
    severity: z.enum(['critical', 'high', 'medium', 'low']),
    service: z.string(),
    impactedServices: z.array(z.string()).optional(),
  });

  server.post('/api/incidents', async (request: FastifyRequest<{
    Body: z.infer<typeof CreateIncidentSchema>
  }>, reply: FastifyReply) => {
    const body = CreateIncidentSchema.parse(request.body);
    const incident = await components.incidentManager.createIncident(body);
    reply.status(201).send(incident);
  });

  server.post('/api/incidents/:id/acknowledge', async (request: FastifyRequest<{
    Params: { id: string };
    Body: { acknowledgedBy: string };
  }>, reply: FastifyReply) => {
    await components.incidentManager.acknowledgeIncident(
      request.params.id,
      request.body.acknowledgedBy
    );
    return { success: true };
  });

  server.post('/api/incidents/:id/resolve', async (request: FastifyRequest<{
    Params: { id: string };
    Body: { resolution: string; resolvedBy: string };
  }>, reply: FastifyReply) => {
    await components.incidentManager.resolveIncident(
      request.params.id,
      request.body.resolution,
      request.body.resolvedBy
    );
    return { success: true };
  });

  server.get('/api/incidents/metrics', async (request: FastifyRequest, reply: FastifyReply) => {
    const metrics = await components.incidentManager.getIncidentMetrics();
    return metrics;
  });

  // Alerting endpoints
  server.get('/api/alerts', async (request: FastifyRequest<{
    Querystring: {
      status?: string;
      severity?: string;
      service?: string;
    }
  }>, reply: FastifyReply) => {
    const alerts = components.alertingEngine.getAlerts(request.query);
    return alerts;
  });

  server.get('/api/alerts/groups', async (request: FastifyRequest, reply: FastifyReply) => {
    const groups = components.alertingEngine.getAlertGroups();
    return groups;
  });

  const CreateAlertSchema = z.object({
    title: z.string(),
    description: z.string(),
    severity: z.enum(['critical', 'warning', 'info']),
    source: z.string(),
    service: z.string().optional(),
    labels: z.record(z.string()).optional(),
    annotations: z.record(z.string()).optional(),
  });

  server.post('/api/alerts', async (request: FastifyRequest<{
    Body: z.infer<typeof CreateAlertSchema>
  }>, reply: FastifyReply) => {
    const body = CreateAlertSchema.parse(request.body);
    const alert = await components.alertingEngine.createAlert(body);
    reply.status(201).send(alert);
  });

  const CreateSilenceSchema = z.object({
    matchers: z.array(z.object({
      name: z.string(),
      value: z.string(),
      isRegex: z.boolean(),
    })),
    duration: z.number(),
    comment: z.string(),
    createdBy: z.string(),
  });

  server.post('/api/alerts/silence', async (request: FastifyRequest<{
    Body: z.infer<typeof CreateSilenceSchema>
  }>, reply: FastifyReply) => {
    const body = CreateSilenceSchema.parse(request.body);
    const silence = await components.alertingEngine.createSilence(body);
    reply.status(201).send(silence);
  });

  // Chaos engineering endpoints
  server.get('/api/chaos/experiments', async (request: FastifyRequest, reply: FastifyReply) => {
    const experiments = components.chaosEngineer.getExperiments();
    return experiments;
  });

  server.get('/api/chaos/history', async (request: FastifyRequest, reply: FastifyReply) => {
    const history = components.chaosEngineer.getExperimentHistory();
    return history;
  });

  server.post('/api/chaos/experiments/:id/run', async (request: FastifyRequest<{
    Params: { id: string };
  }>, reply: FastifyReply) => {
    const result = await components.chaosEngineer.runExperiment(request.params.id);
    return result;
  });

  const CreateGameDaySchema = z.object({
    name: z.string(),
    description: z.string(),
    scheduledDate: z.string().transform(s => new Date(s)),
    experiments: z.array(z.string()),
    participants: z.array(z.string()),
    objectives: z.array(z.string()),
    successCriteria: z.array(z.string()),
  });

  server.post('/api/chaos/gamedays', async (request: FastifyRequest<{
    Body: z.infer<typeof CreateGameDaySchema>
  }>, reply: FastifyReply) => {
    const body = CreateGameDaySchema.parse(request.body);
    const gameDay = await components.chaosEngineer.createGameDay(body);
    reply.status(201).send(gameDay);
  });

  server.post('/api/chaos/gamedays/:id/run', async (request: FastifyRequest<{
    Params: { id: string };
  }>, reply: FastifyReply) => {
    const report = await components.chaosEngineer.runGameDay(request.params.id);
    return report;
  });

  // Health monitoring endpoints
  server.get('/api/health/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const status = await components.healthChecker.getHealthStatus();
    return {
      overall: status.overall,
      services: Array.from(status.services.entries()).map(([name, health]) => ({
        name,
        ...health,
      })),
      checks: Array.from(status.checks.entries()).map(([name, check]) => ({
        name,
        ...check,
      })),
    };
  });

  server.post('/api/health/deadman/:service', async (request: FastifyRequest<{
    Params: { service: string };
  }>, reply: FastifyReply) => {
    components.healthChecker.updateDeadManSwitch(request.params.service);
    return { success: true };
  });

  // Capacity planning endpoints
  server.get('/api/capacity/services', async (request: FastifyRequest<{
    Querystring: { service?: string };
  }>, reply: FastifyReply) => {
    const capacity = components.capacityPlanner.getServiceCapacity(request.query.service);
    return Array.isArray(capacity) ? capacity : [capacity];
  });

  server.get('/api/capacity/forecasts', async (request: FastifyRequest<{
    Querystring: { service?: string };
  }>, reply: FastifyReply) => {
    const forecasts = components.capacityPlanner.getForecasts(request.query.service);
    return forecasts;
  });

  server.get('/api/capacity/recommendations', async (request: FastifyRequest, reply: FastifyReply) => {
    const recommendations = components.capacityPlanner.getRecommendations();
    return recommendations;
  });

  server.get('/api/capacity/costs', async (request: FastifyRequest, reply: FastifyReply) => {
    const costs = components.capacityPlanner.getCostAnalysis();
    if (!costs) {
      return reply.status(404).send({ error: 'Cost analysis not available' });
    }
    return costs;
  });

  // Dashboard endpoint
  server.get('/api/dashboard', async (request: FastifyRequest, reply: FastifyReply) => {
    const [
      sloStatus,
      activeIncidents,
      firingAlerts,
      healthStatus,
      recommendations,
      costs,
    ] = await Promise.all([
      components.sloManager.getSLOStatus(),
      components.incidentManager.getIncidents({ status: 'open' }),
      components.alertingEngine.getAlerts({ status: 'firing' }),
      components.healthChecker.getHealthStatus(),
      components.capacityPlanner.getRecommendations(),
      components.capacityPlanner.getCostAnalysis(),
    ]);

    return {
      summary: {
        overallHealth: healthStatus.overall,
        activeIncidents: activeIncidents.length,
        firingAlerts: firingAlerts.length,
        sloCompliance: Array.from(sloStatus.values())
          .every(s => s.overallCompliant) ? 'compliant' : 'violated',
        monthlyCost: costs?.currentMonthlyCost || 0,
      },
      slo: Array.from(sloStatus.entries()).map(([service, data]) => ({
        service,
        ...data,
      })),
      incidents: activeIncidents.slice(0, 5), // Top 5
      alerts: firingAlerts.slice(0, 5), // Top 5
      recommendations: recommendations.slice(0, 5), // Top 5
      services: Array.from(healthStatus.services.entries()).map(([name, health]) => ({
        name,
        status: health.status,
        metrics: health.metrics,
      })),
    };
  });

  // WebSocket for real-time updates
  server.get('/ws/events', { websocket: true }, (connection, req) => {
    // Subscribe to events
    const handlers = {
      onIncident: (incident: any) => {
        connection.socket.send(JSON.stringify({
          type: 'incident',
          data: incident,
        }));
      },
      onAlert: (alert: any) => {
        connection.socket.send(JSON.stringify({
          type: 'alert',
          data: alert,
        }));
      },
      onSLOViolation: (violation: any) => {
        connection.socket.send(JSON.stringify({
          type: 'slo_violation',
          data: violation,
        }));
      },
      onCapacityBreach: (breach: any) => {
        connection.socket.send(JSON.stringify({
          type: 'capacity_breach',
          data: breach,
        }));
      },
    };

    components.incidentManager.on('incident-created', handlers.onIncident);
    components.alertingEngine.on('alert-fired', handlers.onAlert);
    components.sloManager.on('slo-violation', handlers.onSLOViolation);
    components.capacityPlanner.on('capacity-breach', handlers.onCapacityBreach);

    connection.socket.on('close', () => {
      // Unsubscribe from events
      components.incidentManager.removeListener('incident-created', handlers.onIncident);
      components.alertingEngine.removeListener('alert-fired', handlers.onAlert);
      components.sloManager.removeListener('slo-violation', handlers.onSLOViolation);
      components.capacityPlanner.removeListener('capacity-breach', handlers.onCapacityBreach);
    });
  });
}