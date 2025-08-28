const { Client } = require('pg');
const Redis = require('redis');

module.exports = async () => {
  console.log('Tearing down test environment...');
  
  try {
    // Cleanup test database
    await cleanupTestDatabase();
    
    // Cleanup test Redis
    await cleanupTestRedis();
    
    console.log('Test environment teardown complete');
  } catch (error) {
    console.error('Failed to teardown test environment:', error);
  }
};

async function cleanupTestDatabase() {
  try {
    const client = new Client({
      host: 'localhost',
      port: 5432,
      user: 'postgres',
      password: 'postgres',
      database: 'postgres'
    });
    
    await client.connect();
    
    // Terminate active connections to test database
    await client.query(`
      SELECT pg_terminate_backend(pg_stat_activity.pid)
      FROM pg_stat_activity
      WHERE pg_stat_activity.datname = 'fineprintai_test'
        AND pid <> pg_backend_pid()
    `);
    
    // Drop test database
    await client.query('DROP DATABASE IF EXISTS fineprintai_test');
    
    await client.end();
  } catch (error) {
    console.warn('Database cleanup failed:', error);
  }
}

async function cleanupTestRedis() {
  try {
    const redis = Redis.createClient({
      url: 'redis://localhost:6379/1'
    });
    
    await redis.connect();
    await redis.flushAll(); // Clear test Redis database
    await redis.quit();
  } catch (error) {
    console.warn('Redis cleanup failed:', error);
  }
}