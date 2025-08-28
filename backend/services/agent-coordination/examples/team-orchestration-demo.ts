import axios from 'axios';
import WebSocket from 'ws';

// Agent Coordination Service base URL
const BASE_URL = 'http://localhost:3014';
const WS_URL = 'ws://localhost:3014';

// Axios instance for API calls
const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

/**
 * Demo: Complete Product Launch Workflow
 * This demonstrates how to coordinate multiple teams for a product launch
 */
async function productLaunchDemo() {
  console.log('🚀 Starting Product Launch Demo\n');

  try {
    // Step 1: Check available teams
    console.log('1️⃣ Checking available teams...');
    const teamsResponse = await api.get('/api/teams');
    console.log(`Found ${teamsResponse.data.teams.length} teams available\n`);

    // Step 2: Execute multi-team product launch operation
    console.log('2️⃣ Executing product launch operation...');
    const launchResponse = await api.post('/api/teams/execute-operation', {
      operationType: 'PRODUCT_LAUNCH',
      context: {
        productName: 'Fine Print Pro v2.0',
        features: [
          'Advanced AI Document Analysis',
          'Real-time Compliance Monitoring',
          'Multi-language Support',
          'Enterprise Integration APIs'
        ],
        targetMarket: 'Enterprise B2B SaaS',
        launchDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
        budget: 100000,
        priority: 'critical'
      }
    });

    const executionIds = launchResponse.data.executionIds;
    console.log(`Product launch started with ${executionIds.length} team executions`);
    console.log(`Execution IDs: ${executionIds.join(', ')}\n`);

    // Step 3: Monitor execution progress
    console.log('3️⃣ Monitoring execution progress...');
    await monitorExecutions(executionIds);

    // Step 4: Get dashboard metrics
    console.log('\n4️⃣ Fetching dashboard metrics...');
    const dashboardResponse = await api.get('/api/dashboard/overview');
    const overview = dashboardResponse.data.overview;
    console.log(`System Health: ${overview.systemHealth}`);
    console.log(`Active Teams: ${overview.activeTeams}/${overview.totalTeams}`);
    console.log(`Active Agents: ${overview.activeAgents}/${overview.totalAgents}\n`);

    // Step 5: Check team-specific performance
    console.log('5️⃣ Checking team performance...');
    const teams = ['design-team', 'development-team', 'marketing-team', 'security-team'];
    
    for (const teamId of teams) {
      const teamDashboard = await api.get(`/api/dashboard/teams/${teamId}`);
      const monitoring = teamDashboard.data.dashboard.monitoring;
      console.log(`\n${teamId}:`);
      console.log(`  - Success Rate: ${monitoring.realTimeMetrics.successRate}%`);
      console.log(`  - Active Executions: ${monitoring.realTimeMetrics.activeExecutions}`);
      console.log(`  - Performance Trend: ${monitoring.historicalPerformance.performanceTrend}`);
    }

  } catch (error) {
    console.error('❌ Error in product launch demo:', error.message);
  }
}

/**
 * Demo: Business Goal Execution
 * This demonstrates executing a high-level business goal
 */
async function businessGoalDemo() {
  console.log('\n\n📊 Starting Business Goal Demo\n');

  try {
    // Execute a marketing campaign goal
    console.log('1️⃣ Executing marketing campaign goal...');
    const goalResponse = await api.post('/api/teams/execute-goal', {
      businessGoal: 'Create and launch a comprehensive Black Friday marketing campaign targeting enterprise customers',
      requirements: {
        capabilities: [
          'content-creation',
          'email-marketing',
          'seo',
          'analytics',
          'campaign-tracking',
          'a-b-testing'
        ],
        priority: 'high',
        deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 2 weeks
        budget: 25000
      }
    });

    const executionId = goalResponse.data.executionId;
    console.log(`Business goal execution started: ${executionId}\n`);

    // Monitor the specific execution
    console.log('2️⃣ Getting execution timeline...');
    setTimeout(async () => {
      const timelineResponse = await api.get(`/api/dashboard/workflows/${executionId}/timeline`);
      const timeline = timelineResponse.data.timeline;
      
      console.log(`Execution Status: ${timeline.execution.status}`);
      console.log(`Progress: ${timeline.execution.progress.percentage}%`);
      console.log(`Duration: ${timeline.execution.duration}ms`);
      
      if (timeline.bottlenecks && timeline.bottlenecks.length > 0) {
        console.log('\nBottlenecks detected:');
        timeline.bottlenecks.forEach(bottleneck => {
          console.log(`  - ${bottleneck.step}: ${bottleneck.duration}ms (${bottleneck.impact} impact)`);
        });
      }

      if (timeline.recommendations && timeline.recommendations.length > 0) {
        console.log('\nOptimization recommendations:');
        timeline.recommendations.forEach(rec => {
          console.log(`  - ${rec}`);
        });
      }
    }, 5000); // Check after 5 seconds

  } catch (error) {
    console.error('❌ Error in business goal demo:', error.message);
  }
}

/**
 * Demo: Real-time Dashboard Monitoring
 * This demonstrates WebSocket connections for real-time updates
 */
