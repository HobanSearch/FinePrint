"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = metricsRoutes;
async function metricsRoutes(server) {
    server.get('/', {
        schema: {
            tags: ['Metrics'],
            summary: 'Prometheus metrics',
            response: {
                200: {
                    type: 'string',
                    description: 'Prometheus format metrics',
                },
            },
        },
    }, async (request, reply) => {
        const metrics = `
# HELP gateway_requests_total Total number of requests
# TYPE gateway_requests_total counter
gateway_requests_total{service="gateway"} 1000

# HELP gateway_request_duration_seconds Request duration in seconds
# TYPE gateway_request_duration_seconds histogram
gateway_request_duration_seconds_bucket{le="0.1"} 800
gateway_request_duration_seconds_bucket{le="0.5"} 950
gateway_request_duration_seconds_bucket{le="1.0"} 990
gateway_request_duration_seconds_bucket{le="+Inf"} 1000
gateway_request_duration_seconds_sum 450.5
gateway_request_duration_seconds_count 1000

# HELP gateway_health_status Health status of components
# TYPE gateway_health_status gauge
gateway_health_status{component="kong"} 1
gateway_health_status{component="redis"} 1
gateway_health_status{component="health_service"} 1
`;
        reply.type('text/plain').send(metrics.trim());
    });
    server.get('/gateway', {
        schema: {
            tags: ['Metrics'],
            summary: 'Gateway-specific metrics',
        },
    }, async (request, reply) => {
        reply.send({
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            cpu: process.cpuUsage(),
            timestamp: new Date().toISOString(),
        });
    });
}
//# sourceMappingURL=metrics.js.map