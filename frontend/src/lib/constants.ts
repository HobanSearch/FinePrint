// Design system constants aligned with Guardian Sage archetype

export const BRAND_COLORS = {
  guardian: {
    50: '#eff6ff',
    100: '#dbeafe',
    200: '#bfdbfe',
    300: '#93c5fd',
    400: '#60a5fa',
    500: '#2563eb', // Primary guardian blue
    600: '#1d4ed8',
    700: '#1e40af',
    800: '#1e3a8a',
    900: '#1e3a8a',
    950: '#172554',
  },
  sage: {
    50: '#ecfdf5',
    100: '#d1fae5',
    200: '#a7f3d0',
    300: '#6ee7b7',
    400: '#34d399',
    500: '#10b981', // Primary sage green
    600: '#059669',
    700: '#047857',
    800: '#065f46',
    900: '#064e3b',
    950: '#022c22',
  },
  alert: {
    50: '#fffbeb',
    100: '#fef3c7',
    200: '#fde68a',
    300: '#fcd34d',
    400: '#fbbf24',
    500: '#f59e0b', // Alert orange
    600: '#d97706',
    700: '#b45309',
    800: '#92400e',
    900: '#78350f',
    950: '#451a03',
  },
  danger: {
    50: '#fef2f2',
    100: '#fee2e2',
    200: '#fecaca',
    300: '#fca5a5',
    400: '#f87171',
    500: '#ef4444', // Danger red
    600: '#dc2626',
    700: '#b91c1c',
    800: '#991b1b',
    900: '#7f1d1d',
    950: '#450a0a',
  },
} as const

export const SEMANTIC_COLORS = {
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',
} as const

export const RISK_LEVELS = {
  MINIMAL: { score: [0, 20], color: 'sage', label: 'Minimal Risk' },
  LOW: { score: [20, 40], color: 'sage', label: 'Low Risk' },
  MEDIUM: { score: [40, 60], color: 'alert', label: 'Medium Risk' },
  HIGH: { score: [60, 80], color: 'alert', label: 'High Risk' },
  CRITICAL: { score: [80, 100], color: 'danger', label: 'Critical Risk' },
} as const

export const ANIMATION_VARIANTS = {
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
  slideUp: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
  },
  slideDown: {
    initial: { opacity: 0, y: -20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 20 },
  },
  slideLeft: {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
  },
  slideRight: {
    initial: { opacity: 0, x: -20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 20 },
  },
  scale: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
  },
  bounce: {
    initial: { opacity: 0, scale: 0.3 },
    animate: { 
      opacity: 1, 
      scale: 1,
      transition: {
        type: "spring",
        stiffness: 400,
        damping: 10
      }
    },
    exit: { opacity: 0, scale: 0.3 },
  },
} as const

export const FONT_WEIGHTS = {
  light: 300,
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800,
  black: 900,
} as const

export const SPACING = {
  xs: '0.5rem',    // 8px
  sm: '0.75rem',   // 12px
  md: '1rem',      // 16px
  lg: '1.5rem',    // 24px
  xl: '2rem',      // 32px
  '2xl': '3rem',   // 48px
  '3xl': '4rem',   // 64px
  '4xl': '6rem',   // 96px
} as const

export const BORDER_RADIUS = {
  none: '0',
  sm: '0.125rem',
  md: '0.375rem',
  lg: '0.5rem',
  xl: '0.75rem',
  '2xl': '1rem',
  '3xl': '1.5rem',
  full: '9999px',
} as const

export const SHADOWS = {
  soft: '0 2px 15px -3px rgba(0, 0, 0, 0.07), 0 10px 20px -2px rgba(0, 0, 0, 0.04)',
  medium: '0 4px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
  strong: '0 10px 40px -10px rgba(0, 0, 0, 0.15), 0 2px 10px -2px rgba(0, 0, 0, 0.04)',
  glowGuardian: '0 0 0 1px rgba(37, 99, 235, 0.1), 0 0 20px rgba(37, 99, 235, 0.1)',
  glowSage: '0 0 0 1px rgba(16, 185, 129, 0.1), 0 0 20px rgba(16, 185, 129, 0.1)',
  glowDanger: '0 0 0 1px rgba(239, 68, 68, 0.1), 0 0 20px rgba(239, 68, 68, 0.1)',
} as const

export const BREAKPOINTS = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const

export const Z_INDEX = {
  hide: -1,
  auto: 'auto',
  base: 0,
  docked: 10,
  dropdown: 1000,
  sticky: 1100,
  banner: 1200,
  overlay: 1300,
  modal: 1400,
  popover: 1500,
  skipLink: 1600,
  toast: 1700,
  tooltip: 1800,
} as const

export const DOCUMENT_TYPES = {
  TOS: 'Terms of Service',
  PRIVACY: 'Privacy Policy',
  EULA: 'End User License Agreement',
  COOKIE: 'Cookie Policy',
  DPA: 'Data Processing Agreement',
  SLA: 'Service Level Agreement',
  OTHER: 'Other Legal Document',
} as const

export const PATTERN_CATEGORIES = {
  DATA_COLLECTION: 'Data Collection',
  DATA_SHARING: 'Data Sharing',  
  USER_RIGHTS: 'User Rights',
  LIABILITY: 'Liability',
  TERMINATION: 'Termination',
  PAYMENT: 'Payment & Billing',
  CONTENT: 'Content & IP',
  DISPUTE_RESOLUTION: 'Dispute Resolution',
  CHANGES: 'Policy Changes',
  SECURITY: 'Security',
} as const

export const ACTION_TYPES = {
  OPT_OUT: 'Opt Out',
  DATA_REQUEST: 'Data Request',
  ACCOUNT_DELETION: 'Account Deletion',
  ARBITRATION_OPT_OUT: 'Arbitration Opt-Out',
  UNSUBSCRIBE: 'Unsubscribe',
  COMPLAINT: 'File Complaint',
  REVIEW: 'Leave Review',
} as const