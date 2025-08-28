const http = require('http');

const PORT = process.env.PORT || 8000;
const HOST = '0.0.0.0';

// Simple mock API server for frontend testing
const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', service: 'api' }));
  } else if (req.url === '/api/auth/login' && req.method === 'POST') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      token: 'mock-jwt-token',
      user: { id: '1', email: 'user@example.com', name: 'Test User' }
    }));
  } else if (req.url === '/api/analysis' && req.method === 'POST') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: 'analysis-' + Date.now(),
      status: 'completed',
      riskScore: 75,
      findings: [
        {
          id: '1',
          type: 'automatic_renewal',
          severity: 'high',
          title: 'Automatic Renewal',
          description: 'This agreement automatically renews unless cancelled 30 days before expiration.',
          location: 'Section 4.2'
        },
        {
          id: '2',
          type: 'data_sharing',
          severity: 'medium',
          title: 'Third-Party Data Sharing',
          description: 'Your data may be shared with third-party partners for marketing purposes.',
          location: 'Section 8.1'
        },
        {
          id: '3',
          type: 'liability_limitation',
          severity: 'low',
          title: 'Limited Liability',
          description: 'The service provider limits liability to the amount paid in the last 12 months.',
          location: 'Section 12.3'
        }
      ],
      summary: 'This document contains several concerning clauses including automatic renewal and broad data sharing permissions.'
    }));
  } else if (req.url.startsWith('/api/documents')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      documents: [
        {
          id: '1',
          name: 'Terms of Service - Example.com',
          uploadedAt: new Date().toISOString(),
          status: 'analyzed',
          riskScore: 75
        },
        {
          id: '2',
          name: 'Privacy Policy - TestApp',
          uploadedAt: new Date().toISOString(),
          status: 'analyzed',
          riskScore: 60
        }
      ]
    }));
  } else {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      service: 'Fine Print AI API',
      version: '1.0.0',
      endpoints: ['/health', '/api/auth/login', '/api/analysis', '/api/documents']
    }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Simple API server listening on http://${HOST}:${PORT}`);
});