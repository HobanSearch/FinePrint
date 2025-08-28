import { test as teardown } from '@playwright/test';
import fs from 'fs';
import path from 'path';

teardown('cleanup auth state', async () => {
  console.log('🧹 Cleaning up authentication state...');
  
  const authFile = path.join(__dirname, '.auth/user.json');
  
  try {
    if (fs.existsSync(authFile)) {
      fs.unlinkSync(authFile);
      console.log('✅ Authentication state cleaned up');
    }
  } catch (error) {
    console.warn('⚠️  Could not cleanup auth state:', error);
  }
});

teardown('cleanup test data', async ({ request }) => {
  console.log('🧹 Cleaning up test data...');
  
  try {
    // Login to get auth token
    const loginResponse = await request.post('/api/auth/login', {
      data: {
        email: 'test@example.com',
        password: 'password123'
      }
    });
    
    if (loginResponse.ok()) {
      const { token } = await loginResponse.json();
      const authHeaders = { 'Authorization': `Bearer ${token}` };
      
      // Get all user documents
      const documentsResponse = await request.get('/api/documents', {
        headers: authHeaders
      });
      
      if (documentsResponse.ok()) {
        const { documents } = await documentsResponse.json();
        
        // Delete all test documents
        for (const doc of documents) {
          await request.delete(`/api/documents/${doc.id}`, {
            headers: authHeaders
          });
          console.log(`🗑️  Deleted test document: ${doc.title}`);
        }
      }
      
      console.log('✅ Test data cleanup complete');
    }
  } catch (error) {
    console.warn('⚠️  Could not cleanup test data:', error);
  }
});