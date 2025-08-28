/**
 * Comprehensive Load Testing Suite with k6
 * Tests performance, scalability, and reliability under various load conditions
 */

import http from 'k6/http';
import ws from 'k6/ws';
import { check, group, sleep, fail } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';
import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

// Custom metrics for detailed performance tracking
const authFailureRate = new Rate('auth_failures');
const documentUploadTime = new Trend('document_upload_duration');
const analysisProcessingTime = new Trend('analysis_processing_duration');
const websocketConnectionTime = new Trend('websocket_connection_duration');
const apiResponseTime = new Trend('api_response_time');
const errorCounter = new Counter('errors_total');
const activeUsers = new Gauge('active_users');
const systemResourceUsage = new Gauge('system_resource_usage');
const analysisAccuracy = new Rate('analysis_accuracy');

// Test configuration based on environment
const TEST_ENVIRONMENTS = {
  smoke: {
    stages: [
      { duration: '1m', target: 1 },
    ],
    thresholds: {
      http_req_duration: ['p(95)<1000'],
      http_req_failed: ['rate<0.1'],
    },
  },
  load: {
    stages: [
      { duration: '2m', target: 10 },
      { duration: '5m', target: 10 },
      { duration: '2m', target: 20 },
      { duration: '5m', target: 20 },
      { duration: '2m', target: 0 },
    ],
    thresholds: {
      http_req_duration: ['p(95)<500'],
      http_req_failed: ['rate<0.05'],
      auth_failures: ['rate<0.01'],
      document_upload_duration: ['p(95)<2000'],
      analysis_processing_duration: ['p(95)<10000'],
    },
  },
  stress: {
    stages: [
      { duration: '2m', target: 10 },
      { duration: '5m', target: 10 },
      { duration: '2m', target: 20 },
      { duration: '5m', target: 20 },
      { duration: '2m', target: 50 },
      { duration: '5m', target: 50 },
      { duration: '2m', target: 100 },
      { duration: '5m', target: 100 },
      { duration: '10m', target: 0 },
    ],
    thresholds: {
      http_req_duration: ['p(95)<1000'],
      http_req_failed: ['rate<0.1'],
      errors_total: ['count<100'],
    },
  },
  spike: {
    stages: [
      { duration: '10s', target: 100 },
      { duration: '1m', target: 100 },
      { duration: '10s', target: 1400 },
      { duration: '3m', target: 1400 },
      { duration: '10s', target: 100 },
      { duration: '3m', target: 100 },
      { duration: '10s', target: 0 },
    ],
    thresholds: {
      http_req_duration: ['p(95)<2000'],
      http_req_failed: ['rate<0.15'],
    },
  },
  volume: {
    stages: [
      { duration: '2m', target: 50 },
      { duration: '10m', target: 100 },
      { duration: '20m', target: 200 },
      { duration: '10m', target: 100 },
      { duration: '2m', target: 0 },
    ],
    thresholds: {
      http_req_duration: ['p(95)<800'],
      http_req_failed: ['rate<0.08'],
    },
  },
};

// Get test configuration from environment
const TEST_TYPE = __ENV.TEST_TYPE || 'load';
const config = TEST_ENVIRONMENTS[TEST_TYPE];

export const options = {
  ...config,
  ext: {
    loadimpact: {
      projectID: 3599339,
      name: `Fine Print AI - ${TEST_TYPE.toUpperCase()} Test`,
    },
  },
};

// Base configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const WS_URL = __ENV.WS_URL || 'ws://localhost:3002';
const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || 'admin-test-token';

// Test data pools
const testUsers = [];
const testDocuments = [];
const sampleDocuments = [
  {
    title: 'Terms of Service',
    type: 'terms-of-service',
    content: `TERMS OF SERVICE
1. ACCEPTANCE OF TERMS
By using our service, you agree to these terms.

2. USER DATA
We collect and use your personal information as described in our Privacy Policy.

3. LIABILITY
We are not liable for any damages arising from your use of the service.

4. TERMINATION
We may terminate your account at any time for any reason.

5. DISPUTE RESOLUTION
All disputes will be resolved through binding arbitration.

6. CHANGES TO TERMS
We may modify these terms at any time without notice.`,
  },
  {
    title: 'Privacy Policy',
    type: 'privacy-policy',
    content: `PRIVACY POLICY
We collect personal information when you use our services.

INFORMATION WE COLLECT:
- Personal information you provide
- Usage information
- Device information
- Location data

HOW WE USE INFORMATION:
- To provide services
- For marketing purposes
- To improve our products
- To share with third parties

DATA RETENTION:
We retain your information indefinitely.

CONTACT:
For questions, contact privacy@company.com`,
  },
  {
    title: 'Software License',
    type: 'software-license',
    content: `SOFTWARE LICENSE AGREEMENT
1. LICENSE GRANT
We grant you a limited license to use the software.

2. RESTRICTIONS
You may not reverse engineer or redistribute the software.

3. UPDATES
We may automatically update the software.

4. NO WARRANTIES
The software is provided "as is" without warranties.

5. LIMITATION OF LIABILITY
Our liability is limited to the amount you paid.

6. TERMINATION
This license terminates if you breach the terms.`,
  },
];

