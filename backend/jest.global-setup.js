const { execSync } = require('child_process');
const { Client } = require('pg');
const Redis = require('redis');

module.exports = async () => {
  console.log('Setting up test environment...');
  
  try {
    // Setup test database
    await setupTestDatabase();
    
    // Setup test Redis
    await setupTestRedis();
    
    // Setup test environment variables
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'error';
    
    console.log('Test environment setup complete');
  } catch (error) {
    console.error('Failed to setup test environment:', error);
    process.exit(1);
  }
};

async function setupTestDatabase() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'postgres'
  });
  
  try {
    await client.connect();
    
    // Drop test database if exists
    try {
      await client.query('DROP DATABASE IF EXISTS fineprintai_test');
    } catch (error) {
      // Ignore error if database doesn't exist
    }
    
    // Create test database
    await client.query('CREATE DATABASE fineprintai_test');
    
    await client.end();
    
    // Run migrations on test database
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/fineprintai_test';
    
    try {
      execSync('npx prisma migrate deploy', { 
        stdio: 'inherit',
        cwd: process.cwd()
      });
    } catch (error) {
      console.warn('Prisma migrations not available, skipping...');
    }
    
  } catch (error) {
    console.error('Database setup failed:', error);
    throw error;
  }
}

async function setupTestRedis() {
  try {
    const redis = Redis.createClient({
      url: 'redis://localhost:6379/1'
    });
    
    await redis.connect();
    await redis.flushAll(); // Clear test Redis database
    await redis.quit();
    
  } catch (error) {
    console.warn('Redis setup failed, tests may not work properly:', error);
  }
}