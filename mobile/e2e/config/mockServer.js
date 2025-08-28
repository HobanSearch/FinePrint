const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = 3001;
const WS_PORT = 8080;

// Middleware
app.use(cors());
app.use(express.json());

// Mock user database
const mockUsers = new Map([
  ['test@fineprintai.com', {
    id: 'user-1',
    email: 'test@fineprintai.com',
    name: 'Test User',
    subscription: 'premium',
    token: 'mock-jwt-token'
  }]
]);

// Mock documents database
const mockDocuments = new Map([
  ['doc-1', {
    id: 'doc-1',
    title: 'Privacy Policy',
    type: 'privacy-policy',
    status: 'analyzed',
    uploadDate: '2024-01-15T10:00:00Z',
    riskScore: 75,
    findings: [
      {
        id: 'finding-1',
        category: 'data-sharing',
        severity: 'high',
        description: 'Third-party data sharing without explicit consent'
      }
    ]
  }]
]);

// Authentication endpoints
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  
  if (mockUsers.has(email) && password === 'TestPassword123!') {
    const user = mockUsers.get(email);
    res.json({
      success: true,
      user,
      token: user.token
    });
  } else {
    res.status(401).json({
      success: false,
      message: 'Invalid credentials'
    });
  }
});

app.post('/api/auth/register', (req, res) => {
  const { email, password, name } = req.body;
  
  if (mockUsers.has(email)) {
    return res.status(400).json({
      success: false,
      message: 'User already exists'
    });
  }
  
  const newUser = {
    id: `user-${Date.now()}`,
    email,
    name,
    subscription: 'free',
    token: `mock-token-${Date.now()}`
  };
  
  mockUsers.set(email, newUser);
  
  res.json({
    success: true,
    user: newUser,
    token: newUser.token
  });
});

// Document endpoints
app.get('/api/documents', (req, res) => {
  const documents = Array.from(mockDocuments.values());
  res.json({
    success: true,
    documents
  });
});

app.post('/api/documents/upload', (req, res) => {
  const { title, type, content } = req.body;
  
  const newDoc = {
    id: `doc-${Date.now()}`,
    title,
    type,
    status: 'processing',
    uploadDate: new Date().toISOString(),
    riskScore: null,
    findings: []
  };
  
  mockDocuments.set(newDoc.id, newDoc);
  
  // Simulate processing delay
  setTimeout(() => {
    newDoc.status = 'analyzed';
    newDoc.riskScore = Math.floor(Math.random() * 100);
    newDoc.findings = [
      {
        id: `finding-${Date.now()}`,
        category: 'data-retention',
        severity: 'medium',
        description: 'Data retention period not clearly specified'
      }
    ];
    
    // Emit WebSocket update
    io.emit('document-analyzed', newDoc);
  }, 3000);
  
  res.json({
    success: true,
    document: newDoc
  });
});

app.get('/api/documents/:id', (req, res) => {
  const { id } = req.params;
  const document = mockDocuments.get(id);
  
  if (!document) {
    return res.status(404).json({
      success: false,
      message: 'Document not found'
    });
  }
  
  res.json({
    success: true,
    document
  });
});

// Analysis endpoints
app.post('/api/analysis/start', (req, res) => {
  const { documentId } = req.body;
  const document = mockDocuments.get(documentId);
  
  if (!document) {
    return res.status(404).json({
      success: false,
      message: 'Document not found'
    });
  }
  
  document.status = 'analyzing';
  
  res.json({
    success: true,
    analysisId: `analysis-${Date.now()}`
  });
});

app.get('/api/analysis/:id/status', (req, res) => {
  // Mock analysis status
  res.json({
    success: true,
    status: 'completed',
    progress: 100
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Mock server error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('subscribe-documents', (userId) => {
    socket.join(`user-${userId}`);
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Start servers
server.listen(PORT, () => {
  console.log(`Mock server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down mock server...');
  server.close(() => {
    process.exit(0);
  });
});