/**
 * Offline Indicator Component
 * Shows connection status and offline capabilities
 */

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { WifiOff, Wifi, CloudOff, Cloud, Sync, AlertCircle } from 'lucide-react'
import { useOfflineIndicator } from '@/hooks/usePWA'
import { useOffline } from '@/stores'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'

interface OfflineIndicatorProps {
  className?: string
  showDetails?: boolean
  autoHide?: boolean
  autoHideDelay?: number
}

export function OfflineIndicator({ 
  className = '', 
  showDetails = false,
  autoHide = true,
  autoHideDelay = 5000 
}: OfflineIndicatorProps) {
  const { isOffline, justCameOnline, shouldShowIndicator } = useOfflineIndicator()
  const { 
    connectionQuality, 
    offlineDuration, 
    analysisQueue, 
    syncInProgress, 
    startSync,
    metrics 
  } = useOffline()
  
  const [isVisible, setIsVisible] = useState(shouldShowIndicator)
  const [showFullDetails, setShowFullDetails] = useState(false)

  useEffect(() => {
    setIsVisible(shouldShowIndicator)
    
    if (autoHide && justCameOnline) {
      const timer = setTimeout(() => {
        setIsVisible(false)
      }, autoHideDelay)
      
      return () => clearTimeout(timer)
    }
  }, [shouldShowIndicator, justCameOnline, autoHide, autoHideDelay])

  if (!isVisible) return null

  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`
    return `${seconds}s`
  }

  const getConnectionIcon = () => {
    if (isOffline) return <WifiOff className="h-4 w-4" />
    
    switch (connectionQuality) {
      case 'poor':
        return <Wifi className="h-4 w-4 text-yellow-500" />
      case 'good':
        return <Wifi className="h-4 w-4 text-green-500" />
      default:
        return <Wifi className="h-4 w-4" />
    }
  }

  const getStatusMessage = () => {
    if (justCameOnline) {
      return 'Back online! Syncing data...'
    }
    
    if (isOffline) {
      return `Offline for ${formatDuration(offlineDuration)}`
    }
    
    if (connectionQuality === 'poor') {
      return 'Poor connection detected'
    }
    
    return 'Connected'
  }

  const getStatusColor = () => {
    if (justCameOnline) return 'bg-green-50 border-green-200 text-green-800'
    if (isOffline) return 'bg-red-50 border-red-200 text-red-800'
    if (connectionQuality === 'poor') return 'bg-yellow-50 border-yellow-200 text-yellow-800'
    return 'bg-blue-50 border-blue-200 text-blue-800'
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -50 }}
        transition={{ duration: 0.3 }}
        className={`fixed top-4 right-4 z-50 ${className}`}
      >
        <div className={`
          rounded-lg border shadow-lg p-3 min-w-[280px] max-w-[400px]
          ${getStatusColor()}
        `}>
          {/* Main Status Bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {getConnectionIcon()}
              <span className="font-medium text-sm">
                {getStatusMessage()}
              </span>
            </div>
            
            <div className="flex items-center space-x-2">
              {/* Sync Status */}
              {syncInProgress && (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                >
                  <Sync className="h-4 w-4" />
                </motion.div>
              )}
              
              {/* Queue Status */}
              {analysisQueue.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {analysisQueue.length} queued
                </Badge>
              )}
              
              {/* Expand/Collapse Button */}
              {showDetails && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowFullDetails(!showFullDetails)}
                  className="h-6 w-6 p-0"
                >
                  <motion.div
                    animate={{ rotate: showFullDetails ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <AlertCircle className="h-3 w-3" />
                  </motion.div>
                </Button>
              )}
            </div>
          </div>

          {/* Expanded Details */}
          <AnimatePresence>
            {showFullDetails && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="mt-3 pt-3 border-t border-current/20"
              >
                <div className="space-y-2 text-xs">
                  {/* Connection Quality */}
                  <div className="flex justify-between">
                    <span>Connection Quality:</span>
                    <span className="capitalize font-medium">{connectionQuality}</span>
                  </div>
                  
                  {/* Offline Duration */}
                  {isOffline && (
                    <div className="flex justify-between">
                      <span>Offline Duration:</span>
                      <span className="font-medium">{formatDuration(offlineDuration)}</span>
                    </div>
                  )}
                  
                  {/* Queue Information */}
                  {analysisQueue.length > 0 && (
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span>Pending Analyses:</span>
                        <span className="font-medium">{analysisQueue.length}</span>
                      </div>
                      <div className="text-xs opacity-75">
                        Will sync when connection improves
                      </div>
                    </div>
                  )}
                  
                  {/* Sync Metrics */}
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <div className="text-center">
                      <div className="font-medium">{metrics.pendingOperations}</div>
                      <div className="opacity-75">Pending</div>
                    </div>
                    <div className="text-center">
                      <div className="font-medium">{metrics.failedOperations}</div>
                      <div className="opacity-75">Failed</div>
                    </div>
                  </div>
                  
                  {/* Action Buttons */}
                  <div className="pt-2 flex space-x-2">
                    {!isOffline && analysisQueue.length > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={startSync}
                        disabled={syncInProgress}
                        className="flex-1 h-7 text-xs"
                      >
                        {syncInProgress ? 'Syncing...' : 'Sync Now'}
                      </Button>
                    )}
                    
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setIsVisible(false)}
                      className="h-7 text-xs"
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

/**
 * Simple offline status badge for use in headers or status bars
 */
export function OfflineStatusBadge({ className = '' }: { className?: string }) {
  const { isOffline } = useOfflineIndicator()
  const { connectionQuality, analysisQueue } = useOffline()

  if (!isOffline && connectionQuality === 'good' && analysisQueue.length === 0) {
    return null
  }

  const getVariant = () => {
    if (isOffline) return 'destructive'
    if (connectionQuality === 'poor') return 'warning'
    if (analysisQueue.length > 0) return 'secondary'
    return 'default'
  }

  const getText = () => {
    if (isOffline) return 'Offline'
    if (connectionQuality === 'poor') return 'Poor Connection'
    if (analysisQueue.length > 0) return `${analysisQueue.length} Queued`
    return 'Connected'
  }

  return (
    <Badge variant={getVariant()} className={`text-xs ${className}`}>
      {isOffline ? <WifiOff className="h-3 w-3 mr-1" /> : <CloudOff className="h-3 w-3 mr-1" />}
      {getText()}
    </Badge>
  )
}

/**
 * Floating action button for manual sync
 */
export function SyncFloatingButton({ className = '' }: { className?: string }) {
  const { isOffline } = useOfflineIndicator()
  const { analysisQueue, syncInProgress, startSync } = useOffline()

  if (isOffline || analysisQueue.length === 0) {
    return null
  }

  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      exit={{ scale: 0 }}
      className={`fixed bottom-20 right-4 z-40 ${className}`}
    >
      <Button
        onClick={startSync}
        disabled={syncInProgress}
        className="rounded-full h-14 w-14 shadow-lg bg-primary hover:bg-primary/90"
        title={`Sync ${analysisQueue.length} pending items`}
      >
        <motion.div
          animate={syncInProgress ? { rotate: 360 } : { rotate: 0 }}
          transition={syncInProgress ? { duration: 1, repeat: Infinity, ease: "linear" } : { duration: 0.2 }}
        >
          <Sync className="h-6 w-6" />
        </motion.div>
      </Button>
      
      {analysisQueue.length > 0 && (
        <Badge 
          variant="destructive" 
          className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0 flex items-center justify-center text-xs"
        >
          {analysisQueue.length > 99 ? '99+' : analysisQueue.length}
        </Badge>
      )}
    </motion.div>
  )
}

export default OfflineIndicator