import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const systemOverloadRate = new Rate('system_overload');
const responseTimeP99 = new Trend('response_time_p99');
const concurrentUsers = new Counter('concurrent_users');

// Stress test configuration - gradually increase load to breaking point
export const options = {
  stages: [
    { duration: '1m', target: 10 },    // Normal load
    { duration: '2m', target: 50 },    // Increased load
    { duration: '3m', target: 100 },   // High load
    { duration: '2m', target: 200 },   // Very high load
    { duration: '2m', target: 300 },   // Extreme load
    { duration: '1m', target: 400 },   // Breaking point
    { duration: '3m', target: 0 },     // Recovery
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // Relaxed threshold for stress test
    http_req_failed: ['rate<0.10'],    // Allow higher error rate
    system_overload: ['rate<0.30'],    // System overload rate below 30%
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

// Stress test user pool (larger than load test)
const stressTestUsers = Array.from({ length: 50 }, (_, i) => ({
  email: `stresstest${i + 1}@example.com`,
  password: 'password123'
}));

// Heavy documents for stress testing
const heavyDocuments = [
  {
    title: 'Heavy Contract Document',
    type: 'contract',
    content: `SOFTWARE LICENSE AGREEMENT - COMPREHENSIVE VERSION
    
This comprehensive Software License Agreement ("Agreement") contains extensive terms and conditions...
${'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(100)}

1. DEFINITIONS AND INTERPRETATION
${'Detailed definitions and interpretation clauses. '.repeat(50)}

2. GRANT OF LICENSE AND RESTRICTIONS
${'Comprehensive license terms and usage restrictions. '.repeat(75)}

3. INTELLECTUAL PROPERTY RIGHTS
${'Detailed intellectual property clauses and ownership rights. '.repeat(60)}

4. LIABILITY AND INDEMNIFICATION
${'Extensive liability exclusions and indemnification terms. '.repeat(80)}

5. TERMINATION AND CONSEQUENCES
${'Detailed termination procedures and post-termination obligations. '.repeat(40)}

6. DISPUTE RESOLUTION
${'Comprehensive dispute resolution and arbitration clauses. '.repeat(45)}

7. MISCELLANEOUS PROVISIONS
${'Various additional terms and conditions. '.repeat(30)}`
  },
  {
    title: 'Complex Privacy Policy',
    type: 'privacy-policy',
    content: `COMPREHENSIVE PRIVACY POLICY
    
This detailed privacy policy covers all aspects of data collection and processing...
${'Privacy policy content with extensive details. '.repeat(150)}

DATA COLLECTION PRACTICES
${'Detailed data collection procedures and methods. '.repeat(60)}

DATA USAGE AND PROCESSING
${'Comprehensive data usage and processing terms. '.repeat(70)}

THIRD PARTY SHARING
${'Detailed third party sharing policies and procedures. '.repeat(50)}

USER RIGHTS AND CONTROLS
${'Extensive user rights and control mechanisms. '.repeat(40)}

INTERNATIONAL TRANSFERS
${'Comprehensive international data transfer policies. '.repeat(35)}`
  }
];

function getRandomStressUser() {
  return stressTestUsers[Math.floor(Math.random() * stressTestUsers.length)];
}

function getRandomHeavyDocument() {
  return heavyDocuments[Math.floor(Math.random() * heavyDocuments.length)];
}

function authenticate(user) {
  const loginStart = Date.now();
  const loginRes = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify(user), {
    headers: { 'Content-Type': 'application/json' },
  });
  
  const authTime = Date.now() - loginStart;
  responseTimeP99.add(authTime);
  
  const success = check(loginRes, {
    'auth successful': (r) => r.status === 200,
  });
  
  if (loginRes.status >= 500) {
    systemOverloadRate.add(1);
  } else {
    systemOverloadRate.add(0);
  }
  
  return success ? loginRes.json('token') : null;
}

export default function () {
  concurrentUsers.add(1);
  const user = getRandomStressUser();
  
  group('Stress Test - Authentication Under Load', () => {
    const token = authenticate(user);
    if (!token) return;
    
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };
    
    group('Heavy Document Processing', () => {
      const document = getRandomHeavyDocument();
      const processStart = Date.now();
      
      // Create heavy document
      const createRes = http.post(
        `${BASE_URL}/api/documents`,
        JSON.stringify(document),
        { headers }
      );
      
      const createTime = Date.now() - processStart;
      responseTimeP99.add(createTime);
      
      const success = check(createRes, {
        'heavy document created': (r) => r.status === 200,
      });
      
      if (createRes.status >= 500) {
        systemOverloadRate.add(1);
      } else {
        systemOverloadRate.add(0);
      }
      
      if (success) {
        const documentId = createRes.json('id');
        
        // Start analysis on heavy document
        const analysisStart = Date.now();
        const analysisRes = http.post(
          `${BASE_URL}/api/analysis`,
          JSON.stringify({ documentId }),
          { headers }
        );
        
        const analysisCreateTime = Date.now() - analysisStart;
        responseTimeP99.add(analysisCreateTime);
        
        if (analysisRes.status >= 500) {
          systemOverloadRate.add(1);
        } else {
          systemOverloadRate.add(0);
        }
        
        // Don't wait for completion in stress test - just create load
        if (analysisRes.status === 200) {
          const analysisId = analysisRes.json('id');
          
          // Quick status check
          const statusStart = Date.now();
          const statusRes = http.get(`${BASE_URL}/api/analysis/${analysisId}`, { headers });
          responseTimeP99.add(Date.now() - statusStart);
          
          if (statusRes.status >= 500) {
            systemOverloadRate.add(1);
          } else {
            systemOverloadRate.add(0);
          }
        }
        
        // Clean up document
        const deleteStart = Date.now();
        const deleteRes = http.del(`${BASE_URL}/api/documents/${documentId}`, { headers });
        responseTimeP99.add(Date.now() - deleteStart);
        
        if (deleteRes.status >= 500) {
          systemOverloadRate.add(1);
        } else {
          systemOverloadRate.add(0);
        }
      }
    });
    
    group('Rapid API Calls', () => {
      // Make multiple rapid API calls to stress the system
      const rapidCalls = 5;
      
      for (let i = 0; i < rapidCalls; i++) {
        const callStart = Date.now();
        const res = http.get(`${BASE_URL}/api/documents`, { headers });
        responseTimeP99.add(Date.now() - callStart);
        
        if (res.status >= 500) {
          systemOverloadRate.add(1);
        } else {
          systemOverloadRate.add(0);
        }
        
        // Very short sleep to create burst load
        sleep(0.1);
      }
    });
  });
  
  // Minimal sleep to maintain high load
  sleep(Math.random() * 0.5);
}

