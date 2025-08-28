const { execSync } = require('child_process');

module.exports = async () => {
  console.log('🧹 Starting global teardown...');
  
  try {
    // Stop mock server
    if (global.mockServerPid) {
      console.log('Stopping mock server...');
      try {
        process.kill(global.mockServerPid, 'SIGTERM');
      } catch (e) {
        console.warn('Mock server already stopped');
      }
    }
    
    // Platform-specific cleanup
    const platform = process.env.DETOX_CONFIGURATION || 'android.emu.debug';
    
    if (platform.includes('android')) {
      await cleanupAndroid();
    } else if (platform.includes('ios')) {
      await cleanupIOS();
    }
    
    // Generate test summary
    await generateTestSummary();
    
    console.log('✅ Global teardown completed');
    
  } catch (error) {
    console.error('❌ Teardown error:', error.message);
    // Don't throw to avoid masking test failures
  }
};

async function cleanupAndroid() {
  console.log('🤖 Cleaning up Android environment...');
  
  try {
    // Clear app data
    execSync('adb shell pm clear com.fineprintai.mobile', { stdio: 'ignore' });
    
    // Remove reverse port forwarding
    execSync('adb reverse --remove tcp:3001', { stdio: 'ignore' });
    execSync('adb reverse --remove tcp:8080', { stdio: 'ignore' });
    
    // Don't close emulator in CI (reused for efficiency)
    if (!process.env.CI) {
      execSync('adb emu kill', { stdio: 'ignore' });
    }
    
  } catch (error) {
    console.warn('Android cleanup warning:', error.message);
  }
}

async function cleanupIOS() {
  console.log('🍎 Cleaning up iOS environment...');
  
  try {
    // Reset simulator content and settings
    execSync('xcrun simctl shutdown "iPhone 15 Pro"', { stdio: 'ignore' });
    
    if (!process.env.CI) {
      execSync('xcrun simctl erase "iPhone 15 Pro"', { stdio: 'ignore' });
    }
    
  } catch (error) {
    console.warn('iOS cleanup warning:', error.message);
  }
}

async function generateTestSummary() {
  const fs = require('fs');
  const path = require('path');
  
  try {
    const resultsDir = path.join(__dirname, '..', 'test-results');
    const summaryFile = path.join(resultsDir, 'test-summary.json');
    
    const summary = {
      timestamp: new Date().toISOString(),
      platform: process.env.DETOX_CONFIGURATION || 'unknown',
      environment: process.env.NODE_ENV || 'test',
      artifacts: {
        screenshots: fs.existsSync(path.join(resultsDir, '..', 'artifacts', 'screenshots')),
        videos: fs.existsSync(path.join(resultsDir, '..', 'artifacts', 'videos')),
        logs: fs.existsSync(path.join(resultsDir, '..', 'artifacts', 'logs'))
      }
    };
    
    fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
    console.log('📊 Test summary generated');
    
  } catch (error) {
    console.warn('Failed to generate test summary:', error.message);
  }
}