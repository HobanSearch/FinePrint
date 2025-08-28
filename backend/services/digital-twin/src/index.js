const http = require('http');

const PORT = process.env.PORT || 3020;
const HOST = process.env.HOST || '0.0.0.0';

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', service: 'digital-twin' }));
  } else if (req.url === '/api/experiments' || req.url.startsWith('/experiments')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      experimentId: 'exp-' + Date.now(),
      status: 'running',
      variants: ['control', 'variant-a'],
      allocation: { control: 0.5, 'variant-a': 0.5 }
    }));
  } else if (req.url === '/api/simulations') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      simulations: [
        { id: 'sim-1', name: 'Marketing Campaign', status: 'ready' },
        { id: 'sim-2', name: 'Sales Flow', status: 'ready' }
      ]
    }));
  } else {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      service: 'digital-twin',
      version: '1.0.0',
      status: 'running',
      capabilities: ['business-simulation', 'a-b-testing', 'performance-modeling']
    }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Digital Twin service listening on http://${HOST}:${PORT}`);
});