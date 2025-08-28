import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const authFailureRate = new Rate('auth_failures');
const documentUploadTime = new Trend('document_upload_duration');
const analysisProcessingTime = new Trend('analysis_processing_duration');
const errorCounter = new Counter('errors');

// Test configuration
export const options = {
  stages: [
    { duration: '2m', target: 10 }, // Ramp up to 10 users over 2 minutes
    { duration: '5m', target: 10 }, // Stay at 10 users for 5 minutes
    { duration: '2m', target: 20 }, // Ramp up to 20 users over 2 minutes
    { duration: '5m', target: 20 }, // Stay at 20 users for 5 minutes
    { duration: '2m', target: 0 },  // Ramp down to 0 users over 2 minutes
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests must complete below 500ms
    http_req_failed: ['rate<0.05'],   // Error rate must be below 5%
    auth_failures: ['rate<0.01'],     // Auth failure rate must be below 1%
    document_upload_duration: ['p(95)<2000'], // 95% of uploads below 2s
    analysis_processing_duration: ['p(95)<10000'], // 95% of analyses below 10s
  },
};

// Base URL configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

// Test data
const testUsers = [
  { email: 'loadtest1@example.com', password: 'password123' },
  { email: 'loadtest2@example.com', password: 'password123' },
  { email: 'loadtest3@example.com', password: 'password123' },
  { email: 'loadtest4@example.com', password: 'password123' },
  { email: 'loadtest5@example.com', password: 'password123' },
];

const sampleDocuments = [
  {
    title: 'Load Test Contract 1',
    type: 'contract',
    content: `SOFTWARE LICENSE AGREEMENT
    
This Software License Agreement ("Agreement") is entered into between Company ("Licensor") and Customer ("Licensee").

1. GRANT OF LICENSE
Subject to the terms and conditions of this Agreement, Licensor hereby grants to Licensee a non-exclusive, non-transferable license to use the Software.

2. LIMITATIONS
Licensee shall not modify, distribute, or reverse engineer the Software.

3. LIABILITY
Company shall not be liable for any damages arising from use of the Software.

4. TERMINATION
This Agreement may be terminated by either party with 30 days written notice.`
  },
  {
    title: 'Load Test Privacy Policy',
    type: 'privacy-policy',
    content: `PRIVACY POLICY

This Privacy Policy describes how we collect, use, and disclose your personal information.

Information We Collect:
- Personal information you provide directly
- Usage information collected automatically
- Information from third parties

How We Use Information:
- To provide and improve our services
- To communicate with you
- For marketing purposes with your consent

Data Sharing:
We may share your information with service providers and as required by law.`
  },
  {
    title: 'Load Test Terms of Service',
    type: 'terms-of-service',
    content: `TERMS OF SERVICE

These Terms of Service govern your use of our service.

1. ACCEPTANCE OF TERMS
By using our service, you agree to these terms.

2. USE OF SERVICE
You may use our service for lawful purposes only.

3. USER ACCOUNTS
You are responsible for maintaining the security of your account.

4. PROHIBITED CONDUCT
You may not use our service for illegal activities.

5. TERMINATION
We may terminate your account for violation of these terms.`
  }
];

// Utility functions
function getRandomUser() {
  return testUsers[Math.floor(Math.random() * testUsers.length)];
}

function getRandomDocument() {
  return sampleDocuments[Math.floor(Math.random() * sampleDocuments.length)];
}

// Authentication helper
function authenticate(user) {
  const loginRes = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify(user), {
    headers: { 'Content-Type': 'application/json' },
  });
  
  const success = check(loginRes, {
    'login successful': (r) => r.status === 200,
    'login response has token': (r) => r.json('token') !== undefined,
  });
  
  if (!success) {
    authFailureRate.add(1);
    errorCounter.add(1);
    return null;
  }
  
  authFailureRate.add(0);
  return loginRes.json('token');
}

