/**
 * Fine Print AI - Brand Consistency React Hook
 * 
 * Provides easy access to brand-consistent themes and utilities in React components
 */

import { useEffect, useState, useCallback, useMemo } from 'react'
import { BrandConsistencyService, BrandConsistencyConfig } from '../brand/BrandConsistencyService'
import { BRAND_MESSAGING, BRAND_IDENTITY } from '../brand/BrandSystem'

// =============================================================================
// TYPES
// =============================================================================

interface BrandTheme {
  colors: Record<string, string>
  typography: Record<string, any>
  spacing: Record<string, number | string>
  shadows: Record<string, string>
  borderRadius: Record<string, number | string>
  platform: Record<string, any>
  messaging: typeof BRAND_MESSAGING
  identity: typeof BRAND_IDENTITY
}

interface BrandHookReturn {
  theme: BrandTheme
  config: BrandConsistencyConfig
  updateConfig: (updates: Partial<BrandConsistencyConfig>) => void
  getColor: (colorName: string, shade?: number) => string
  getTypography: (variant: string) => any
  getSpacing: (size: string) => string | number
  getRiskStyling: (risk: 'safe' | 'low' | 'medium' | 'high' | 'critical', element?: string) => any
  validateComponent: (component: any) => { isValid: boolean; violations: string[]; recommendations: string[] }
  generateCSS: () => string
  isLoading: boolean
  error: string | null
}

// =============================================================================
// BRAND CONSISTENCY HOOK
// =============================================================================

/**
 * Main hook for brand consistency
 */
export function useBrandConsistency(
  initialConfig?: Partial<BrandConsistencyConfig>
): BrandHookReturn {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [config, setConfig] = useState<BrandConsistencyConfig>({
    platform: 'web',
    darkMode: false,
    highContrast: false,
    reducedMotion: false,
    fontSize: 'medium',
    ...initialConfig
  })

  // Initialize brand consistency service
  const service = useMemo(() => {
    try {
      return BrandConsistencyService.getInstance(config)
    } catch {
      // If not initialized, create new instance
      return BrandConsistencyService.getInstance(config)
    }
  }, [])

  // Get current theme
  const theme = useMemo(() => {
    try {
      const platformTheme = service.getTheme(config.platform)
      return {
        ...platformTheme,
        messaging: BRAND_MESSAGING,
        identity: BRAND_IDENTITY
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get theme')
      return null
    }
  }, [service, config.platform])

  // Update configuration
  const updateConfig = useCallback((updates: Partial<BrandConsistencyConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }))
    service.updateConfig(updates)
  }, [service])

  // Subscribe to configuration changes
  useEffect(() => {
    const unsubscribe = service.subscribe((newConfig) => {
      setConfig(newConfig)
    })

    setIsLoading(false)
    return unsubscribe
  }, [service])

  // Utility functions
  const getColor = useCallback((colorName: string, shade: number = 500) => {
    if (!theme) return '#000000'
    try {
      return service.getTheme(config.platform).getColor(colorName, shade) || '#000000'
    } catch {
      return '#000000'
    }
  }, [service, theme, config.platform])

  const getTypography = useCallback((variant: string) => {
    if (!theme) return {}
    try {
      return service.getTheme(config.platform).getTypography(variant) || {}
    } catch {
      return {}
    }
  }, [service, theme, config.platform])

  const getSpacing = useCallback((size: string) => {
    if (!theme) return 0
    try {
      return service.getTheme(config.platform).getSpacing(size) || 0
    } catch {
      return 0
    }
  }, [service, theme, config.platform])

  const getRiskStyling = useCallback((
    risk: 'safe' | 'low' | 'medium' | 'high' | 'critical',
    element: string = 'background'
  ) => {
    if (!theme) return {}
    try {
      return service.getTheme(config.platform).getRiskStyling(risk, element) || {}
    } catch {
      return {}
    }
  }, [service, theme, config.platform])

  const validateComponent = useCallback((component: any) => {
    try {
      return service.validateComponent(component)
    } catch {
      return {
        isValid: false,
        violations: ['Validation failed'],
        recommendations: ['Check component structure']
      }
    }
  }, [service])

  const generateCSS = useCallback(() => {
    try {
      return service.generateStyles(config.platform) as string
    } catch {
      return ''
    }
  }, [service, config.platform])

  // Handle loading and error states
  if (isLoading) {
    return {
      theme: {} as BrandTheme,
      config,
      updateConfig,
      getColor: () => '#000000',
      getTypography: () => ({}),
      getSpacing: () => 0,
      getRiskStyling: () => ({}),
      validateComponent: () => ({ isValid: false, violations: [], recommendations: [] }),
      generateCSS: () => '',
      isLoading: true,
      error: null
    }
  }

  if (error || !theme) {
    return {
      theme: {} as BrandTheme,
      config,
      updateConfig,
      getColor: () => '#000000',
      getTypography: () => ({}),
      getSpacing: () => 0,
      getRiskStyling: () => ({}),
      validateComponent: () => ({ isValid: false, violations: [], recommendations: [] }),
      generateCSS: () => '',
      isLoading: false,
      error: error || 'Theme not available'
    }
  }

  return {
    theme,
    config,
    updateConfig,
    getColor,
    getTypography,
    getSpacing,
    getRiskStyling,
    validateComponent,
    generateCSS,
    isLoading: false,
    error: null
  }
}

