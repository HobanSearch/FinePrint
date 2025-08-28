import React from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react'
import { Button } from './Button'
import { Card, CardContent, CardHeader, CardTitle } from './Card'

interface ErrorFallbackProps {
  error: Error
  resetErrorBoundary: () => void
}

export function ErrorFallback({ error, resetErrorBoundary }: ErrorFallbackProps) {
  const [showDetails, setShowDetails] = React.useState(false)

  const handleReportError = () => {
    // In a real app, this would send the error to an error reporting service
    console.error('Reporting error:', error)
    
    // Create a simple error report
    const errorReport = {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href
    }

    // For now, just copy to clipboard
    navigator.clipboard.writeText(JSON.stringify(errorReport, null, 2))
    alert('Error details copied to clipboard. Please send this to support.')
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <Card className="text-center">
          <CardHeader>
            <div className="flex justify-center mb-4">
              <AlertTriangle className="h-16 w-16 text-destructive" />
            </div>
            <CardTitle className="text-xl text-destructive">
              Something went wrong
            </CardTitle>
          </CardHeader>
          
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              We're sorry, but something unexpected happened. 
              You can try refreshing the page or go back to the homepage.
            </p>

            {/* Error message (simplified for users) */}
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
              <p className="text-sm text-destructive font-mono">
                {error.message || 'An unexpected error occurred'}
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col space-y-2">
              <Button 
                onClick={resetErrorBoundary}
                className="w-full"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>

              <Button 
                variant="outline" 
                onClick={() => window.location.href = '/'}
                className="w-full"
              >
                <Home className="h-4 w-4 mr-2" />
                Go to Homepage
              </Button>

              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setShowDetails(!showDetails)}
                className="w-full"
              >
                <Bug className="h-4 w-4 mr-2" />
                {showDetails ? 'Hide' : 'Show'} Technical Details
              </Button>
            </div>

            {/* Technical details */}
            {showDetails && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 p-3 bg-muted rounded-md text-left"
              >
                <h4 className="text-sm font-semibold mb-2">Technical Details:</h4>
                <pre className="text-xs text-muted-foreground overflow-auto max-h-32 font-mono whitespace-pre-wrap">
                  {error.stack || error.message}
                </pre>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleReportError}
                  className="mt-2 w-full"
                >
                  Copy Error Report
                </Button>
              </motion.div>
            )}

            {/* Support info */}
            <div className="text-xs text-muted-foreground pt-4 border-t border-border">
              <p>
                If this problem persists, please{' '}
                <a 
                  href="mailto:support@fineprintai.com" 
                  className="text-primary hover:underline"
                >
                  contact support
                </a>
                {' '}with the error details above.
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}

// Simplified error fallback for non-critical errors
export function SimpleErrorFallback({ 
  error, 
  resetErrorBoundary 
}: ErrorFallbackProps) {
  return (
    <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-md">
      <div className="flex items-start space-x-3">
        <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-destructive">
            Error Loading Component
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {error.message || 'Something went wrong loading this section.'}
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={resetErrorBoundary}
            className="mt-2 h-auto p-0 text-xs text-primary hover:text-primary/80"
          >
            Try again
          </Button>
        </div>
      </div>
    </div>
  )
}

export default ErrorFallback