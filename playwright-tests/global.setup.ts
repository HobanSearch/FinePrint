import { chromium, FullConfig } from '@playwright/test';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function globalSetup(config: FullConfig) {
  console.log('🚀 Starting E2E test environment setup...');

  try {
    // Setup test database
    await setupTestDatabase();
    
    // Setup test services
    await setupTestServices();
    
    // Wait for services to be ready
    await waitForServices();
    
    console.log('✅ E2E test environment setup complete');
  } catch (error) {
    console.error('❌ E2E test environment setup failed:', error);
    throw error;
  }
}

async function setupTestDatabase() {
  console.log('📦 Setting up E2E test database...');
  
  try {
    // Create E2E test database
    await execAsync(`
      docker exec fineprintai-postgres-1 psql -U postgres -c "DROP DATABASE IF EXISTS fineprintai_e2e_test;"
    `).catch(() => {}); // Ignore error if container doesn't exist
    
    await execAsync(`
      docker exec fineprintai-postgres-1 psql -U postgres -c "CREATE DATABASE fineprintai_e2e_test;"
    `).catch(() => {}); // Ignore error if container doesn't exist
    
    // If docker is not available, try local postgres
    if (!process.env.CI) {
      try {
        await execAsync('psql -U postgres -c "DROP DATABASE IF EXISTS fineprintai_e2e_test;"');
        await execAsync('psql -U postgres -c "CREATE DATABASE fineprintai_e2e_test;"');
      } catch (error) {
        console.warn('Could not setup local postgres, assuming it will be available during tests');
      }
    }
    
    console.log('✅ E2E test database setup complete');
  } catch (error) {
    console.warn('⚠️  Database setup failed, tests may fail:', error.message);
  }
}

async function setupTestServices() {
  console.log('🔧 Setting up test services...');
  
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.E2E_TEST = 'true';
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/fineprintai_e2e_test';
  process.env.REDIS_URL = 'redis://localhost:6379/2';
  process.env.JWT_SECRET = 'test-jwt-secret-for-e2e-testing-only';
  process.env.OLLAMA_BASE_URL = 'http://localhost:11434';
  
  // Clear Redis test database
  try {
    await execAsync('redis-cli -n 2 FLUSHDB').catch(() => {});
  } catch (error) {
    console.warn('Could not clear Redis test database:', error.message);
  }
  
  console.log('✅ Test services setup complete');
}

async function waitForServices() {
  console.log('⏳ Waiting for services to be ready...');
  
  const maxRetries = 30;
  const retryDelay = 2000;
  
  // Wait for frontend
  await waitForService('Frontend', 'http://localhost:5173', maxRetries, retryDelay);
  
  // Wait for backend
  await waitForService('Backend', 'http://localhost:3001/health', maxRetries, retryDelay);
  
  console.log('✅ All services are ready');
}

async function waitForService(name: string, url: string, maxRetries: number, delay: number) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        console.log(`✅ ${name} is ready`);
        return;
      }
    } catch (error) {
      // Service not ready yet
    }
    
    if (i < maxRetries - 1) {
      console.log(`⏳ Waiting for ${name}... (${i + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw new Error(`${name} failed to start after ${maxRetries} attempts`);
}

export default globalSetup;