// =============================================================================
// SPECIALIZED HOOKS
// =============================================================================

/**
 * Hook for brand colors
 */
export function useBrandColors() {
  const { getColor, theme } = useBrandConsistency()
  
  return useMemo(() => ({
    // Primary brand colors
    guardian: {
      50: getColor('guardian', 50),
      100: getColor('guardian', 100),
      200: getColor('guardian', 200),
      300: getColor('guardian', 300),
      400: getColor('guardian', 400),
      500: getColor('guardian', 500),
      600: getColor('guardian', 600),
      700: getColor('guardian', 700),
      800: getColor('guardian', 800),
      900: getColor('guardian', 900),
    },
    sage: {
      50: getColor('sage', 50),
      100: getColor('sage', 100),
      200: getColor('sage', 200),
      300: getColor('sage', 300),
      400: getColor('sage', 400),
      500: getColor('sage', 500),
      600: getColor('sage', 600),
      700: getColor('sage', 700),
      800: getColor('sage', 800),
      900: getColor('sage', 900),
    },
    
    // Risk colors
    risk: {
      safe: getColor('sage', 500),
      low: getColor('sage', 400),
      medium: getColor('alert', 500),
      high: getColor('danger', 500),
      critical: getColor('danger', 600),
    },
    
    // Semantic colors
    primary: getColor('guardian', 500),
    secondary: getColor('sage', 500),
    success: getColor('sage', 500),
    warning: getColor('alert', 500),
    error: getColor('danger', 500),
    info: getColor('guardian', 500),
    
    // Helper function
    get: getColor,
  }), [getColor])
}

/**
 * Hook for brand typography
 */
export function useBrandTypography() {
  const { getTypography } = useBrandConsistency()
  
  return useMemo(() => ({
    display: getTypography('display'),
    h1: getTypography('h1'),
    h2: getTypography('h2'),
    h3: getTypography('h3'),
    h4: getTypography('h4'),
    h5: getTypography('h5'),
    h6: getTypography('h6'),
    body: getTypography('body'),
    bodySmall: getTypography('bodySmall'),
    caption: getTypography('caption'),
    button: getTypography('button'),
    label: getTypography('label'),
    
    // Helper function
    get: getTypography,
  }), [getTypography])
}

/**
 * Hook for brand spacing
 */
export function useBrandSpacing() {
  const { getSpacing, theme } = useBrandConsistency()
  
  return useMemo(() => ({
    xs: getSpacing('1'),    // 4px
    sm: getSpacing('2'),    // 8px
    md: getSpacing('4'),    // 16px
    lg: getSpacing('6'),    // 24px
    xl: getSpacing('8'),    // 32px
    '2xl': getSpacing('12'), // 48px
    '3xl': getSpacing('16'), // 64px
    
    // Helper function
    get: getSpacing,
  }), [getSpacing])
}

/**
 * Hook for risk-based styling
 */
