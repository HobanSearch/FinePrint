/** @type {Detox.DetoxConfig} */
module.exports = {
  testRunner: {
    args: {
      '$0': 'jest',
      config: 'e2e/jest.config.js'
    },
    jest: {
      setupTimeout: 120000
    }
  },
  apps: {
    'ios.debug': {
      type: 'ios.app',
      binaryPath: 'ios/build/Build/Products/Debug-iphonesimulator/FinePrintAI.app',
      build: 'xcodebuild -workspace ios/FinePrintAI.xcworkspace -scheme FinePrintAI -configuration Debug -sdk iphonesimulator -derivedDataPath ios/build'
    },
    'ios.release': {
      type: 'ios.app',
      binaryPath: 'ios/build/Build/Products/Release-iphonesimulator/FinePrintAI.app',
      build: 'xcodebuild -workspace ios/FinePrintAI.xcworkspace -scheme FinePrintAI -configuration Release -sdk iphonesimulator -derivedDataPath ios/build'
    },
    'android.debug': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk',
      build: 'cd android && ./gradlew assembleDebug assembleAndroidTest -DtestBuildType=debug',
      reversePorts: [
        8081,
        3001, // API server
        8080  // WebSocket server
      ]
    },
    'android.release': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/release/app-release.apk',
      build: 'cd android && ./gradlew assembleRelease assembleAndroidTest -DtestBuildType=release'
    },
    'android.local': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk'
    }
  },
  devices: {
    simulator: {
      type: 'ios.simulator',
      device: {
        type: 'iPhone 15 Pro'
      }
    },
    attached: {
      type: 'android.attached',
      device: {
        adbName: '.*'
      }
    },
    emulator: {
      type: 'android.emulator',
      device: {
        avdName: 'Pixel_7_API_34'
      },
      utilBinaryPaths: [
        '/Users/*/Library/Android/sdk/emulator',
        '/usr/local/bin/emulator'
      ]
    },
    genymotion: {
      type: 'android.genycloud',
      device: {
        recipeName: 'Google Pixel 7',
        androidVersion: '13'
      }
    }
  },
  configurations: {
    'ios.sim.debug': {
      device: 'simulator',
      app: 'ios.debug'
    },
    'ios.sim.release': {
      device: 'simulator',
      app: 'ios.release'
    },
    'android.att.debug': {
      device: 'attached',
      app: 'android.debug'
    },
    'android.att.release': {
      device: 'attached',
      app: 'android.release'
    },
    'android.emu.debug': {
      device: 'emulator',
      app: 'android.debug'
    },
    'android.emu.release': {
      device: 'emulator',
      app: 'android.release'
    },
    'android.geny.debug': {
      device: 'genymotion',
      app: 'android.debug'
    }
  },
  session: {
    server: 'ws://localhost:8099',
    sessionId: 'FinePrintAI'
  },
  behavior: {
    init: {
      reinstallApp: true,
      exposeGlobals: false
    },
    launchApp: 'auto'
  },
  artifacts: {
    rootDir: './e2e/artifacts',
    pathBuilder: './e2e/config/pathBuilder.js',
    plugins: {
      log: {
        enabled: true,
        keepOnlyFailedTestsArtifacts: false
      },
      screenshot: {
        enabled: true,
        shouldTakeAutomaticSnapshots: true,
        keepOnlyFailedTestsArtifacts: false,
        takeWhen: {
          testStart: false,
          testDone: true,
          appNotReady: true
        }
      },
      video: {
        enabled: true,
        keepOnlyFailedTestsArtifacts: false,
        android: {
          bitRate: 4000000
        },
        simulator: {
          codec: 'hevc'
        }
      },
      instruments: {
        enabled: process.env.CI !== 'true'
      },
      timeline: {
        enabled: true
      },
      uiHierarchy: {
        enabled: process.env.CI !== 'true'
      }
    }
  },
  logger: {
    level: process.env.CI ? 'info' : 'debug',
    overrideConsole: false
  }
};