export function setup() {
  console.log('Setting up stress test environment...');
  
  // Create stress test users in smaller batches to avoid overwhelming the system
  const batchSize = 10;
  const createdUsers = [];
  
  for (let i = 0; i < stressTestUsers.length; i += batchSize) {
    const batch = stressTestUsers.slice(i, i + batchSize);
    
    for (const user of batch) {
      const registerRes = http.post(
        `${BASE_URL}/api/auth/register`,
        JSON.stringify({
          ...user,
          firstName: 'Stress',
          lastName: 'Test'
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
      
      if (registerRes.status === 200 || registerRes.status === 409) {
        createdUsers.push(user);
      }
    }
    
    // Brief pause between batches
    sleep(0.5);
  }
  
  console.log(`Created ${createdUsers.length} stress test users`);
  return { users: createdUsers };
}

export function teardown(data) {
  console.log('Stress test teardown - cleaning up...');
  
  // Clean up in smaller batches to avoid post-test system overload
  const batchSize = 5;
  
  for (let i = 0; i < data.users.length; i += batchSize) {
    const batch = data.users.slice(i, i + batchSize);
    
    for (const user of batch) {
      const token = authenticate(user);
      if (token) {
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        };
        
        // Quick cleanup of user documents
        const documentsRes = http.get(`${BASE_URL}/api/documents`, { headers });
        if (documentsRes.status === 200) {
          const documents = documentsRes.json('documents') || [];
          for (const doc of documents.slice(0, 10)) { // Limit cleanup
            http.del(`${BASE_URL}/api/documents/${doc.id}`, { headers });
          }
        }
      }
    }
    
    sleep(0.5); // Brief pause between cleanup batches
  }
  
  console.log('Stress test cleanup complete');
}