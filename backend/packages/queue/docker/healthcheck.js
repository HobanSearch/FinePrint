#!/usr/bin/env node
/**
 * Health check script for Fine Print AI Queue System
 * Used by Docker HEALTHCHECK to determine container health
 */

const http = require('http');
const Redis = require('ioredis');

const HEALTH_CHECK_PORT = process.env.HEALTH_CHECK_PORT || 3000;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const HEALTH_CHECK_TIMEOUT = 5000;

async function checkRedisConnection() {
  let redis;
  try {
    redis = new Redis(REDIS_URL, {
      connectTimeout: 2000,
      lazyConnect: true,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 1,
    });
    
    await redis.connect();
    const pingResult = await redis.ping();
    await redis.disconnect();
    
    return pingResult === 'PONG';
  } catch (error) {
    console.error('Redis health check failed:', error.message);
    if (redis) {
      try {
        await redis.disconnect();
      } catch (disconnectError) {
        // Ignore disconnect errors during health check
      }
    }
    return false;
  }
}

async function checkHttpEndpoint() {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port: HEALTH_CHECK_PORT,
      path: '/health',
      method: 'GET',
      timeout: 2000,
    }, (res) => {
      resolve(res.statusCode === 200);
    });

    req.on('error', (err) => {
      console.error('HTTP health check failed:', err.message);
      resolve(false);
    });

    req.on('timeout', () => {
      console.error('HTTP health check timed out');
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

async function checkMemoryUsage() {
  try {
    const memUsage = process.memoryUsage();
    const totalMemory = memUsage.heapTotal;
    const usedMemory = memUsage.heapUsed;
    const memoryUsagePercent = (usedMemory / totalMemory) * 100;

    // Fail if memory usage is above 90%
    if (memoryUsagePercent > 90) {
      console.error(`High memory usage: ${memoryUsagePercent.toFixed(2)}%`);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Memory usage check failed:', error.message);
    return false;
  }
}

async function runHealthChecks() {
  console.log('Starting health checks...');
  
  const checks = [
    { name: 'Redis Connection', check: checkRedisConnection },
    { name: 'HTTP Endpoint', check: checkHttpEndpoint },
    { name: 'Memory Usage', check: checkMemoryUsage },
  ];

  const results = [];
  
  for (const { name, check } of checks) {
    try {
      const startTime = Date.now();
      const result = await Promise.race([
        check(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), HEALTH_CHECK_TIMEOUT)
        )
      ]);
      const duration = Date.now() - startTime;
      
      results.push({ name, result, duration });
      console.log(`✓ ${name}: ${result ? 'PASS' : 'FAIL'} (${duration}ms)`);
    } catch (error) {
      results.push({ name, result: false, error: error.message });
      console.log(`✗ ${name}: FAIL (${error.message})`);
    }
  }

  const allPassed = results.every(r => r.result);
  const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0);
  
  console.log(`Health check completed: ${allPassed ? 'HEALTHY' : 'UNHEALTHY'} (${totalDuration}ms)`);
  
  if (!allPassed) {
    const failedChecks = results.filter(r => !r.result).map(r => r.name);
    console.error('Failed checks:', failedChecks.join(', '));
  }

  return allPassed;
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('Health check received SIGTERM, exiting...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Health check received SIGINT, exiting...');
  process.exit(0);
});

// Run health checks
runHealthChecks()
  .then((healthy) => {
    process.exit(healthy ? 0 : 1);
  })
  .catch((error) => {
    console.error('Health check error:', error);
    process.exit(1);
  });