const IS_DEV = process.env.APP_VARIANT === 'development'
const IS_PREVIEW = process.env.APP_VARIANT === 'preview'

export default {
  expo: {
    name: IS_DEV ? 'Fine Print AI (Dev)' : IS_PREVIEW ? 'Fine Print AI (Preview)' : 'Fine Print AI',
    slug: 'fine-print-ai',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
    scheme: 'fineprintai',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff'
    },
    assetBundlePatterns: ['**/*'],
    ios: {
      supportsTablet: true,
      bundleIdentifier: IS_DEV
        ? 'com.fineprintai.mobile.dev'
        : IS_PREVIEW
        ? 'com.fineprintai.mobile.preview'
        : 'com.fineprintai.mobile',
      buildNumber: '1',
      infoPlist: {
        NSCameraUsageDescription: 'This app uses camera to scan legal documents for analysis.',
        NSDocumentsFolderUsageDescription: 'This app needs access to documents to analyze legal files.',
        NSPhotoLibraryUsageDescription: 'This app needs access to photo library to select documents for analysis.',
        NSFaceIDUsageDescription: 'This app uses Face ID for secure authentication.',
        NSMicrophoneUsageDescription: 'This app uses microphone for voice commands (optional feature).',
        NSSiriUsageDescription: 'This app uses Siri to provide voice shortcuts for document analysis.',
        NSUserActivityTypes: ['com.fineprintai.scan_document', 'com.fineprintai.quick_analysis', 'com.fineprintai.view_dashboard'],
        ITSAppUsesNonExemptEncryption: false
      },
      associatedDomains: ['applinks:fineprintai.com'],
      config: {
        usesNonExemptEncryption: false
      },
      entitlements: {
        'com.apple.developer.siri': true,
        'com.apple.security.application-groups': ['group.com.fineprintai.mobile']
      }
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#ffffff'
      },
      package: IS_DEV
        ? 'com.fineprintai.mobile.dev'
        : IS_PREVIEW
        ? 'com.fineprintai.mobile.preview'
        : 'com.fineprintai.mobile',
      versionCode: 1,
      permissions: [
        'CAMERA',
        'READ_EXTERNAL_STORAGE',
        'WRITE_EXTERNAL_STORAGE',
        'INTERNET',
        'ACCESS_NETWORK_STATE',
        'WAKE_LOCK',
        'RECEIVE_BOOT_COMPLETED',
        'VIBRATE',
        'USE_FINGERPRINT',
        'USE_BIOMETRIC',
        'SYSTEM_ALERT_WINDOW',
        'BIND_QUICK_SETTINGS_TILE',
        'RECORD_AUDIO'
      ],
      intentFilters: [
        {
          action: 'VIEW',
          autoVerify: true,
          data: [
            {
              scheme: 'https',
              host: 'fineprintai.com'
            }
          ],
          category: ['BROWSABLE', 'DEFAULT']
        }
      ],
      manifestPlaceholders: {
        appAuthRedirectScheme: 'com.fineprintai.mobile'
      }
    },
    web: {
      bundler: 'metro',
      output: 'static',
      favicon: './assets/favicon.png'
    },
    plugins: [
      'expo-router',
      [
        'expo-notifications',
        {
          icon: './assets/notification-icon.png',
          color: '#ffffff',
          defaultChannel: 'default'
        }
      ],
      [
        'expo-local-authentication',
        {
          faceIDPermission: 'Allow Fine Print AI to use Face ID for secure authentication.'
        }
      ],
      [
        'expo-camera',
        {
          cameraPermission: 'Allow Fine Print AI to access camera to scan legal documents.'
        }
      ],
      [
        'expo-document-picker',
        {
          iCloudContainerEnvironment: 'Production'
        }
      ],
      [
        'expo-secure-store'
      ],
      [
        'expo-font'
      ],
      'expo-localization'
    ],
    experiments: {
      typedRoutes: true,
      tsconfigPaths: true
    },
    extra: {
      router: {
        origin: false
      },
      eas: {
        projectId: 'your-project-id-here'
      }
    },
    owner: 'fineprintai',
    runtimeVersion: {
      policy: 'appVersion'
    },
    updates: {
      url: 'https://u.expo.dev/your-project-id-here'
    }
  }
}