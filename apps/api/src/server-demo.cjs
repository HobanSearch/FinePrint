const http = require('http');
const { sampleDocuments, generateAnalysis } = require('./demo-data.cjs');

const PORT = process.env.PORT || 8000;
const HOST = '0.0.0.0';

// Store session data
const sessions = new Map();
const analyses = new Map();
let analysisCounter = 1;

// Helper to parse JSON body
const parseBody = (req) => {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
};

// Helper to parse multipart form data (simplified for demo)
const parseMultipart = (req) => {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      // For demo, just return a mock file
      resolve({
        filename: 'document.pdf',
        content: sampleDocuments.termsOfService
      });
    });
  });
};

// Comprehensive API server for demo
const server = http.createServer(async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = req.url;
  const method = req.method;

  // Health check
  if (url === '/health' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'healthy', 
      service: 'api',
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // Authentication endpoints
  if (url === '/auth/login' && method === 'POST') {
    const body = await parseBody(req);
    
    // Simple auth check
    if (body.email && body.password) {
      const token = 'demo-jwt-token-' + Date.now();
      const userId = 'user-' + Date.now();
      
      sessions.set(token, {
        userId,
        email: body.email,
        name: body.email.split('@')[0]
      });
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        token,
        user: {
          id: userId,
          email: body.email,
          name: body.email.split('@')[0]
        }
      }));
    } else {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid credentials' }));
    }
    return;
  }

  // Document upload endpoint
  if (url === '/documents/upload' && method === 'POST') {
    const file = await parseMultipart(req);
    const documentId = 'doc-' + Date.now();
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      documentId,
      filename: file.filename,
      size: file.content.length,
      uploadedAt: new Date().toISOString()
    }));
    return;
  }

  // Analysis endpoint - the main feature
  if (url === '/analysis' && method === 'POST') {
    const body = await parseBody(req);
    
    let textToAnalyze = '';
    let documentType = body.documentType || 'tos';
    
    // Handle different input types
    if (body.documentText || body.text) {
      textToAnalyze = body.documentText || body.text;
    } else if (body.documentUrl || body.url) {
      // For demo, use sample document based on URL
      if ((body.documentUrl || body.url).includes('privacy')) {
        textToAnalyze = sampleDocuments.privacyPolicy;
        documentType = 'privacy';
      } else {
        textToAnalyze = sampleDocuments.termsOfService;
      }
    } else {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No document provided for analysis' }));
      return;
    }
    
    // Generate analysis
    const analysisResult = generateAnalysis(textToAnalyze, documentType);
    const analysisId = 'analysis-' + Date.now();
    
    // Store analysis
    const analysisJob = {
      id: analysisId,
      status: 'completed',
      progress: 100,
      documentType,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      result: analysisResult
    };
    
    analyses.set(analysisId, analysisJob);
    
    // Return analysis result
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: analysisId,
      status: 'completed',
      riskScore: analysisResult.riskScore,
      findings: analysisResult.findings,
      summary: analysisResult.summary,
      recommendations: analysisResult.recommendations,
      totalClauses: analysisResult.totalClauses,
      problematicClauses: analysisResult.problematicClauses
    }));
    return;
  }

  // Get analysis by ID
  if (url.startsWith('/analysis/') && method === 'GET') {
    const analysisId = url.split('/')[2];
    const analysis = analyses.get(analysisId);
    
    if (analysis) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(analysis));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Analysis not found' }));
    }
    return;
  }

  // List analyses
  if (url === '/analysis' && method === 'GET') {
    const allAnalyses = Array.from(analyses.values()).reverse();
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      data: allAnalyses.slice(0, 10),
      total: allAnalyses.length,
      page: 1,
      pageSize: 10
    }));
    return;
  }

  // Documents list
  if (url.startsWith('/documents') && method === 'GET') {
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
          name: 'Privacy Policy - SocialApp',
          uploadedAt: new Date().toISOString(),
          status: 'analyzed',
          riskScore: 82
        },
        {
          id: '3',
          name: 'Software License - DevTool',
          uploadedAt: new Date().toISOString(),
          status: 'analyzed',
          riskScore: 45
        }
      ]
    }));
    return;
  }

  // Sample documents endpoint (for easy demo)
  if (url === '/samples' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      samples: [
        {
          name: 'Problematic Terms of Service',
          type: 'tos',
          text: sampleDocuments.termsOfService
        },
        {
          name: 'Concerning Privacy Policy',
          type: 'privacy',
          text: sampleDocuments.privacyPolicy
        },
        {
          name: 'Fair Software License',
          type: 'agreement',
          text: sampleDocuments.neutralDocument
        }
      ]
    }));
    return;
  }

  // Default response
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    service: 'Fine Print AI Demo API',
    version: '1.0.0',
    endpoints: [
      'GET /health',
      'POST /auth/login',
      'POST /analysis',
      'GET /analysis/:id',
      'GET /analysis',
      'POST /documents/upload',
      'GET /documents',
      'GET /samples'
    ],
    demo: true,
    message: 'Use /samples to get example documents for testing'
  }));
});

// WebSocket simulation via polling endpoint
let wsClients = new Map();

server.on('request', (req, res) => {
  if (req.url === '/ws/poll' && req.method === 'GET') {
    const clientId = req.headers['x-client-id'] || 'default';
    const events = wsClients.get(clientId) || [];
    wsClients.set(clientId, []);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ events }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`🚀 Fine Print AI Demo API server running at http://${HOST}:${PORT}`);
  console.log(`📝 Sample documents available at http://${HOST}:${PORT}/samples`);
  console.log(`🔍 Ready for demo recording!`);
});