// Utility functions
function getRandomUser() {
  return testUsers[Math.floor(Math.random() * testUsers.length)];
}

function getRandomDocument() {
  return sampleDocuments[Math.floor(Math.random() * sampleDocuments.length)];
}

function generateUser(index) {
  return {
    email: `loadtest${index}@fineprintai.com`,
    password: 'LoadTest123!',
    firstName: `LoadTest${index}`,
    lastName: 'User',
  };
}

// Authentication helper
function authenticate(user) {
  const startTime = Date.now();
  
  const loginRes = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify(user), {
    headers: { 'Content-Type': 'application/json' },
    tags: { endpoint: 'auth-login' },
  });
  
  const duration = Date.now() - startTime;
  apiResponseTime.add(duration, { endpoint: 'auth-login' });
  
  const success = check(loginRes, {
    'login successful': (r) => r.status === 200,
    'login response has token': (r) => r.json('token') !== undefined,
    'login response time acceptable': (r) => r.timings.duration < 1000,
  });
  
  if (!success) {
    authFailureRate.add(1);
    errorCounter.add(1, { type: 'auth-failure' });
    return null;
  }
  
  authFailureRate.add(0);
  return loginRes.json('token');
}

// Document operations
function uploadDocument(token, document) {
  const startTime = Date.now();
  
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
  
  const response = http.post(`${BASE_URL}/api/documents`, JSON.stringify(document), {
    headers,
    tags: { endpoint: 'document-upload' },
  });
  
  const duration = Date.now() - startTime;
  documentUploadTime.add(duration);
  apiResponseTime.add(duration, { endpoint: 'document-upload' });
  
  const success = check(response, {
    'document uploaded': (r) => r.status === 200,
    'document has id': (r) => r.json('id') !== undefined,
    'upload time acceptable': (r) => duration < 3000,
  });
  
  if (!success) {
    errorCounter.add(1, { type: 'document-upload-failure' });
    return null;
  }
  
  return response.json();
}

function startAnalysis(token, documentId) {
  const startTime = Date.now();
  
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
  
  const response = http.post(`${BASE_URL}/api/analysis`, JSON.stringify({ documentId }), {
    headers,
    tags: { endpoint: 'analysis-start' },
  });
  
  const duration = Date.now() - startTime;
  apiResponseTime.add(duration, { endpoint: 'analysis-start' });
  
  const success = check(response, {
    'analysis started': (r) => r.status === 200,
    'analysis has id': (r) => r.json('id') !== undefined,
  });
  
  if (!success) {
    errorCounter.add(1, { type: 'analysis-start-failure' });
    return null;
  }
  
  return response.json();
}

function waitForAnalysisCompletion(token, analysisId) {
  const startTime = Date.now();
  const maxAttempts = 30; // 30 * 1s = 30s timeout
  let attempts = 0;
  
  const headers = {
    'Authorization': `Bearer ${token}`,
  };
  
  while (attempts < maxAttempts) {
    sleep(1);
    attempts++;
    
    const response = http.get(`${BASE_URL}/api/analysis/${analysisId}`, {
      headers,
      tags: { endpoint: 'analysis-status' },
    });
    
    if (check(response, { 'status check successful': (r) => r.status === 200 })) {
      const analysis = response.json();
      
      if (analysis.status === 'completed') {
        const totalDuration = Date.now() - startTime;
        analysisProcessingTime.add(totalDuration);
        
        // Check analysis quality
        const qualityCheck = check(analysis, {
          'has risk score': (a) => a.overallRiskScore !== null && a.overallRiskScore >= 0,
          'has findings': (a) => Array.isArray(a.findings),
          'has summary': (a) => a.executiveSummary && a.executiveSummary.length > 0,
          'risk score valid': (a) => a.overallRiskScore <= 100,
        });
        
        analysisAccuracy.add(qualityCheck ? 1 : 0);
        
        return analysis;
      } else if (analysis.status === 'failed') {
        errorCounter.add(1, { type: 'analysis-processing-failure' });
        break;
      }
    } else {
      errorCounter.add(1, { type: 'analysis-status-check-failure' });
      break;
    }
  }
  
  // Timeout
  errorCounter.add(1, { type: 'analysis-timeout' });
  return null;
}

