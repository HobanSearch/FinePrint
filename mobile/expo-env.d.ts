/// <reference types="expo/types" />

// Add custom global types
declare module '*.svg' {
  import React from 'react'
  import { SvgProps } from 'react-native-svg'
  const content: React.FC<SvgProps>
  export default content
}

declare module '*.png' {
  const value: any
  export default value
}

declare module '*.jpg' {
  const value: any
  export default value
}

declare module '*.jpeg' {
  const value: any
  export default value
}

declare module '*.gif' {
  const value: any
  export default value
}

declare module 'react-native-dotenv' {
  export const API_URL: string
  export const WS_URL: string
  export const SENTRY_DSN: string
  export const ENVIRONMENT: string
}