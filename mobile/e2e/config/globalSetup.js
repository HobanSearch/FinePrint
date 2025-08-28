const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

module.exports = async () => {
  console.log('🔧 Setting up global test environment...');
  
  // Create test artifacts directory
  const artifactsDir = path.join(__dirname, '..', 'artifacts');
  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }
  
  // Create test results directory
  const resultsDir = path.join(__dirname, '..', 'test-results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  
  // Platform-specific setup
  const platform = process.env.DETOX_CONFIGURATION || 'android.emu.debug';
  
  if (platform.includes('android')) {
    await setupAndroid();
  } else if (platform.includes('ios')) {
    await setupIOS();
  }
  
  // Setup test database and API mocks
  await setupTestEnvironment();
  
  console.log('✅ Global setup completed');
};

async function setupAndroid() {
  console.log('🤖 Setting up Android environment...');
  
  try {
    // Check if emulator is running
    const runningDevices = execSync('adb devices', { encoding: 'utf8' });
    
    if (!runningDevices.includes('emulator') && !runningDevices.includes('device')) {
      console.log('Starting Android emulator...');
      
      // Start emulator in background
      execSync('emulator -avd Pixel_7_API_34 -no-audio &', { 
        stdio: 'ignore',
        timeout: 30000 
      });
      
      // Wait for emulator to be ready
      let attempts = 0;
      const maxAttempts = 30;
      
      while (attempts < maxAttempts) {
        try {
          const bootComplete = execSync(
            'adb shell getprop sys.boot_completed 2>/dev/null || echo "0"',
            { encoding: 'utf8', timeout: 5000 }
          ).trim();
          
          if (bootComplete === '1') {
            console.log('✅ Android emulator is ready');
            break;
          }
        } catch (e) {
          // Continue waiting
        }
        
        attempts++;
        console.log(`⏳ Waiting for emulator... (${attempts}/${maxAttempts})`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      if (attempts >= maxAttempts) {
        throw new Error('Android emulator failed to start within timeout');
      }
    }
    
    // Enable accessibility services for testing
    execSync('adb shell settings put secure enabled_accessibility_services com.android.talkback/com.google.android.marvin.talkback.TalkBackService');
    
    // Set up mock server ports
    execSync('adb reverse tcp:3001 tcp:3001'); // API server
    execSync('adb reverse tcp:8080 tcp:8080'); // WebSocket server
    
  } catch (error) {
    console.error('❌ Android setup failed:', error.message);
    throw error;
  }
}

async function setupIOS() {
  console.log('🍎 Setting up iOS environment...');
  
  try {
    // Check if iOS simulator is available
    const simulators = execSync('xcrun simctl list devices available', { encoding: 'utf8' });
    
    if (!simulators.includes('iPhone 15 Pro')) {
      throw new Error('iPhone 15 Pro simulator not found. Please install it via Xcode.');
    }
    
    // Boot simulator if not already running
    const bootedDevices = execSync('xcrun simctl list devices | grep Booted', { encoding: 'utf8' });
    
    if (!bootedDevices.includes('iPhone 15 Pro')) {
      console.log('Booting iOS simulator...');
      execSync('xcrun simctl boot "iPhone 15 Pro"');
      
      // Wait for simulator to boot
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
    
    // Enable accessibility inspector
    execSync('xcrun simctl spawn "iPhone 15 Pro" defaults write com.apple.Accessibility AccessibilityEnabled -bool true');
    
    console.log('✅ iOS simulator is ready');
    
  } catch (error) {
    console.error('❌ iOS setup failed:', error.message);
    throw error;
  }
}

async function setupTestEnvironment() {
  console.log('🌐 Setting up test environment...');
  
  // Start mock API server
  const { spawn } = require('child_process');
  
  const mockServer = spawn('node', [path.join(__dirname, 'mockServer.js')], {
    stdio: 'pipe',
    detached: false
  });
  
  // Store PID for cleanup
  global.mockServerPid = mockServer.pid;
  
  // Wait for server to start
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Mock server failed to start'));
    }, 10000);
    
    mockServer.stdout.on('data', (data) => {
      if (data.toString().includes('Mock server running')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    
    mockServer.stderr.on('data', (data) => {
      console.error('Mock server error:', data.toString());
    });
  });
  
  console.log('✅ Test environment ready');
}