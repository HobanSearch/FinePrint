import { http, HttpResponse } from 'msw';

// Mock API responses
export const handlers = [
  // Auth endpoints
  http.post('/api/auth/login', () => {
    return HttpResponse.json({
      token: 'mock-jwt-token',
      user: {
        id: '1',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        role: 'user'
      }
    });
  }),

  http.post('/api/auth/register', () => {
    return HttpResponse.json({
      token: 'mock-jwt-token',
      user: {
        id: '1',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        role: 'user'
      }
    });
  }),

  http.post('/api/auth/refresh', () => {
    return HttpResponse.json({
      token: 'mock-refreshed-jwt-token'
    });
  }),

  http.post('/api/auth/logout', () => {
    return HttpResponse.json({ success: true });
  }),

  // User endpoints
  http.get('/api/users/me', () => {
    return HttpResponse.json({
      id: '1',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      role: 'user',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z'
    });
  }),

  http.put('/api/users/me', () => {
    return HttpResponse.json({
      id: '1',
      email: 'test@example.com',
      firstName: 'Updated',
      lastName: 'User',
      role: 'user',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: new Date().toISOString()
    });
  }),

  // Document endpoints
  http.get('/api/documents', () => {
    return HttpResponse.json({
      documents: [
        {
          id: '1',
          title: 'Test Contract',
          documentType: 'contract',
          language: 'en',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z'
        },
        {
          id: '2',
          title: 'Privacy Policy',
          documentType: 'privacy-policy',
          language: 'en',
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z'
        }
      ],
      total: 2,
      page: 1,
      limit: 10
    });
  }),

  http.post('/api/documents', () => {
    return HttpResponse.json({
      id: 'new-doc-id',
      title: 'New Document',
      documentType: 'contract',
      language: 'en',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }),

  http.get('/api/documents/:id', ({ params }) => {
    return HttpResponse.json({
      id: params.id,
      title: 'Test Document',
      documentType: 'contract',
      language: 'en',
      contentLength: 1500,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z'
    });
  }),

  http.delete('/api/documents/:id', () => {
    return HttpResponse.json({ success: true });
  }),

  // Analysis endpoints
  http.post('/api/analysis', () => {
    return HttpResponse.json({
      id: 'analysis-id',
      status: 'pending',
      documentId: 'doc-id',
      createdAt: new Date().toISOString()
    });
  }),

  http.get('/api/analysis/:id', ({ params }) => {
    return HttpResponse.json({
      id: params.id,
      status: 'completed',
      documentId: 'doc-id',
      overallRiskScore: 7.5,
      executiveSummary: 'This document contains several medium-risk clauses.',
      keyFindings: [
        'Broad liability exclusion',
        'Automatic renewal terms'
      ],
      recommendations: [
        'Negotiate narrower liability exclusions',
        'Add opt-out provisions'
      ],
      findings: [
        {
          id: 'finding-1',
          category: 'liability',
          title: 'Broad Liability Exclusion',
          description: 'The contract includes overly broad liability exclusions',
          severity: 'medium',
          confidenceScore: 0.9,
          textExcerpt: 'Company shall not be liable...',
          recommendation: 'Negotiate for narrower exclusions'
        }
      ],
      processingTimeMs: 5000,
      modelUsed: 'mistral:7b',
      createdAt: '2024-01-01T00:00:00Z',
      completedAt: new Date().toISOString()
    });
  }),

  http.get('/api/analysis/document/:documentId', ({ params }) => {
    return HttpResponse.json([
      {
        id: 'analysis-1',
        status: 'completed',
        documentId: params.documentId,
        overallRiskScore: 7.5,
        createdAt: '2024-01-01T00:00:00Z',
        completedAt: '2024-01-01T00:05:00Z'
      }
    ]);
  }),

  // File upload
  http.post('/api/upload', () => {
    return HttpResponse.json({
      url: 'https://example.com/uploaded-file.pdf',
      filename: 'test-document.pdf',
      size: 1024
    });
  }),

  // Error scenarios
  http.get('/api/error/400', () => {
    return HttpResponse.json(
      { error: 'Bad Request', message: 'Invalid request parameters' },
      { status: 400 }
    );
  }),

  http.get('/api/error/401', () => {
    return HttpResponse.json(
      { error: 'Unauthorized', message: 'Authentication required' },
      { status: 401 }
    );
  }),

  http.get('/api/error/403', () => {
    return HttpResponse.json(
      { error: 'Forbidden', message: 'Access denied' },
      { status: 403 }
    );
  }),

  http.get('/api/error/404', () => {
    return HttpResponse.json(
      { error: 'Not Found', message: 'Resource not found' },
      { status: 404 }
    );
  }),

  http.get('/api/error/500', () => {
    return HttpResponse.json(
      { error: 'Internal Server Error', message: 'Something went wrong' },
      { status: 500 }
    );
  }),

  // Websocket mock (for notifications)
  http.get('/ws', () => {
    return HttpResponse.json({ url: 'ws://localhost:3001/ws' });
  })
];