async function realtimeMonitoringDemo() {
  console.log('\n\n📡 Starting Real-time Monitoring Demo\n');

  // Connect to dashboard WebSocket
  const ws = new WebSocket(`${WS_URL}/ws/dashboard`);

  ws.on('open', () => {
    console.log('✅ Connected to dashboard WebSocket');

    // Subscribe to marketing team updates
    ws.send(JSON.stringify({
      type: 'subscribe-team',
      teamId: 'marketing-team'
    }));
    console.log('📊 Subscribed to marketing team updates');
  });

  ws.on('message', (data) => {
    const message = JSON.parse(data.toString());
    
    switch (message.type) {
      case 'initial-metrics':
        console.log('\n📈 Initial Dashboard Metrics:');
        console.log(`  - System Health: ${message.data.overview.systemHealth}`);
        console.log(`  - Total Teams: ${message.data.overview.totalTeams}`);
        console.log(`  - Active Executions: ${message.data.overview.activeExecutions}`);
        break;
        
      case 'team-update':
        console.log(`\n👥 Team Update for ${message.teamId}:`);
        console.log(`  - Active Executions: ${message.data.monitoring.realTimeMetrics.activeExecutions}`);
        console.log(`  - Success Rate: ${message.data.monitoring.realTimeMetrics.successRate}%`);
        break;
        
      case 'new-alert':
        console.log(`\n🚨 New Alert: ${message.data.severity.toUpperCase()}`);
        console.log(`  - ${message.data.message}`);
        console.log(`  - Action Required: ${message.data.actionRequired ? 'Yes' : 'No'}`);
        break;
        
      case 'metrics-update':
        console.log('\n📊 Metrics Updated');
        break;
    }
  });

  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error.message);
  });

  // Keep connection open for 30 seconds
  setTimeout(() => {
    ws.close();
    console.log('\n👋 Closing WebSocket connection');
  }, 30000);
}

/**
 * Demo: Team Performance Comparison
 * This demonstrates agent and team performance analysis
 */
async function performanceComparisonDemo() {
  console.log('\n\n📊 Starting Performance Comparison Demo\n');

  try {
    // Compare backend architecture agents
    console.log('1️⃣ Comparing backend architecture agents...');
    const comparisonResponse = await api.get('/api/dashboard/agents/comparison', {
      params: { agentType: 'backend-architecture' }
    });

    const comparison = comparisonResponse.data.comparison;
    console.log(`\nTop ${Math.min(3, comparison.comparisons.length)} Backend Architecture Agents:`);
    
    comparison.comparisons.slice(0, 3).forEach((agent, index) => {
      console.log(`\n${index + 1}. ${agent.agent.name}`);
      console.log(`   - Efficiency: ${agent.performance.efficiency}%`);
      console.log(`   - Tasks Completed: ${agent.performance.tasksCompleted}`);
      console.log(`   - Avg Response Time: ${agent.performance.averageResponseTime}ms`);
    });

    if (comparison.insights && comparison.insights.length > 0) {
      console.log('\nInsights:');
      comparison.insights.forEach(insight => {
        console.log(`  - ${insight}`);
      });
    }

    // Get system performance metrics
    console.log('\n2️⃣ Fetching system performance metrics...');
    const perfResponse = await api.get('/api/dashboard/performance');
    const performance = perfResponse.data.performance;

    console.log('\nSystem Performance:');
    console.log(`  Throughput:`);
    console.log(`    - Current: ${performance.throughput.current} tasks/hour`);
    console.log(`    - Average: ${performance.throughput.average} tasks/hour`);
    console.log(`    - Peak: ${performance.throughput.peak} tasks/hour`);
    console.log(`  Latency:`);
    console.log(`    - P50: ${performance.latency.p50}ms`);
    console.log(`    - P95: ${performance.latency.p95}ms`);
    console.log(`    - P99: ${performance.latency.p99}ms`);
    console.log(`  Error Rate: ${performance.errorRate.toFixed(2)}%`);

  } catch (error) {
    console.error('❌ Error in performance comparison demo:', error.message);
  }
}

/**
 * Helper function to monitor multiple executions
 */
async function monitorExecutions(executionIds: string[]) {
  const statuses = new Map();
  let allCompleted = false;
  let attempts = 0;
  const maxAttempts = 20; // 20 seconds max

  while (!allCompleted && attempts < maxAttempts) {
    attempts++;
    
    for (const executionId of executionIds) {
      try {
        const timelineResponse = await api.get(`/api/dashboard/workflows/${executionId}/timeline`);
        const status = timelineResponse.data.timeline.execution.status;
        const progress = timelineResponse.data.timeline.execution.progress.percentage;
        
        if (statuses.get(executionId) !== status) {
          console.log(`  Execution ${executionId}: ${status} (${progress}%)`);
          statuses.set(executionId, status);
        }
      } catch (error) {
        // Execution might not be ready yet
      }
    }

    allCompleted = Array.from(statuses.values()).every(
      status => status === 'completed' || status === 'failed'
    );

    if (!allCompleted) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
    }
  }

  if (allCompleted) {
    console.log('\n✅ All executions completed!');
  } else {
    console.log('\n⏱️ Monitoring timeout - executions still in progress');
  }
}

/**
 * Main demo runner
 */
async function runAllDemos() {
  console.log('🎯 Fine Print AI - Agent Team Orchestration Demo');
  console.log('================================================\n');

  // Run demos sequentially
  await productLaunchDemo();
  await businessGoalDemo();
  await performanceComparisonDemo();
  
  // Run real-time monitoring in parallel (it has its own timer)
  realtimeMonitoringDemo();
}

// Run the demos
if (require.main === module) {
  runAllDemos().catch(console.error);
}

export {
  productLaunchDemo,
  businessGoalDemo,
  realtimeMonitoringDemo,
  performanceComparisonDemo
};