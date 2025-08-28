import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { MonitoringDashboard } from '../services/monitoring-dashboard';
import { AgentType } from '../types';

export async function dashboardRoutes(
  fastify: FastifyInstance,
  options: FastifyPluginOptions
) {
  // Initialize monitoring dashboard
  const dashboard = new MonitoringDashboard(
    fastify.teamManager,
    fastify.teamManager['workflowOrchestrator'],
    fastify.coordinationHub
  );

  // Add dashboard to fastify context
  fastify.decorate('dashboard', dashboard);

  // Get complete dashboard metrics
  fastify.get('/api/dashboard', async (request, reply) => {
    try {
      const metrics = await dashboard.getDashboardMetrics();

      return {
        success: true,
        metrics,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      fastify.log.error('Failed to get dashboard metrics', error);
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // Get team-specific dashboard
  fastify.get<{
    Params: { teamId: string };
  }>('/api/dashboard/teams/:teamId', async (request, reply) => {
    try {
      const { teamId } = request.params;
      const teamDashboard = await dashboard.getTeamDashboard(teamId);

      return {
        success: true,
        dashboard: teamDashboard,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      fastify.log.error('Failed to get team dashboard', error);
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // Get workflow execution timeline
  fastify.get<{
    Params: { executionId: string };
  }>('/api/dashboard/workflows/:executionId/timeline', async (request, reply) => {
    try {
      const { executionId } = request.params;
      const timeline = await dashboard.getWorkflowTimeline(executionId);

      return {
        success: true,
        timeline,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      fastify.log.error('Failed to get workflow timeline', error);
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // Get agent performance comparison
  fastify.get<{
    Querystring: { agentType?: AgentType };
  }>('/api/dashboard/agents/comparison', async (request, reply) => {
    try {
      const { agentType } = request.query;
      const comparison = await dashboard.getAgentComparison(agentType);

      return {
        success: true,
        comparison,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      fastify.log.error('Failed to get agent comparison', error);
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // Get system overview
  fastify.get('/api/dashboard/overview', async (request, reply) => {
    try {
      const metrics = await dashboard.getDashboardMetrics();

      return {
        success: true,
        overview: metrics.overview,
        alerts: metrics.alerts.filter(a => a.severity === 'critical' || a.severity === 'error'),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      fastify.log.error('Failed to get system overview', error);
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // Get performance metrics
  fastify.get('/api/dashboard/performance', async (request, reply) => {
    try {
      const metrics = await dashboard.getDashboardMetrics();

      return {
        success: true,
        performance: metrics.performance,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      fastify.log.error('Failed to get performance metrics', error);
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // Get alerts
  fastify.get<{
    Querystring: { 
      severity?: 'info' | 'warning' | 'error' | 'critical';
      limit?: number;
    };
  }>('/api/dashboard/alerts', async (request, reply) => {
    try {
      const { severity, limit = 50 } = request.query;
      const metrics = await dashboard.getDashboardMetrics();
      
      let alerts = metrics.alerts;
      if (severity) {
        alerts = alerts.filter(a => a.severity === severity);
      }

      return {
        success: true,
        alerts: alerts.slice(-limit),
        total: alerts.length,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      fastify.log.error('Failed to get alerts', error);
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // WebSocket endpoint for real-time dashboard updates
  fastify.register(async function (fastify) {
    fastify.get('/ws/dashboard', { websocket: true }, (connection, request) => {
      fastify.log.info('Dashboard WebSocket connection established');

      // Send initial metrics
      dashboard.getDashboardMetrics().then(metrics => {
        connection.socket.send(JSON.stringify({
          type: 'initial-metrics',
          data: metrics
        }));
      });

      // Listen to dashboard events
      const eventHandlers = {
        metricsUpdated: (metrics: any) => {
          connection.socket.send(JSON.stringify({
            type: 'metrics-update',
            data: metrics
          }));
        },
        newAlert: (alert: any) => {
          connection.socket.send(JSON.stringify({
            type: 'new-alert',
            data: alert
          }));
        }
      };

      // Register event listeners
      Object.entries(eventHandlers).forEach(([event, handler]) => {
        dashboard.on(event, handler);
      });

      // Handle client messages
      connection.socket.on('message', async (data: string) => {
        try {
          const message = JSON.parse(data);
          
          switch (message.type) {
            case 'subscribe-team':
              // Send team-specific updates
              const teamDashboard = await dashboard.getTeamDashboard(message.teamId);
              connection.socket.send(JSON.stringify({
                type: 'team-update',
                teamId: message.teamId,
                data: teamDashboard
              }));
              break;
              
            case 'subscribe-workflow':
              // Send workflow-specific updates
              const timeline = await dashboard.getWorkflowTimeline(message.executionId);
              connection.socket.send(JSON.stringify({
                type: 'workflow-update',
                executionId: message.executionId,
                data: timeline
              }));
              break;
          }
        } catch (error) {
          fastify.log.error('Error handling dashboard WebSocket message', error);
        }
      });

      connection.socket.on('close', () => {
        // Remove event listeners
        Object.entries(eventHandlers).forEach(([event, handler]) => {
          dashboard.off(event, handler);
        });
        
        fastify.log.info('Dashboard WebSocket connection closed');
      });
    });
  });

  // Export dashboard data
  fastify.get<{
    Querystring: { 
      format?: 'json' | 'csv';
      period?: string;
    };
  }>('/api/dashboard/export', async (request, reply) => {
    try {
      const { format = 'json', period = '24h' } = request.query;
      const metrics = await dashboard.getDashboardMetrics();

      if (format === 'csv') {
        // Convert to CSV format
        const csv = convertMetricsToCSV(metrics);
        reply.type('text/csv');
        reply.header('Content-Disposition', `attachment; filename="dashboard-export-${Date.now()}.csv"`);
        return csv;
      }

      // JSON format
      reply.type('application/json');
      reply.header('Content-Disposition', `attachment; filename="dashboard-export-${Date.now()}.json"`);
      return metrics;
    } catch (error) {
      fastify.log.error('Failed to export dashboard data', error);
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // Cleanup on server shutdown
  fastify.addHook('onClose', async () => {
    dashboard.stop();
  });
}

// Helper function to convert metrics to CSV
function convertMetricsToCSV(metrics: any): string {
  const lines: string[] = [];
  
  // System Overview
  lines.push('System Overview');
  lines.push('Metric,Value');
  lines.push(`Total Teams,${metrics.overview.totalTeams}`);
  lines.push(`Active Teams,${metrics.overview.activeTeams}`);
  lines.push(`Total Agents,${metrics.overview.totalAgents}`);
  lines.push(`Active Agents,${metrics.overview.activeAgents}`);
  lines.push(`System Health,${metrics.overview.systemHealth}`);
  lines.push('');

  // Team Metrics
  lines.push('Team Metrics');
  lines.push('Team ID,Team Name,Status,Active Executions,Success Rate,Trend');
  metrics.teams.forEach((team: any) => {
    lines.push(`${team.teamId},${team.teamName},${team.status},${team.activeExecutions},${team.successRate}%,${team.trend}`);
  });
  lines.push('');

  // Performance Metrics
  lines.push('Performance Metrics');
  lines.push('Metric,Current,Average,Peak');
  lines.push(`Throughput,${metrics.performance.throughput.current},${metrics.performance.throughput.average},${metrics.performance.throughput.peak}`);
  lines.push(`Error Rate,${metrics.performance.errorRate}%,,`);
  lines.push(`CPU Utilization,${metrics.performance.resourceUtilization.cpu}%,,`);

  return lines.join('\n');
}

// TypeScript declarations
declare module 'fastify' {
  interface FastifyInstance {
    dashboard: MonitoringDashboard;
  }
}