// WebSocket testing
function testWebSocketConnection(token) {
  const startTime = Date.now();
  
  const url = `${WS_URL}/ws?token=${token}`;
  const res = ws.connect(url, {
    tags: { endpoint: 'websocket' },
  }, function (socket) {
    const connectionTime = Date.now() - startTime;
    websocketConnectionTime.add(connectionTime);
    
    socket.on('open', () => {
      check(null, {
        'websocket connected': () => true,
        'connection time acceptable': () => connectionTime < 2000,
      });
    });
    
    socket.on('message', (data) => {
      const message = JSON.parse(data);
      check(message, {
        'message has valid structure': (m) => m.type !== undefined,
        'message has data': (m) => m.data !== undefined,
      });
    });
    
    socket.on('error', (e) => {
      errorCounter.add(1, { type: 'websocket-error' });
    });
    
    // Send a test message
    socket.send(JSON.stringify({
      type: 'ping',
      timestamp: Date.now(),
    }));
    
    // Keep connection alive for a bit
    sleep(Math.random() * 5 + 2);
    
    socket.close();
  });
  
  check(res, {
    'websocket connection established': (r) => r && r.url !== '',
  });
}

// API health check
function healthCheck() {
  const response = http.get(`${BASE_URL}/api/health`, {
    tags: { endpoint: 'health' },
  });
  
  const healthy = check(response, {
    'service is healthy': (r) => r.status === 200,
    'health check fast': (r) => r.timings.duration < 200,
  });
  
  if (!healthy) {
    errorCounter.add(1, { type: 'health-check-failure' });
  }
  
  return healthy;
}

// Main test scenario
export default function () {
  // Update active users metric
  activeUsers.add(1);
  
  // Health check at start
  if (!healthCheck()) {
    fail('System health check failed');
  }
  
  const user = getRandomUser();
  if (!user) {
    fail('No test users available');
  }
  
  group('Authentication Flow', () => {
    const token = authenticate(user);
    if (!token) {
      fail('Authentication failed');
    }
    
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };
    
    group('Document Management', () => {
      // List existing documents
      const listResponse = http.get(`${BASE_URL}/api/documents`, {
        headers,
        tags: { endpoint: 'document-list' },
      });
      
      check(listResponse, {
        'documents retrieved': (r) => r.status === 200,
        'response has pagination': (r) => r.json('total') !== undefined,
      });
      
      // Upload a new document
      const document = getRandomDocument();
      const uploadedDoc = uploadDocument(token, document);
      
      if (uploadedDoc) {
        group('Document Analysis', () => {
          const analysis = startAnalysis(token, uploadedDoc.id);
          
          if (analysis) {
            const completedAnalysis = waitForAnalysisCompletion(token, analysis.id);
            
            if (completedAnalysis) {
              // Get analysis results
              const resultsResponse = http.get(`${BASE_URL}/api/analysis/${analysis.id}`, {
                headers,
                tags: { endpoint: 'analysis-results' },
              });
              
              check(resultsResponse, {
                'analysis results retrieved': (r) => r.status === 200,
                'results have findings': (r) => Array.isArray(r.json('findings')),
                'results have risk score': (r) => r.json('overallRiskScore') !== null,
              });
            }
          }
        });
        
        // Clean up - delete the document
        const deleteResponse = http.del(`${BASE_URL}/api/documents/${uploadedDoc.id}`, {
          headers,
          tags: { endpoint: 'document-delete' },
        });
        
        check(deleteResponse, {
          'document deleted': (r) => r.status === 200,
        });
      }
    });
    
    group('User Management', () => {
      // Get user profile
      const profileResponse = http.get(`${BASE_URL}/api/users/me`, {
        headers,
        tags: { endpoint: 'user-profile' },
      });
      
      check(profileResponse, {
        'profile retrieved': (r) => r.status === 200,
        'profile has email': (r) => r.json('email') !== undefined,
      });
      
      // Update preferences
      const prefsResponse = http.put(`${BASE_URL}/api/users/me/preferences`, 
        JSON.stringify({ theme: 'dark', notifications: true }), {
        headers,
        tags: { endpoint: 'user-preferences' },
      });
      
      check(prefsResponse, {
        'preferences updated': (r) => r.status === 200,
      });
    });
    
    group('Billing & Usage', () => {
      // Check current usage
      const usageResponse = http.get(`${BASE_URL}/api/billing/usage`, {
        headers,
        tags: { endpoint: 'billing-usage' },
      });
      
      check(usageResponse, {
        'usage retrieved': (r) => r.status === 200,
        'usage has breakdown': (r) => r.json('breakdown') !== undefined,
      });
      
      // Check subscription status
      const subscriptionResponse = http.get(`${BASE_URL}/api/billing/subscription`, {
        headers,
        tags: { endpoint: 'billing-subscription' },
      });
      
      check(subscriptionResponse, {
        'subscription status retrieved': (r) => r.status === 200,
      });
    });
    
    group('Notifications', () => {
      // Get notifications
      const notificationsResponse = http.get(`${BASE_URL}/api/notifications`, {
        headers,
        tags: { endpoint: 'notifications' },
      });
      
      check(notificationsResponse, {
        'notifications retrieved': (r) => r.status === 200,
        'has unread count': (r) => r.json('unreadCount') !== undefined,
      });
    });
    
    // Test WebSocket connection occasionally
    if (Math.random() < 0.3) { // 30% of users test WebSocket
      group('Real-time Communication', () => {
        testWebSocketConnection(token);
      });
    }
  });
  
  // Simulate user think time
  sleep(Math.random() * 3 + 1); // 1-4 seconds
  
  activeUsers.add(-1);
}

