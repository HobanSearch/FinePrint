import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';
import { randomString, randomItem } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// Custom metrics
const errorRate = new Rate('errors');
const documentAnalysisTime = new Trend('document_analysis_time');
const patternDetectionTime = new Trend('pattern_detection_time');
const apiCallDuration = new Trend('api_call_duration');
const successfulAnalyses = new Counter('successful_analyses');
const failedAnalyses = new Counter('failed_analyses');
const activeUsers = new Gauge('active_users');

// Test configuration
export const options = {
  scenarios: {
    // Smoke test
    smoke: {
      executor: 'constant-vus',
      vus: 1,
      duration: '1m',
      tags: { scenario: 'smoke' }
    },
    
    // Load test
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 50 },   // Ramp up to 50 users
        { duration: '5m', target: 50 },   // Stay at 50 users
        { duration: '2m', target: 100 },  // Ramp up to 100 users
        { duration: '5m', target: 100 },  // Stay at 100 users
        { duration: '2m', target: 0 }     // Ramp down to 0 users
      ],
      tags: { scenario: 'load' }
    },
    
    // Stress test
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 100 },  // Ramp up to 100 users
        { duration: '5m', target: 100 },  // Stay at 100 users
        { duration: '2m', target: 200 },  // Ramp up to 200 users
        { duration: '5m', target: 200 },  // Stay at 200 users
        { duration: '2m', target: 300 },  // Ramp up to 300 users
        { duration: '5m', target: 300 },  // Stay at 300 users
        { duration: '5m', target: 0 }     // Ramp down to 0 users
      ],
      tags: { scenario: 'stress' }
    },
    
    // Spike test
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 50 },   // Normal load
        { duration: '1m', target: 50 },    // Stay at normal
        { duration: '10s', target: 1000 }, // Spike to 1000 users
        { duration: '3m', target: 1000 },  // Stay at spike
        { duration: '10s', target: 50 },   // Scale down
        { duration: '3m', target: 50 },    // Stay at normal
        { duration: '10s', target: 0 }     // Ramp down
      ],
      tags: { scenario: 'spike' }
    },
    
    // Soak test
    soak: {
      executor: 'constant-vus',
      vus: 100,
      duration: '2h',
      tags: { scenario: 'soak' }
    },
    
    // Breakpoint test
    breakpoint: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 100,
      maxVUs: 1000,
      stages: [
        { duration: '10m', target: 1000 } // Ramp up to 1000 RPS
      ],
      tags: { scenario: 'breakpoint' }
    }
  },
  
  thresholds: {
    // HTTP thresholds
    http_req_duration: ['p(95)<500', 'p(99)<1000'], // 95% of requests under 500ms
    http_req_failed: ['rate<0.05'],                  // Error rate under 5%
    
    // Custom metric thresholds
    errors: ['rate<0.05'],
    document_analysis_time: ['p(95)<5000', 'p(99)<10000'],
    pattern_detection_time: ['p(95)<2000', 'p(99)<5000'],
    api_call_duration: ['p(95)<300', 'p(99)<500']
  },
  
  // Test abort conditions
  noConnectionReuse: false,
  userAgent: 'FinePrintAI-LoadTest/1.0',
  insecureSkipTLSVerify: true
};

// Test data
const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';
const API_KEY = __ENV.API_KEY || 'test-api-key';

const testDocuments = [
  {
    type: 'terms-of-service',
    content: generateSampleTOS(),
    size: 'small'
  },
  {
    type: 'privacy-policy',
    content: generateSamplePrivacyPolicy(),
    size: 'medium'
  },
  {
    type: 'eula',
    content: generateSampleEULA(),
    size: 'large'
  }
];

// Setup function
export function setup() {
  console.log('Setting up load test...');
  
  // Verify API is reachable
  const healthCheck = http.get(`${BASE_URL}/health`);
  check(healthCheck, {
    'API is reachable': (r) => r.status === 200
  });
  
  // Create test user accounts
  const users = [];
  for (let i = 0; i < 10; i++) {
    const user = createTestUser();
    users.push(user);
  }
  
  return { users };
}

