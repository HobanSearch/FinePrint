/**
 * App Shell Component for Fine Print AI
 * Provides instant loading skeleton and progressive enhancement
 */

import { ReactNode, Suspense, useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Helmet } from 'react-helmet-async'
import { 
  Menu, 
  Bell, 
  Settings, 
  User, 
  Search, 
  Upload,
  FileText,
  BarChart3,
  Shield,
  Wifi,
  WifiOff
} from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { OfflineStatusBadge } from '@/components/pwa/OfflineIndicator'
import { UpdateNotification } from '@/components/pwa/UpdateBanner'
import { InlineInstallSuggestion } from '@/components/pwa/InstallPrompt'
import { usePWAStatus, usePWAFeatures } from '@/components/providers/PWAProvider'
import { useAuth, useNotifications } from '@/stores'

interface AppShellProps {
  children: ReactNode
  title?: string
  description?: string
  showNavigation?: boolean
  showSidebar?: boolean
  isLoading?: boolean
  className?: string
}

export function AppShell({
  children,
  title = 'Fine Print AI',
  description = 'AI-powered legal document analysis',
  showNavigation = true,
  showSidebar = true,
  isLoading = false,
  className = ''
}: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isShellReady, setIsShellReady] = useState(false)
  
  const { isAuthenticated, user } = useAuth()
  const { unreadCount } = useNotifications()
  const { isOnline, hasUpdate, isInstalled } = usePWAStatus()
  const { isInstallable } = usePWAFeatures()

  useEffect(() => {
    // Simulate shell initialization
    const timer = setTimeout(() => {
      setIsShellReady(true)
    }, 100)
    
    return () => clearTimeout(timer)
  }, [])

  const navigationItems = [
    { icon: FileText, label: 'Dashboard', href: '/dashboard' },
    { icon: Upload, label: 'Upload', href: '/upload' },
    { icon: BarChart3, label: 'Analytics', href: '/analytics' },
    { icon: Settings, label: 'Settings', href: '/settings' }
  ]

  return (
    <div className={`min-h-screen bg-gray-50 ${className}`}>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="theme-color" content="#1e40af" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
        
        {/* PWA optimizations */}
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="FinePrint AI" />
        
        {/* Performance hints */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="dns-prefetch" href="//api.fineprint.ai" />
      </Helmet>

      {/* Navigation Header */}
      {showNavigation && (
        <motion.header
          initial={{ y: -100 }}
          animate={{ y: 0 }}
          className="bg-white border-b border-gray-200 sticky top-0 z-40"
        >
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              {/* Left side */}
              <div className="flex items-center space-x-4">
                {showSidebar && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    className="lg:hidden"
                  >
                    <Menu className="h-5 w-5" />
                  </Button>
                )}
                
                <div className="flex items-center space-x-2">
                  <Shield className="h-8 w-8 text-primary" />
                  <span className="font-bold text-xl text-gray-900">FinePrint AI</span>
                </div>
              </div>

              {/* Center - Search (desktop) */}
              <div className="hidden md:flex flex-1 max-w-lg mx-8">
                <div className="relative w-full">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search documents..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>
              </div>

              {/* Right side */}
              <div className="flex items-center space-x-2">
                {/* PWA Status */}
                <div className="flex items-center space-x-2">
                  <OfflineStatusBadge />
                  {hasUpdate && <UpdateNotification />}
                </div>

                {/* Notifications */}
                {isAuthenticated && (
                  <Button variant="ghost" size="sm" className="relative">
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </Button>
                )}

                {/* User Menu */}
                {isAuthenticated ? (
                  <Button variant="ghost" size="sm">
                    <User className="h-5 w-5" />
                    <span className="hidden sm:ml-2 sm:inline">
                      {user?.name || 'User'}
                    </span>
                  </Button>
                ) : (
                  <Button size="sm">Sign In</Button>
                )}
              </div>
            </div>
          </div>
        </motion.header>
      )}

      <div className="flex h-[calc(100vh-4rem)]">
        {/* Sidebar */}
        {showSidebar && (
          <AnimatePresence>
            {(sidebarOpen || window.innerWidth >= 1024) && (
              <motion.aside
                initial={{ x: -300 }}
                animate={{ x: 0 }}
                exit={{ x: -300 }}
                className="w-64 bg-white border-r border-gray-200 overflow-y-auto lg:static lg:block fixed inset-y-0 left-0 z-30"
              >
                <nav className="mt-8 px-4 space-y-2">
                  {navigationItems.map((item, index) => (
                    <motion.a
                      key={item.href}
                      href={item.href}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="flex items-center px-4 py-2 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <item.icon className="h-5 w-5 mr-3" />
                      {item.label}
                    </motion.a>
                  ))}
                </nav>

                {/* PWA Install Suggestion */}
                {isInstallable && !isInstalled && (
                  <div className="px-4 mt-8">
                    <InlineInstallSuggestion />
                  </div>
                )}

                {/* Connection Status */}
                <div className="px-4 mt-8 pb-4">
                  <div className="flex items-center text-sm text-gray-500">
                    {isOnline ? (
                      <>
                        <Wifi className="h-4 w-4 mr-2 text-green-500" />
                        Connected
                      </>
                    ) : (
                      <>
                        <WifiOff className="h-4 w-4 mr-2 text-red-500" />
                        Offline Mode
                      </>
                    )}
                  </div>
                </div>
              </motion.aside>
            )}
          </AnimatePresence>
        )}

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          <Suspense fallback={<AppShellSkeleton />}>
            <AnimatePresence mode="wait">
              {isLoading ? (
                <AppShellSkeleton />
              ) : (
                <motion.div
                  key="content"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                  className="h-full"
                >
                  {children}
                </motion.div>
              )}
            </AnimatePresence>
          </Suspense>
        </main>
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  )
}

/**
 * App Shell Skeleton for loading states
 */
export function AppShellSkeleton() {
  return (
    <div className="p-6 space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <div className="flex space-x-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
      </div>

      {/* Content skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-48 w-full rounded-lg" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>

      {/* Action skeleton */}
      <div className="flex justify-center space-x-4">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-32" />
      </div>
    </div>
  )
}

/**
 * Minimal App Shell for critical loading
 */
export function MinimalAppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Minimal header */}
      <header className="bg-white border-b border-gray-200 h-16 flex items-center px-4">
        <div className="flex items-center space-x-2">
          <Shield className="h-6 w-6 text-primary" />
          <span className="font-semibold text-gray-900">FinePrint AI</span>
        </div>
      </header>

      {/* Content */}
      <main className="p-6">
        {children}
      </main>
    </div>
  )
}

/**
 * Critical CSS for above-the-fold content
 */
export const criticalCSS = `
  .app-shell-critical {
    min-height: 100vh;
    background-color: #f9fafb;
  }
  
  .app-shell-header {
    background-color: white;
    border-bottom: 1px solid #e5e7eb;
    height: 4rem;
    display: flex;
    align-items: center;
    padding: 0 1rem;
    position: sticky;
    top: 0;
    z-index: 40;
  }
  
  .app-shell-logo {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 600;
    color: #111827;
  }
  
  .app-shell-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: calc(100vh - 4rem);
    color: #6b7280;
  }
`

export default AppShell