export function useRiskStyling() {
  const { getRiskStyling } = useBrandConsistency()
  
  return useCallback((
    risk: 'safe' | 'low' | 'medium' | 'high' | 'critical',
    element: 'background' | 'border' | 'text' | 'icon' = 'background'
  ) => {
    return getRiskStyling(risk, element)
  }, [getRiskStyling])
}

/**
 * Hook for brand messaging
 */
export function useBrandMessaging() {
  const { theme } = useBrandConsistency()
  
  return useMemo(() => ({
    ...BRAND_MESSAGING,
    
    // Helper functions
    getStatus: (status: 'analyzing' | 'complete' | 'safe' | 'warning' | 'danger' | 'error' | 'empty') => 
      BRAND_MESSAGING.status[status],
    
    getRiskExplanation: (risk: 'safe' | 'low' | 'medium' | 'high' | 'critical') =>
      BRAND_MESSAGING.riskExplanations[risk],
    
    getCTA: (type: 'primary' | 'secondary' | 'emergency' | 'educational' | 'protective') =>
      BRAND_MESSAGING.cta[type],
  }), [theme])
}

/**
 * Hook for platform detection and adaptation
 */
export function usePlatformAdaptation() {
  const { config, updateConfig } = useBrandConsistency()
  
  const [platform, setPlatform] = useState<'web' | 'mobile' | 'extension'>('web')
  
  useEffect(() => {
    // Detect platform
    const userAgent = navigator.userAgent.toLowerCase()
    
    if (userAgent.includes('mobile') || userAgent.includes('android') || userAgent.includes('iphone')) {
      setPlatform('mobile')
    } else if (window.chrome && window.chrome.runtime && window.chrome.runtime.id) {
      setPlatform('extension')
    } else {
      setPlatform('web')
    }
  }, [])
  
  useEffect(() => {
    if (platform !== config.platform) {
      updateConfig({ platform })
    }
  }, [platform, config.platform, updateConfig])
  
  return {
    platform,
    isWeb: platform === 'web',
    isMobile: platform === 'mobile',
    isExtension: platform === 'extension',
    switchPlatform: (newPlatform: 'web' | 'mobile' | 'extension') => {
      setPlatform(newPlatform)
      updateConfig({ platform: newPlatform })
    }
  }
}

// =============================================================================
// THEME PROVIDER HOOK
// =============================================================================

/**
 * Hook for theme provider context
 */
export function useThemeProvider() {
  const { theme, config, updateConfig, generateCSS } = useBrandConsistency()
  
  // Auto-inject CSS for web platform
  useEffect(() => {
    if (config.platform === 'web') {
      const css = generateCSS()
      const styleId = 'brand-consistency-styles'
      
      // Remove existing styles
      const existing = document.getElementById(styleId)
      if (existing) {
        existing.remove()
      }
      
      // Inject new styles
      const style = document.createElement('style')
      style.id = styleId
      style.textContent = css
      document.head.appendChild(style)
      
      return () => {
        const styleElement = document.getElementById(styleId)
        if (styleElement) {
          styleElement.remove()
        }
      }
    }
  }, [config.platform, generateCSS])
  
  // Apply theme attributes to body
  useEffect(() => {
    if (config.platform === 'web') {
      document.body.setAttribute('data-theme', config.darkMode ? 'dark' : 'light')
      document.body.setAttribute('data-contrast', config.highContrast ? 'high' : 'normal')
      document.body.setAttribute('data-font-size', config.fontSize)
      
      return () => {
        document.body.removeAttribute('data-theme')
        document.body.removeAttribute('data-contrast')
        document.body.removeAttribute('data-font-size')
      }
    }
  }, [config])
  
  return {
    theme,
    config,
    updateConfig,
    
    // Theme controls
    toggleDarkMode: () => updateConfig({ darkMode: !config.darkMode }),
    toggleHighContrast: () => updateConfig({ highContrast: !config.highContrast }),
    toggleReducedMotion: () => updateConfig({ reducedMotion: !config.reducedMotion }),
    setFontSize: (fontSize: 'small' | 'medium' | 'large') => updateConfig({ fontSize }),
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default useBrandConsistency

export {
  useBrandConsistency,
  useBrandColors,
  useBrandTypography,
  useBrandSpacing,
  useRiskStyling,
  useBrandMessaging,
  usePlatformAdaptation,
  useThemeProvider,
}