// Main test function
export default function () {
  const user = getRandomUser();
  
  group('Authentication', () => {
    const token = authenticate(user);
    if (!token) return;
    
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };
    
    group('Document Management', () => {
      // List documents
      const listRes = http.get(`${BASE_URL}/api/documents`, { headers });
      check(listRes, {
        'documents list retrieved': (r) => r.status === 200,
        'documents list is array': (r) => Array.isArray(r.json('documents')),
      });
      
      // Create document
      const document = getRandomDocument();
      const uploadStart = Date.now();
      
      const createRes = http.post(
        `${BASE_URL}/api/documents`,
        JSON.stringify(document),
        { headers }
      );
      
      const uploadSuccess = check(createRes, {
        'document created': (r) => r.status === 200,
        'document has id': (r) => r.json('id') !== undefined,
      });
      
      if (uploadSuccess) {
        documentUploadTime.add(Date.now() - uploadStart);
        const documentId = createRes.json('id');
        
        group('Document Analysis', () => {
          // Start analysis
          const analysisStart = Date.now();
          
          const analysisRes = http.post(
            `${BASE_URL}/api/analysis`,
            JSON.stringify({ documentId }),
            { headers }
          );
          
          const analysisCreated = check(analysisRes, {
            'analysis created': (r) => r.status === 200,
            'analysis has id': (r) => r.json('id') !== undefined,
          });
          
          if (analysisCreated) {
            const analysisId = analysisRes.json('id');
            
            // Poll for analysis completion
            let analysisComplete = false;
            let attempts = 0;
            const maxAttempts = 20; // 20 * 0.5s = 10s timeout
            
            while (!analysisComplete && attempts < maxAttempts) {
              sleep(0.5);
              attempts++;
              
              const statusRes = http.get(`${BASE_URL}/api/analysis/${analysisId}`, { headers });
              
              if (check(statusRes, { 'analysis status retrieved': (r) => r.status === 200 })) {
                const status = statusRes.json('status');
                
                if (status === 'completed') {
                  analysisComplete = true;
                  analysisProcessingTime.add(Date.now() - analysisStart);
                  
                  check(statusRes, {
                    'analysis has risk score': (r) => r.json('overallRiskScore') !== null,
                    'analysis has findings': (r) => Array.isArray(r.json('findings')),
                    'analysis has summary': (r) => r.json('executiveSummary') !== null,
                  });
                } else if (status === 'failed') {
                  errorCounter.add(1);
                  break;
                }
              }
            }
            
            if (!analysisComplete) {
              errorCounter.add(1);
              console.log(`Analysis ${analysisId} did not complete within timeout`);
            }
          }
        });
        
        // Clean up - delete document
        const deleteRes = http.del(`${BASE_URL}/api/documents/${documentId}`, { headers });
        check(deleteRes, {
          'document deleted': (r) => r.status === 200,
        });
      } else {
        errorCounter.add(1);
      }
    });
    
    group('User Profile', () => {
      // Get user profile
      const profileRes = http.get(`${BASE_URL}/api/users/me`, { headers });
      check(profileRes, {
        'profile retrieved': (r) => r.status === 200,
        'profile has email': (r) => r.json('email') !== undefined,
      });
      
      // Update profile
      const updateRes = http.put(
        `${BASE_URL}/api/users/me`,
        JSON.stringify({ firstName: 'LoadTest' }),
        { headers }
      );
      check(updateRes, {
        'profile updated': (r) => r.status === 200,
      });
    });
  });
  
  // Random sleep between 1-3 seconds to simulate user behavior
  sleep(Math.random() * 2 + 1);
}

// Setup function to create test users
export function setup() {
  console.log('Setting up load test users...');
  
  const createdUsers = [];
  
  for (const user of testUsers) {
    const registerRes = http.post(
      `${BASE_URL}/api/auth/register`,
      JSON.stringify({
        ...user,
        firstName: 'Load',
        lastName: 'Test'
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
    
    if (registerRes.status === 200 || registerRes.status === 409) {
      // 409 means user already exists, which is fine
      createdUsers.push(user);
    } else {
      console.log(`Failed to create user ${user.email}: ${registerRes.status}`);
    }
  }
  
  console.log(`Created ${createdUsers.length} test users`);
  return { users: createdUsers };
}

// Teardown function to clean up test users
export function teardown(data) {
  console.log('Cleaning up load test users...');
  
  for (const user of data.users) {
    const token = authenticate(user);
    if (token) {
      // Delete user's documents
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      };
      
      const documentsRes = http.get(`${BASE_URL}/api/documents`, { headers });
      if (documentsRes.status === 200) {
        const documents = documentsRes.json('documents');
        for (const doc of documents) {
          http.del(`${BASE_URL}/api/documents/${doc.id}`, { headers });
        }
      }
    }
  }
  
  console.log('Load test cleanup complete');
}