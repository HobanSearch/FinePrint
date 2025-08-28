const http = require('http');

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', service: 'business-agents' }));
  } else if (req.url === '/api/agents') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      agents: [
        { id: 'marketing', name: 'Marketing Agent', status: 'ready' },
        { id: 'sales', name: 'Sales Agent', status: 'ready' },
        { id: 'customer', name: 'Customer Agent', status: 'ready' },
        { id: 'analytics', name: 'Analytics Agent', status: 'ready' }
      ]
    }));
  } else {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      service: 'business-agents',
      version: '1.0.0',
      status: 'running'
    }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Business Agents service listening on http://${HOST}:${PORT}`);
});