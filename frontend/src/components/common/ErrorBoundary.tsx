import React from 'react'
import { motion } from 'framer-motion'
import { 
  AlertTriangle, 
  RefreshCw, 
  Home, 
  Bug, 
  Copy, 
  ExternalLink,
  Mail,
  MessageSquare,
  Shield,
  ArrowLeft,
  Download,
  FileText,
  Info
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'

interface ErrorInfo {
  componentStack: string
  errorBoundary?: string
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
  errorId: string
  retryCount: number
}

interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ComponentType<ErrorFallbackProps>
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  resetOnPropsChange?: boolean
  resetKeys?: Array<string | number>
  isolate?: boolean
  level?: 'page' | 'component' | 'critical'
  name?: string
}

interface ErrorFallbackProps {
  error: Error
  errorInfo: ErrorInfo | null
  resetErrorBoundary: () => void
  retry: () => void
  retryCount: number
  errorId: string
  level: 'page' | 'component' | 'critical'
  name?: string
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private resetTimeoutId: number | null = null

  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: '',
      retryCount: 0,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
      errorId: generateErrorId(),
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { onError, name } = this.props
    
    this.setState({ errorInfo })

    // Enhanced error logging
    const enhancedError = {
      ...error,
      name: error.name,
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      userId: this.getUserId(),
      sessionId: this.getSessionId(),
      boundaryName: name,
      componentStack: errorInfo.componentStack,
      retryCount: this.state.retryCount,
    }

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.group('🚨 Error Boundary Caught Error')
      console.error('Error:', error)
      console.error('Error ID:', this.state.errorId)
      console.error('Component Stack:', errorInfo.componentStack)
      console.error('Props:', this.props)
      console.error('Enhanced Error:', enhancedError)
      console.groupEnd()
    }

    // Report to error service
    this.reportError(enhancedError)

    // Call user-provided error handler
    onError?.(error, errorInfo)
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    const { resetOnPropsChange, resetKeys } = this.props
    const { hasError } = this.state

    if (hasError && prevProps.resetKeys !== resetKeys) {
      if (resetOnPropsChange) {
        this.resetErrorBoundary()
      }
    }
  }

  componentWillUnmount() {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId)
    }
  }

  private getUserId = (): string => {
    // Get user ID from your auth system
    return localStorage.getItem('userId') || 'anonymous'
  }

  private getSessionId = (): string => {
    // Get session ID
    return sessionStorage.getItem('sessionId') || 'no-session'
  }

  private generateErrorId = (): string => {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private reportError = async (error: any) => {
    try {
      // In production, send to error reporting service
      if (process.env.NODE_ENV === 'production') {
        await fetch('/api/errors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(error),
        })
      }
    } catch (reportingError) {
      console.error('Failed to report error:', reportingError)
    }
  }

  private resetErrorBoundary = () => {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId)
    }

    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: '',
    })
  }

  private retry = () => {
    this.setState(prevState => ({
      retryCount: prevState.retryCount + 1,
    }))

    // Add a small delay before resetting to prevent rapid retries
    this.resetTimeoutId = window.setTimeout(() => {
      this.resetErrorBoundary()
    }, 100)
  }

  render() {
    const { hasError, error, errorInfo, errorId, retryCount } = this.state
    const { children, fallback: Fallback, level = 'component', name } = this.props

    if (hasError && error) {
      if (Fallback) {
        return (
          <Fallback
            error={error}
            errorInfo={errorInfo}
            resetErrorBoundary={this.resetErrorBoundary}
            retry={this.retry}
            retryCount={retryCount}
            errorId={errorId}
            level={level}
            name={name}
          />
        )
      }

      return (
        <ErrorFallback
          error={error}
          errorInfo={errorInfo}
          resetErrorBoundary={this.resetErrorBoundary}
          retry={this.retry}
          retryCount={retryCount}
          errorId={errorId}
          level={level}
          name={name}
        />
      )
    }

    return children
  }
}

