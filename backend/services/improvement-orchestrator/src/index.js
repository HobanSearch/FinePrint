const http = require('http');

const PORT = process.env.PORT || 3010;
const HOST = process.env.HOST || '0.0.0.0';

const server = http.createServer((req, res) => {
  if (req.url === '/api/health' || req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', service: 'improvement-orchestrator' }));
  } else if (req.url === '/api/workflows') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      workflows: [
        { id: 'wf-1', name: 'Model Improvement', status: 'active' },
        { id: 'wf-2', name: 'Content Optimization', status: 'active' },
        { id: 'wf-3', name: 'Feedback Processing', status: 'active' }
      ]
    }));
  } else if (req.url === '/api/improvements') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      improvements: [
        { id: 'imp-1', type: 'model', status: 'pending', confidence: 0.8 },
        { id: 'imp-2', type: 'content', status: 'applied', confidence: 0.9 }
      ]
    }));
  } else {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      service: 'improvement-orchestrator',
      version: '1.0.0',
      status: 'running',
      orchestrator: 'temporal',
      activeWorkflows: 3
    }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Improvement Orchestrator service listening on http://${HOST}:${PORT}`);
});