/**
 * Fine Print AI - Unified Design System
 * Complete cross-platform design system for web, mobile, and extension
 */

// =============================================================================
// DESIGN TOKENS
// =============================================================================

export * from './tokens'
export { default as tokens } from './tokens'

// =============================================================================
// THEME SYSTEM
// =============================================================================

export * from './theme'
export { default as theme } from './theme'

// =============================================================================
// THEME PROVIDER
// =============================================================================

export * from './providers/ThemeProvider'
export { ThemeProvider as default } from './providers/ThemeProvider'

// =============================================================================
// PRIMITIVE COMPONENTS
// =============================================================================

export * from './components/primitives/Button'
export * from './components/primitives/Card'
export * from './components/primitives/Badge'

// =============================================================================
// VISUALIZATION COMPONENTS
// =============================================================================

export * from './components/visualizations/RiskVisualization'

// =============================================================================
// ACCESSIBILITY COMPONENTS
// =============================================================================

export * from './components/accessibility'

// =============================================================================
// PLATFORM ADAPTERS
// =============================================================================

export * as ReactNativeAdapter from './adapters/react-native'
export * as ExtensionAdapter from './adapters/extension'

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Generate platform-specific styles based on current platform
 */
export function generatePlatformStyles(platform: 'web' | 'mobile' | 'extension', theme: any) {
  switch (platform) {
    case 'web':
      // Web styles are handled by CSS-in-JS and Tailwind
      return {}
    
    case 'mobile':
      const { createReactNativeTheme } = require('./adapters/react-native')
      return createReactNativeTheme(theme)
    
    case 'extension':
      const { generateExtensionCSS } = require('./adapters/extension')
      return generateExtensionCSS(theme)
    
    default:
      return {}
  }
}

/**
 * Get appropriate component for current platform
 */
export function getPlatformComponent(
  componentName: string, 
  platform: 'web' | 'mobile' | 'extension'
) {
  switch (platform) {
    case 'web':
      // Return React components
      switch (componentName) {
        case 'Button':
          return require('./components/primitives/Button').Button
        case 'Card':
          return require('./components/primitives/Card').Card
        case 'Badge':
          return require('./components/primitives/Badge').Badge
        case 'RiskGauge':
          return require('./components/visualizations/RiskVisualization').RiskGauge
        default:
          return null
      }
    
    case 'mobile':
      // Return React Native component creators
      switch (componentName) {
        case 'Button':
          return require('./adapters/react-native').createReactNativeButton
        case 'Badge':
          return require('./adapters/react-native').createReactNativeBadge
        default:
          return null
      }
    
    case 'extension':
      // Return HTML generators
      switch (componentName) {
        case 'Button':
          return require('./adapters/extension').createExtensionButton
        case 'Badge':
          return require('./adapters/extension').createExtensionBadge
        case 'Card':
          return require('./adapters/extension').createExtensionCard
        default:
          return null
      }
    
    default:
      return null
  }
}

/**
 * Initialize design system for specific platform
 */
export function initializeDesignSystem(
  platform: 'web' | 'mobile' | 'extension',
  options: {
    theme?: any
    darkMode?: boolean
    highContrast?: boolean
    reducedMotion?: boolean
  } = {}
) {
  const { theme: defaultTheme } = require('./theme')
  const activeTheme = options.theme || defaultTheme

  switch (platform) {
    case 'web':
      // Web initialization is handled by ThemeProvider
      return {
        ThemeProvider: require('./providers/ThemeProvider').ThemeProvider,
        theme: activeTheme,
      }
    
    case 'mobile':
      const { createReactNativeTheme } = require('./adapters/react-native')
      return {
        theme: createReactNativeTheme(activeTheme),
      }
    
    case 'extension':
      const { generateExtensionCSS, injectCSS } = require('./adapters/extension')
      const css = generateExtensionCSS(activeTheme)
      
      // Auto-inject CSS if in browser environment
      if (typeof document !== 'undefined') {
        injectCSS(css)
      }
      
      return {
        css,
        theme: activeTheme,
        injectCSS: () => injectCSS(css),
      }
    
    default:
      return { theme: activeTheme }
  }
}

// =============================================================================
// DESIGN SYSTEM CONFIGURATION
// =============================================================================

export interface DesignSystemConfig {
  platform: 'web' | 'mobile' | 'extension'
  theme?: any
  darkMode?: boolean
  highContrast?: boolean
  reducedMotion?: boolean
  customTokens?: Record<string, any>
}

/**
 * Create configured design system instance
 */
export function createDesignSystem(config: DesignSystemConfig) {
  const {
    platform,
    theme: customTheme,
    darkMode = false,
    highContrast = false,
    reducedMotion = false,
    customTokens = {},
  } = config

  // Merge custom tokens with default tokens
  const { tokens: defaultTokens } = require('./tokens')
  const mergedTokens = {
    ...defaultTokens,
    ...customTokens,
  }

  // Initialize for platform
  const initialization = initializeDesignSystem(platform, {
    theme: customTheme,
    darkMode,
    highContrast,
    reducedMotion,
  })

  return {
    tokens: mergedTokens,
    platform,
    ...initialization,
    
    // Utility methods
    getComponent: (name: string) => getPlatformComponent(name, platform),
    generateStyles: (theme: any) => generatePlatformStyles(platform, theme),
    
    // Platform checks
    isWeb: platform === 'web',
    isMobile: platform === 'mobile',
    isExtension: platform === 'extension',
  }
}

// =============================================================================
// VERSION INFO
// =============================================================================

export const VERSION = '1.0.0'
export const DESIGN_SYSTEM_NAME = 'Fine Print AI Design System'

// =============================================================================
// DEFAULT EXPORT
// =============================================================================

export default {
  tokens,
  theme,
  ThemeProvider: require('./providers/ThemeProvider').ThemeProvider,
  
  // Components
  Button: require('./components/primitives/Button').Button,
  Card: require('./components/primitives/Card').Card,
  Badge: require('./components/primitives/Badge').Badge,
  RiskGauge: require('./components/visualizations/RiskVisualization').RiskGauge,
  
  // Utilities
  createDesignSystem,
  initializeDesignSystem,
  getPlatformComponent,
  generatePlatformStyles,
  
  // Meta
  VERSION,
  DESIGN_SYSTEM_NAME,
}