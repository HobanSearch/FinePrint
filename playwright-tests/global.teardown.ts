import { FullConfig } from '@playwright/test';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function globalTeardown(config: FullConfig) {
  console.log('🧹 Starting E2E test environment cleanup...');

  try {
    // Cleanup test database
    await cleanupTestDatabase();
    
    // Cleanup Redis
    await cleanupRedis();
    
    // Cleanup any test artifacts
    await cleanupTestArtifacts();
    
    console.log('✅ E2E test environment cleanup complete');
  } catch (error) {
    console.error('❌ E2E test environment cleanup failed:', error);
  }
}

async function cleanupTestDatabase() {
  console.log('🗑️  Cleaning up E2E test database...');
  
  try {
    // Drop E2E test database
    await execAsync(`
      docker exec fineprintai-postgres-1 psql -U postgres -c "
        SELECT pg_terminate_backend(pg_stat_activity.pid)
        FROM pg_stat_activity
        WHERE pg_stat_activity.datname = 'fineprintai_e2e_test'
          AND pid <> pg_backend_pid();
        DROP DATABASE IF EXISTS fineprintai_e2e_test;
      "
    `).catch(() => {}); // Ignore error if container doesn't exist
    
    // If docker is not available, try local postgres
    if (!process.env.CI) {
      try {
        await execAsync(`
          psql -U postgres -c "
            SELECT pg_terminate_backend(pg_stat_activity.pid)
            FROM pg_stat_activity
            WHERE pg_stat_activity.datname = 'fineprintai_e2e_test'
              AND pid <> pg_backend_pid();
            DROP DATABASE IF EXISTS fineprintai_e2e_test;
          "
        `);
      } catch (error) {
        console.warn('Could not cleanup local postgres database');
      }
    }
    
    console.log('✅ E2E test database cleanup complete');
  } catch (error) {
    console.warn('⚠️  Database cleanup failed:', error.message);
  }
}

async function cleanupRedis() {
  console.log('🗑️  Cleaning up Redis test data...');
  
  try {
    // Clear Redis test database
    await execAsync('redis-cli -n 2 FLUSHDB').catch(() => {});
    console.log('✅ Redis cleanup complete');
  } catch (error) {
    console.warn('⚠️  Redis cleanup failed:', error.message);
  }
}

async function cleanupTestArtifacts() {
  console.log('🗑️  Cleaning up test artifacts...');
  
  try {
    // Remove any temporary test files
    await execAsync('rm -rf tmp/e2e-test-*').catch(() => {});
    
    // Remove any test screenshots/videos that are not failures
    await execAsync('find playwright-test-results -name "*.webm" -not -path "*/failed/*" -delete').catch(() => {});
    
    console.log('✅ Test artifacts cleanup complete');
  } catch (error) {
    console.warn('⚠️  Test artifacts cleanup failed:', error.message);
  }
}

export default globalTeardown;