import { test as setup, expect } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, '.auth/user.json');

setup('authenticate', async ({ page }) => {
  console.log('🔐 Setting up authentication for E2E tests...');
  
  // Navigate to login page
  await page.goto('/login');
  
  // Wait for login form to be visible
  await expect(page.locator('form')).toBeVisible();
  
  // Fill in test credentials
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'password123');
  
  // Submit login form
  await page.click('button[type="submit"]');
  
  // Wait for successful login (redirect to dashboard)
  await expect(page).toHaveURL('/dashboard');
  
  // Verify user is logged in by checking for user menu or profile
  await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
  
  // Save authentication state
  await page.context().storageState({ path: authFile });
  
  console.log('✅ Authentication setup complete');
});

setup('create test user', async ({ request }) => {
  console.log('👤 Creating test user for E2E tests...');
  
  try {
    // Create test user via API
    const response = await request.post('/api/auth/register', {
      data: {
        email: 'test@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User'
      }
    });
    
    if (response.ok()) {
      console.log('✅ Test user created successfully');
    } else if (response.status() === 409) {
      console.log('ℹ️  Test user already exists');
    } else {
      console.error('❌ Failed to create test user:', await response.text());
    }
  } catch (error) {
    console.error('❌ Error creating test user:', error);
  }
});

setup('seed test data', async ({ request }) => {
  console.log('🌱 Seeding test data for E2E tests...');
  
  try {
    // Login to get auth token
    const loginResponse = await request.post('/api/auth/login', {
      data: {
        email: 'test@example.com',
        password: 'password123'
      }
    });
    
    if (!loginResponse.ok()) {
      console.error('❌ Failed to login for test data seeding');
      return;
    }
    
    const { token } = await loginResponse.json();
    const authHeaders = { 'Authorization': `Bearer ${token}` };
    
    // Create test documents
    const testDocuments = [
      {
        title: 'Test Contract Agreement',
        documentType: 'contract',
        language: 'en',
        content: 'This is a test contract with various clauses for testing purposes...'
      },
      {
        title: 'Sample Privacy Policy',
        documentType: 'privacy-policy',
        language: 'en',
        content: 'This privacy policy describes how we collect and use your data...'
      },
      {
        title: 'Terms of Service',
        documentType: 'terms-of-service',
        language: 'en',
        content: 'These terms govern your use of our service...'
      }
    ];
    
    for (const doc of testDocuments) {
      const response = await request.post('/api/documents', {
        headers: authHeaders,
        data: doc
      });
      
      if (response.ok()) {
        const document = await response.json();
        console.log(`✅ Created test document: ${document.title}`);
        
        // Create analysis for the document
        const analysisResponse = await request.post('/api/analysis', {
          headers: authHeaders,
          data: { documentId: document.id }
        });
        
        if (analysisResponse.ok()) {
          console.log(`✅ Created analysis for: ${document.title}`);
        }
      }
    }
    
    console.log('✅ Test data seeding complete');
  } catch (error) {
    console.error('❌ Error seeding test data:', error);
  }
});