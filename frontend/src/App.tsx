import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { HelmetProvider } from 'react-helmet-async'
import { ErrorBoundary } from 'react-error-boundary'
import { Toaster } from 'sonner'

import { AppRouter } from './components/routing/AppRouter'
import { NotificationProvider } from './components/providers/NotificationProvider'
import { PWAProvider } from './components/providers/PWAProvider'
import { ErrorFallback } from './components/ui/ErrorFallback'
import { LoadingPage } from './components/ui/LoadingPage'
import { queryClient, restoreCache } from './lib/query-client'
import { initializeStore } from './stores'
import { getPerformanceUtils } from './lib/performance'

// Global error handler
const globalErrorHandler = (error: Error, errorInfo: any) => {
  console.error('Global error:', error, errorInfo)
  
  // In production, send to error reporting service
  if (import.meta.env.PROD) {
    // Send to error reporting service like Sentry
    // sentry.captureException(error, { extra: errorInfo })
  }
}

function App() {
  const [isInitialized, setIsInitialized] = React.useState(false)
  const [initError, setInitError] = React.useState<Error | null>(null)

  React.useEffect(() => {
    const initialize = async () => {
      try {
        // Mark performance start
        if ('performance' in window) {
          performance.mark('app-init-start')
        }

        // Restore cached queries first
        await restoreCache()

        // Initialize the store
        await initializeStore()

        setIsInitialized(true)

        // Mark performance end
        if ('performance' in window) {
          performance.mark('app-init-end')
          try {
            performance.measure('app-initialization', 'app-init-start', 'app-init-end')
            const measure = performance.getEntriesByName('app-initialization')[0]
            console.log(`App initialization took ${measure.duration.toFixed(2)}ms`)
          } catch (e) {
            // Ignore performance measurement errors
          }
        }

      } catch (error) {
        console.error('App initialization failed:', error)
        setInitError(error as Error)
        setIsInitialized(true) // Still mark as initialized to show error
      }
    }

    initialize()
  }, [])

  // Show loading screen during initialization
  if (!isInitialized) {
    return <LoadingPage message="Initializing application..." />
  }

  // Show error screen if initialization failed
  if (initError) {
    return (
      <ErrorFallback
        error={initError}
        resetErrorBoundary={() => {
          setInitError(null)
          window.location.reload()
        }}
      />
    )
  }

  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onError={globalErrorHandler}
      onReset={() => {
        // Clear any cached data and reload
        queryClient.clear()
        window.location.reload()
      }}
    >
      <HelmetProvider>
        <QueryClientProvider client={queryClient}>
          <PWAProvider
            config={{
              enableInstallPrompt: true,
              enableUpdateBanner: true,
              enableOfflineIndicator: true,
              enablePushNotifications: true,
              vapidPublicKey: import.meta.env.VITE_VAPID_PUBLIC_KEY,
              autoInitialize: true,
              showOnboarding: false
            }}
          >
            <NotificationProvider>
              {/* Main App Router */}
              <AppRouter />

              {/* Global Toast Notifications */}
              <Toaster
                position="top-right"
                toastOptions={{
                  duration: 4000,
                  className: 'font-sans',
                }}
                visibleToasts={5}
                closeButton
                richColors
              />

              {/* React Query DevTools (development only) */}
              {import.meta.env.DEV && (
                <ReactQueryDevtools
                  initialIsOpen={false}
                  position="bottom-right"
                  buttonPosition="bottom-right"
                />
              )}
            </NotificationProvider>
          </PWAProvider>
        </QueryClientProvider>
      </HelmetProvider>
    </ErrorBoundary>
  )
}

export default App