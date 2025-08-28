import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics for spike test
const spikeRecoveryTime = new Trend('spike_recovery_time');
const systemAvailability = new Rate('system_availability');
const errorSpike = new Counter('error_spike');

// Spike test configuration - sudden load spikes
export const options = {
  stages: [
    { duration: '30s', target: 5 },    // Baseline
    { duration: '10s', target: 100 },  // Sudden spike!
    { duration: '30s', target: 100 },  // Sustain spike
    { duration: '10s', target: 5 },    // Drop back to baseline
    { duration: '30s', target: 5 },    // Recovery period
    { duration: '10s', target: 200 },  // Even bigger spike!
    { duration: '20s', target: 200 },  // Sustain bigger spike
    { duration: '10s', target: 5 },    // Drop back again
    { duration: '1m', target: 5 },     // Extended recovery
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'], // More lenient for spikes
    http_req_failed: ['rate<0.15'],    // Allow higher error rate during spikes
    system_availability: ['rate>0.85'], // System should be available 85% of time
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

// Smaller user pool for spike test focus
const spikeTestUsers = Array.from({ length: 20 }, (_, i) => ({
  email: `spiketest${i + 1}@example.com`,
  password: 'password123'
}));

// Quick operations document for spike testing
const quickDocument = {
  title: 'Spike Test Document',
  type: 'contract',
  content: `QUICK CONTRACT FOR SPIKE TESTING
  
This is a minimal contract document designed for rapid processing during spike tests.

1. LICENSE: User is granted a license to use the software.
2. RESTRICTIONS: No reverse engineering allowed.
3. LIABILITY: Limited liability for the provider.
4. TERMINATION: Can be terminated with notice.

This document is intentionally brief to minimize processing time during load spikes.`
};

function getRandomSpikeUser() {
  return spikeTestUsers[Math.floor(Math.random() * spikeTestUsers.length)];
}

function authenticate(user) {
  const authStart = Date.now();
  const loginRes = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify(user), {
    headers: { 'Content-Type': 'application/json' },
  });
  
  const isAvailable = loginRes.status < 500;
  systemAvailability.add(isAvailable ? 1 : 0);
  
  if (!isAvailable) {
    errorSpike.add(1);
    return null;
  }
  
  const success = check(loginRes, {
    'spike auth successful': (r) => r.status === 200,
  });
  
  return success ? loginRes.json('token') : null;
}

export default function () {
  const user = getRandomSpikeUser();
  
  group('Spike Test - System Response to Traffic Spikes', () => {
    const recoveryStart = Date.now();
    const token = authenticate(user);
    
    if (!token) {
      errorSpike.add(1);
      return;
    }
    
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };
    
    group('Quick Operations During Spike', () => {
      // Perform minimal operations to test system responsiveness
      
      // Quick document list
      const listStart = Date.now();
      const listRes = http.get(`${BASE_URL}/api/documents`, { headers });
      
      const listAvailable = listRes.status < 500;
      systemAvailability.add(listAvailable ? 1 : 0);
      
      if (!listAvailable) {
        errorSpike.add(1);
      }
      
      // Quick document creation
      const createStart = Date.now();
      const createRes = http.post(
        `${BASE_URL}/api/documents`,
        JSON.stringify(quickDocument),
        { headers }
      );
      
      const createAvailable = createRes.status < 500;
      systemAvailability.add(createAvailable ? 1 : 0);
      
      if (createAvailable && createRes.status === 200) {
        const documentId = createRes.json('id');
        
        // Quick analysis start (don't wait for completion)
        const analysisRes = http.post(
          `${BASE_URL}/api/analysis`,
          JSON.stringify({ documentId }),
          { headers }
        );
        
        const analysisAvailable = analysisRes.status < 500;
        systemAvailability.add(analysisAvailable ? 1 : 0);
        
        if (!analysisAvailable) {
          errorSpike.add(1);
        }
        
        // Quick cleanup
        const deleteRes = http.del(`${BASE_URL}/api/documents/${documentId}`, { headers });
        const deleteAvailable = deleteRes.status < 500;
        systemAvailability.add(deleteAvailable ? 1 : 0);
        
        if (!deleteAvailable) {
          errorSpike.add(1);
        }
        
        // Record recovery time if operations were successful
        if (listAvailable && createAvailable && analysisAvailable && deleteAvailable) {
          spikeRecoveryTime.add(Date.now() - recoveryStart);
        }
      } else {
        errorSpike.add(1);
      }
    });
    
    group('System Health Check During Spike', () => {
      // Quick health check
      const healthRes = http.get(`${BASE_URL}/health`);
      const healthAvailable = healthRes.status === 200;
      systemAvailability.add(healthAvailable ? 1 : 0);
      
      if (!healthAvailable) {
        errorSpike.add(1);
      }
      
      check(healthRes, {
        'health check responsive during spike': (r) => r.status === 200,
        'health check responds quickly': (r) => r.timings.duration < 1000,
      });
    });
    
    group('User Profile Quick Access', () => {
      // Test if user operations still work during spike
      const profileRes = http.get(`${BASE_URL}/api/users/me`, { headers });
      const profileAvailable = profileRes.status < 500;
      systemAvailability.add(profileAvailable ? 1 : 0);
      
      if (!profileAvailable) {
        errorSpike.add(1);
      }
      
      check(profileRes, {
        'profile accessible during spike': (r) => r.status === 200,
      });
    });
  });
  
  // Minimal sleep to maintain spike intensity
  sleep(Math.random() * 0.2);
}

export function setup() {
  console.log('Setting up spike test environment...');
  
  const createdUsers = [];
  
  // Create users quickly for spike test
  for (const user of spikeTestUsers) {
    const registerRes = http.post(
      `${BASE_URL}/api/auth/register`,
      JSON.stringify({
        ...user,
        firstName: 'Spike',
        lastName: 'Test'
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
    
    if (registerRes.status === 200 || registerRes.status === 409) {
      createdUsers.push(user);
    }
  }
  
  console.log(`Created ${createdUsers.length} spike test users`);
  
  // Wait a moment for system to stabilize before test
  sleep(2);
  
  return { users: createdUsers };
}

export function teardown(data) {
  console.log('Spike test teardown - quick cleanup...');
  
  // Rapid cleanup after spike test
  for (const user of data.users.slice(0, 10)) { // Limit cleanup to avoid post-test spike
    const token = authenticate(user);
    if (token) {
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      };
      
      // Quick document cleanup
      const documentsRes = http.get(`${BASE_URL}/api/documents`, { headers });
      if (documentsRes.status === 200) {
        const documents = documentsRes.json('documents') || [];
        for (const doc of documents.slice(0, 5)) { // Limit to 5 documents per user
          http.del(`${BASE_URL}/api/documents/${doc.id}`, { headers });
        }
      }
    }
  }
  
  console.log('Spike test cleanup complete');
}