// Main test function
export default function(data) {
  const user = randomItem(data.users);
  
  activeUsers.add(1);
  
  group('User Authentication', () => {
    const loginRes = http.post(
      `${BASE_URL}/auth/login`,
      JSON.stringify({
        email: user.email,
        password: user.password
      }),
      {
        headers: {
          'Content-Type': 'application/json'
        },
        tags: { name: 'login' }
      }
    );
    
    check(loginRes, {
      'Login successful': (r) => r.status === 200,
      'Auth token received': (r) => r.json('token') !== undefined
    });
    
    if (loginRes.status !== 200) {
      errorRate.add(1);
      failedAnalyses.add(1);
      return;
    }
    
    const authToken = loginRes.json('token');
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    };
    
    sleep(1); // Think time
    
    group('Document Analysis', () => {
      const document = randomItem(testDocuments);
      
      // Upload document
      const uploadStart = Date.now();
      const uploadRes = http.post(
        `${BASE_URL}/documents/upload`,
        JSON.stringify({
          name: `test-${randomString(8)}.txt`,
          content: document.content,
          type: document.type
        }),
        {
          headers,
          tags: { name: 'document_upload', document_type: document.type }
        }
      );
      
      check(uploadRes, {
        'Document uploaded': (r) => r.status === 201,
        'Document ID received': (r) => r.json('documentId') !== undefined
      });
      
      if (uploadRes.status !== 201) {
        errorRate.add(1);
        failedAnalyses.add(1);
        return;
      }
      
      const documentId = uploadRes.json('documentId');
      
      sleep(0.5);
      
      // Analyze document
      const analysisStart = Date.now();
      const analyzeRes = http.post(
        `${BASE_URL}/documents/${documentId}/analyze`,
        JSON.stringify({
          depth: 'full',
          patterns: ['all'],
          generateReport: true
        }),
        {
          headers,
          tags: { name: 'document_analysis', document_type: document.type }
        }
      );
      
      const analysisDuration = Date.now() - analysisStart;
      documentAnalysisTime.add(analysisDuration);
      
      check(analyzeRes, {
        'Analysis completed': (r) => r.status === 200,
        'Patterns detected': (r) => r.json('patterns') !== undefined,
        'Risk score calculated': (r) => r.json('riskScore') !== undefined,
        'Analysis time < 5s': (r) => analysisDuration < 5000
      });
      
      if (analyzeRes.status === 200) {
        successfulAnalyses.add(1);
        
        // Pattern detection metrics
        const patterns = analyzeRes.json('patterns');
        if (patterns && patterns.length > 0) {
          patternDetectionTime.add(analyzeRes.json('processingTime'));
        }
      } else {
        errorRate.add(1);
        failedAnalyses.add(1);
      }
      
      sleep(1);
      
      // Get analysis report
      const reportRes = http.get(
        `${BASE_URL}/documents/${documentId}/report`,
        {
          headers,
          tags: { name: 'get_report' }
        }
      );
      
      check(reportRes, {
        'Report retrieved': (r) => r.status === 200,
        'Report has recommendations': (r) => r.json('recommendations') !== undefined
      });
    });
    
    group('API Operations', () => {
      // Test various API endpoints
      const endpoints = [
        { method: 'GET', path: '/patterns', name: 'list_patterns' },
        { method: 'GET', path: '/models', name: 'list_models' },
        { method: 'GET', path: '/analytics/summary', name: 'analytics_summary' },
        { method: 'GET', path: '/user/documents', name: 'user_documents' }
      ];
      
      endpoints.forEach(endpoint => {
        const apiStart = Date.now();
        const res = http.request(
          endpoint.method,
          `${BASE_URL}${endpoint.path}`,
          null,
          {
            headers,
            tags: { name: endpoint.name }
          }
        );
        
        apiCallDuration.add(Date.now() - apiStart);
        
        check(res, {
          [`${endpoint.name} successful`]: (r) => r.status === 200
        });
        
        if (res.status !== 200) {
          errorRate.add(1);
        }
        
        sleep(0.5);
      });
    });
    
    group('Model Inference', () => {
      // Test model inference endpoints
      const inferenceReq = {
        text: 'This is a sample text for model inference testing.',
        model: 'phi-2',
        parameters: {
          temperature: 0.7,
          max_tokens: 100
        }
      };
      
      const inferenceRes = http.post(
        `${BASE_URL}/models/inference`,
        JSON.stringify(inferenceReq),
        {
          headers,
          tags: { name: 'model_inference' }
        }
      );
      
      check(inferenceRes, {
        'Inference successful': (r) => r.status === 200,
        'Response received': (r) => r.json('output') !== undefined,
        'Inference time < 2s': (r) => r.timings.duration < 2000
      });
      
      if (inferenceRes.status !== 200) {
        errorRate.add(1);
      }
    });
    
    // Simulate user think time
    sleep(randomIntBetween(2, 5));
  });
  
  activeUsers.add(-1);
}

// Teardown function
export function teardown(data) {
  console.log('Cleaning up load test...');
  
  // Clean up test users
  data.users.forEach(user => {
    // Delete test user
    http.del(`${BASE_URL}/users/${user.id}`, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`
      }
    });
  });
  
  console.log('Load test completed');
}

// Helper functions
function createTestUser() {
  const userId = randomString(8);
  return {
    id: userId,
    email: `loadtest-${userId}@example.com`,
    password: 'TestPassword123!',
    name: `Load Test User ${userId}`
  };
}

function generateSampleTOS() {
  return `
    Terms of Service
    
    1. Acceptance of Terms
    By using this service, you agree to these terms...
    
    2. User Responsibilities
    Users must comply with all applicable laws...
    
    3. Automatic Renewal
    This subscription will automatically renew unless cancelled...
    
    4. Data Collection
    We collect and process your personal data as described...
    
    5. Limitation of Liability
    We are not liable for any damages arising from...
    
    ${randomString(1000)}
  `;
}

function generateSamplePrivacyPolicy() {
  return `
    Privacy Policy
    
    1. Information We Collect
    We collect information you provide directly to us...
    
    2. How We Use Your Information
    We use the information we collect to provide services...
    
    3. Information Sharing
    We may share your information with third parties...
    
    4. Data Retention
    We retain your data for as long as necessary...
    
    5. Your Rights
    You have the right to access, update, and delete your data...
    
    ${randomString(2000)}
  `;
}

function generateSampleEULA() {
  return `
    End User License Agreement
    
    1. Grant of License
    We grant you a limited, non-exclusive license...
    
    2. Restrictions
    You may not reverse engineer, decompile, or disassemble...
    
    3. Intellectual Property
    All intellectual property rights remain with us...
    
    4. Termination
    We may terminate this agreement at any time...
    
    5. Governing Law
    This agreement is governed by the laws of...
    
    ${randomString(3000)}
  `;
}

function randomIntBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}