// Default Error Fallback Component
const ErrorFallback: React.FC<ErrorFallbackProps> = ({
  error,
  errorInfo,
  resetErrorBoundary,
  retry,
  retryCount,
  errorId,
  level,
  name,
}) => {
  const [showDetails, setShowDetails] = React.useState(false)
  const [copied, setCopied] = React.useState(false)

  const errorDetails = {
    id: errorId,
    timestamp: new Date().toISOString(),
    error: error.message,
    stack: error.stack,
    componentStack: errorInfo?.componentStack,
    retryCount,
    boundary: name,
    level,
    url: window.location.href,
    userAgent: navigator.userAgent,
  }

  const copyErrorDetails = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(errorDetails, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy error details:', err)
    }
  }

  const reportBug = () => {
    const subject = `Bug Report: ${error.message}`
    const body = `Error ID: ${errorId}\n\nError Details:\n${JSON.stringify(errorDetails, null, 2)}`
    window.open(`mailto:support@fineprint.ai?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`)
  }

  const goHome = () => {
    window.location.href = '/'
  }

  const goBack = () => {
    window.history.back()
  }

  const refresh = () => {
    window.location.reload()
  }

  const getErrorSeverity = () => {
    if (level === 'critical') return 'destructive'
    if (level === 'page') return 'default'
    return 'secondary'
  }

  const getErrorIcon = () => {
    switch (level) {
      case 'critical':
        return <Shield className="w-8 h-8 text-danger-500" />
      case 'page':
        return <AlertTriangle className="w-8 h-8 text-alert-500" />
      default:
        return <Bug className="w-8 h-8 text-guardian-500" />
    }
  }

  const getErrorTitle = () => {
    switch (level) {
      case 'critical':
        return 'Critical System Error'
      case 'page':
        return 'Page Error'
      default:
        return 'Component Error'
    }
  }

  const getErrorDescription = () => {
    switch (level) {
      case 'critical':
        return 'A critical error has occurred that affects core functionality. Our team has been notified.'
      case 'page':
        return 'An error occurred while loading this page. You can try refreshing or navigating elsewhere.'
      default:
        return 'A component encountered an error. This should not affect other parts of the application.'
    }
  }

  return (
    <div className={cn(
      'flex items-center justify-center p-4',
      level === 'critical' && 'min-h-screen bg-danger-50 dark:bg-danger-950',
      level === 'page' && 'min-h-96',
      level === 'component' && 'min-h-48'
    )}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
        className="max-w-2xl w-full"
      >
        <Card className={cn(
          'border-l-4',
          level === 'critical' && 'border-l-danger-500 bg-danger-50 dark:bg-danger-950',
          level === 'page' && 'border-l-alert-500 bg-alert-50 dark:bg-alert-950',
          level === 'component' && 'border-l-guardian-500 bg-guardian-50 dark:bg-guardian-950'
        )}>
          <CardHeader className="text-center pb-4">
            <div className="flex justify-center mb-4">
              {getErrorIcon()}
            </div>
            <CardTitle className="text-xl">
              {getErrorTitle()}
            </CardTitle>
            <p className="text-muted-foreground">
              {getErrorDescription()}
            </p>
            <div className="flex items-center justify-center gap-2 mt-2">
              <Badge variant={getErrorSeverity()} size="sm">
                Error ID: {errorId.slice(-8)}
              </Badge>
              {retryCount > 0 && (
                <Badge variant="outline" size="sm">
                  Retry {retryCount}
                </Badge>
              )}
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Error Message */}
            <div className="p-3 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
              <div className="text-sm font-mono text-danger-600 dark:text-danger-400">
                {error.message}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3 justify-center">
              {level === 'component' && (
                <Button onClick={retry} leftIcon={<RefreshCw className="w-4 h-4" />}>
                  Try Again
                </Button>
              )}
              
              {level === 'page' && (
                <>
                  <Button onClick={refresh} leftIcon={<RefreshCw className="w-4 h-4" />}>
                    Refresh Page
                  </Button>
                  <Button variant="outline" onClick={goBack} leftIcon={<ArrowLeft className="w-4 h-4" />}>
                    Go Back
                  </Button>
                </>
              )}

              {level === 'critical' && (
                <Button onClick={goHome} leftIcon={<Home className="w-4 h-4" />}>
                  Go to Homepage
                </Button>
              )}

              <Button variant="outline" onClick={reportBug} leftIcon={<Mail className="w-4 h-4" />}>
                Report Bug
              </Button>
            </div>

            {/* Error Details Toggle */}
            <div className="border-t pt-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDetails(!showDetails)}
                leftIcon={<Info className="w-4 h-4" />}
                className="w-full"
              >
                {showDetails ? 'Hide' : 'Show'} Technical Details
              </Button>

              {showDetails && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-4 space-y-3"
                >
                  <div className="p-3 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
                    <div className="text-xs font-mono whitespace-pre-wrap text-muted-foreground">
                      {JSON.stringify(errorDetails, null, 2)}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={copyErrorDetails}
                      leftIcon={copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    >
                      {copied ? 'Copied!' : 'Copy Details'}
                    </Button>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const blob = new Blob([JSON.stringify(errorDetails, null, 2)], { type: 'application/json' })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url
                        a.download = `error-${errorId}.json`
                        a.click()
                        URL.revokeObjectURL(url)
                      }}
                      leftIcon={<Download className="w-3 h-3" />}
                    >
                      Download Log
                    </Button>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Help Text */}
            <div className="text-center text-sm text-muted-foreground">
              If this problem persists, please{' '}
              <button
                onClick={reportBug}
                className="text-guardian-600 hover:text-guardian-700 underline"
              >
                contact support
              </button>
              {' '}with the error ID above.
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}

// Utility function to generate error ID
function generateErrorId(): string {
  return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// Higher-order component for wrapping components with error boundaries
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  )

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`
  
  return WrappedComponent
}

// Hook for manual error reporting
export function useErrorHandler() {
  return React.useCallback((error: Error, errorInfo?: { [key: string]: any }) => {
    const errorId = generateErrorId()
    
    const enhancedError = {
      ...error,
      name: error.name,
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      errorId,
      ...errorInfo,
    }

    // Log in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Manual error report:', enhancedError)
    }

    // Report to service
    if (process.env.NODE_ENV === 'production') {
      fetch('/api/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(enhancedError),
      }).catch(reportingError => {
        console.error('Failed to report error:', reportingError)
      })
    }

    return errorId
  }, [])
}

// React Error Boundary Hook (for functional components)
export function useErrorBoundary() {
  const [error, setError] = React.useState<Error | null>(null)

  const resetError = React.useCallback(() => {
    setError(null)
  }, [])

  const captureError = React.useCallback((error: Error) => {
    setError(error)
  }, [])

  React.useEffect(() => {
    if (error) {
      throw error
    }
  }, [error])

  return { captureError, resetError }
}

export default ErrorBoundary