# Fine Print AI Mobile App

A React Native mobile application for Fine Print AI - your AI-powered legal document analyzer.

## Features

- 📱 Cross-platform mobile app (iOS & Android)
- 🔐 Biometric authentication
- 📋 Document scanning with OCR
- 🤖 AI-powered legal document analysis
- 📴 Offline support with automatic sync
- 🔔 Push notifications
- 📊 Analysis history and document management
- 🎨 Native platform design adaptations

## Tech Stack

- **Framework**: React Native 0.73 + Expo SDK 50
- **Language**: TypeScript 5.0 with strict typing
- **Navigation**: React Navigation 6
- **State Management**: Zustand with offline support
- **Database**: WatermelonDB for offline storage
- **UI**: Cross-platform design system with native adaptations
- **Authentication**: Expo Local Authentication (biometrics)
- **Notifications**: Expo Notifications
- **API**: Axios with offline queue and retry logic

## Getting Started

### Prerequisites

- Node.js 18+ and npm 8+
- Expo CLI
- iOS Simulator (for iOS development)
- Android Studio (for Android development)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Start the development server:
```bash
npm start
```

4. Run on specific platforms:
```bash
npm run ios      # iOS Simulator
npm run android  # Android Emulator
npm run web      # Web browser
```

## Development Scripts

```bash
# Development
npm start                # Start Expo development server
npm run dev             # Start with dev client
npm run dev:ios         # iOS with dev client
npm run dev:android     # Android with dev client

# Building
npm run build           # Build with EAS
npm run build:android   # Build Android
npm run build:ios       # Build iOS
npm run build:preview   # Preview build

# Testing
npm test                # Run tests
npm run test:watch      # Watch mode
npm run test:coverage   # With coverage
npm run test:e2e        # End-to-end tests

# Code Quality
npm run lint            # ESLint
npm run lint:fix        # Fix ESLint issues
npm run format          # Prettier formatting
npm run format:check    # Check formatting
npm run type-check      # TypeScript check
```

## Project Structure

```
mobile/
├── src/
│   ├── components/     # Reusable UI components
│   ├── screens/        # Screen components
│   ├── navigation/     # Navigation configuration
│   ├── stores/         # Zustand stores and state management
│   ├── services/       # API clients and external services
│   ├── utils/          # Utility functions
│   ├── types/          # TypeScript type definitions
│   ├── constants/      # App constants and theme
│   └── hooks/          # Custom React hooks
├── assets/             # Static assets (images, fonts, etc.)
├── app.config.js       # Expo configuration
├── App.tsx            # Root application component
└── package.json       # Dependencies and scripts
```

## Key Features

### Cross-Platform Design System

The app features a comprehensive design system that adapts to platform conventions:

- **iOS**: Native iOS design patterns and animations
- **Android**: Material Design guidelines
- **Shared**: Consistent branding and core functionality

### Offline Support

- Local document storage with WatermelonDB
- Offline action queue with automatic sync
- Network status monitoring
- Optimistic updates with conflict resolution

### Security & Privacy

- Biometric authentication (Face ID, Touch ID, Fingerprint)
- Secure storage for sensitive data
- Local document processing for privacy
- Encrypted data transmission

### Performance Optimization

- Lazy loading and code splitting
- Image optimization and caching
- 60fps smooth scrolling
- Efficient memory management
- Battery usage optimization

## Configuration

### Environment Variables

Create a `.env` file based on `.env.example`:

```env
# API Configuration
API_URL=https://api.fineprintai.com
WS_URL=wss://api.fineprintai.com

# Feature Flags
ENABLE_ANALYTICS=true
ENABLE_CRASH_REPORTING=true
```

### EAS Build Configuration

The app uses Expo Application Services (EAS) for building and deployment. Configuration is in `eas.json`.

## Contributing

1. Follow the existing code style and patterns
2. Add TypeScript types for all new code
3. Write tests for new features
4. Update documentation as needed
5. Follow the commit message conventions

## Testing

The app includes comprehensive testing:

- **Unit Tests**: Jest + React Native Testing Library
- **Integration Tests**: API and store integration
- **E2E Tests**: Detox for end-to-end testing
- **Visual Tests**: Storybook for component testing

## Deployment

### Development Builds

```bash
npm run build:preview
```

### Production Builds

```bash
npm run build:production
```

### App Store Deployment

The app supports automated deployment to both Apple App Store and Google Play Store through EAS.

## Troubleshooting

### Common Issues

1. **Metro bundler issues**: Clear cache with `npx expo start -c`
2. **iOS build failures**: Clean build folder in Xcode
3. **Android build issues**: Clean Gradle cache
4. **TypeScript errors**: Run `npm run type-check`

### Support

For issues and questions:
- Check the [Fine Print AI documentation](../docs/)
- Review the [troubleshooting guide](../docs/TROUBLESHOOTING.md)
- Open an issue in the repository

## License

This project is proprietary software. All rights reserved.