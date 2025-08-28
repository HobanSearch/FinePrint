/**
 * Temporal worker for executing improvement workflows
 */

import { Worker, NativeConnection } from '@temporalio/worker';
import * as activities from './activities';
import path from 'path';

async function run() {
  // Create connection to Temporal server
  const connection = await NativeConnection.connect({
    address: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
  });

  // Create worker that hosts workflows and activities
  const worker = await Worker.create({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE || 'default',
    taskQueue: process.env.TEMPORAL_TASK_QUEUE || 'improvement-orchestrator',
    
    // Workflow configuration
    workflowsPath: path.join(__dirname, 'workflows'),
    
    // Activity configuration
    activities,
    
    // Worker configuration
    maxConcurrentActivityTaskExecutions: 10,
    maxConcurrentWorkflowTaskExecutions: 10,
    maxCachedWorkflows: 100,
    
    // Sticky execution for better performance
    enableSDKTracing: true,
    
    // Identity for debugging
    identity: `worker-${process.pid}@${require('os').hostname()}`,
  });

  // Start the worker
  console.log('Starting Temporal worker...');
  console.log(`Task Queue: ${process.env.TEMPORAL_TASK_QUEUE || 'improvement-orchestrator'}`);
  console.log(`Namespace: ${process.env.TEMPORAL_NAMESPACE || 'default'}`);
  console.log(`Address: ${process.env.TEMPORAL_ADDRESS || 'localhost:7233'}`);
  
  await worker.run();
}

// Handle shutdown gracefully
process.on('SIGINT', () => {
  console.log('Worker shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Worker shutting down...');
  process.exit(0);
});

// Start the worker
run().catch((err) => {
  console.error('Worker failed to start:', err);
  process.exit(1);
});