// Setup function - create test users
export function setup() {
  console.log(`Setting up ${TEST_TYPE} test with ${options.stages?.length || 1} stages...`);
  
  const userCount = Math.max(50, (options.stages?.reduce((max, stage) => 
    Math.max(max, stage.target || 0), 0) || 10) * 2);
  
  console.log(`Creating ${userCount} test users...`);
  
  for (let i = 0; i < userCount; i++) {
    const user = generateUser(i);
    
    const registerResponse = http.post(`${BASE_URL}/api/auth/register`, JSON.stringify(user), {
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (registerResponse.status === 200 || registerResponse.status === 409) {
      testUsers.push(user);
    } else {
      console.warn(`Failed to create user ${user.email}: ${registerResponse.status}`);
    }
  }
  
  console.log(`Successfully set up ${testUsers.length} test users`);
  
  // Warm up the system
  console.log('Warming up system...');
  const warmupUser = testUsers[0] || generateUser(0);
  const token = authenticate(warmupUser);
  
  if (token) {
    // Make a few warm-up requests
    const warmupRequests = [
      `${BASE_URL}/api/health`,
      `${BASE_URL}/api/users/me`,
      `${BASE_URL}/api/documents`,
    ];
    
    warmupRequests.forEach(url => {
      http.get(url, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
    });
  }
  
  console.log('Setup complete');
  
  return {
    userCount: testUsers.length,
    testType: TEST_TYPE,
    baseUrl: BASE_URL,
  };
}

// Teardown function - cleanup
export function teardown(data) {
  console.log(`Cleaning up ${TEST_TYPE} test...`);
  
  // Clean up test data (documents, analyses, etc.)
  const cleanupUsers = testUsers.slice(0, Math.min(10, testUsers.length)); // Clean up first 10 users
  
  cleanupUsers.forEach(user => {
    const token = authenticate(user);
    if (token) {
      const headers = { 'Authorization': `Bearer ${token}` };
      
      // Delete user's documents
      const documentsResponse = http.get(`${BASE_URL}/api/documents`, { headers });
      if (documentsResponse.status === 200) {
        const documents = documentsResponse.json('documents') || [];
        documents.forEach(doc => {
          http.del(`${BASE_URL}/api/documents/${doc.id}`, { headers });
        });
      }
    }
  });
  
  console.log('Teardown complete');
}

// Custom report generation
export function handleSummary(data) {
  const summary = {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
    [`reports/load-test-${TEST_TYPE}-${Date.now()}.html`]: htmlReport(data),
    [`reports/load-test-${TEST_TYPE}-${Date.now()}.json`]: JSON.stringify(data, null, 2),
  };
  
  // Add custom metrics to summary
  const customMetrics = {
    test_type: TEST_TYPE,
    base_url: BASE_URL,
    total_requests: data.metrics.http_reqs?.count || 0,
    error_rate: data.metrics.http_req_failed?.rate || 0,
    avg_response_time: data.metrics.http_req_duration?.avg || 0,
    p95_response_time: data.metrics.http_req_duration?.p95 || 0,
    analysis_accuracy: data.metrics.analysis_accuracy?.rate || 0,
    system_health: data.metrics.errors_total?.count < 100 ? 'good' : 'poor',
  };
  
  summary[`reports/metrics-${TEST_TYPE}-${Date.now()}.json`] = JSON.stringify(customMetrics, null, 2);
  
  return summary;
}