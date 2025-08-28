const http = require('http');

const PORT = process.env.PORT || 3040;
const HOST = process.env.HOST || '0.0.0.0';

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', service: 'feedback-collector' }));
  } else if (req.url === '/api/feedback' || req.url.startsWith('/feedback')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      feedbackId: 'fb-' + Date.now(),
      status: 'collected',
      type: 'implicit',
      timestamp: new Date().toISOString()
    }));
  } else if (req.url === '/api/metrics') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      metrics: {
        totalFeedback: 1234,
        todayFeedback: 45,
        sentiment: { positive: 0.6, neutral: 0.3, negative: 0.1 }
      }
    }));
  } else {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      service: 'feedback-collector',
      version: '1.0.0',
      status: 'running',
      collectors: ['implicit', 'explicit', 'behavioral']
    }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Feedback Collector service listening on http://${HOST}:${PORT}`);
});