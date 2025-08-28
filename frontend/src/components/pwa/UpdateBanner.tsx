/**
 * PWA Update Banner Component
 * Handles service worker updates and app versioning
 */

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { RefreshCw, X, Download, AlertCircle, CheckCircle } from 'lucide-react'
import { useUpdateBanner } from '@/hooks/usePWA'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Progress } from '@/components/ui/Progress'

interface UpdateBannerProps {
  variant?: 'banner' | 'modal' | 'toast'
  position?: 'top' | 'bottom'
  autoShow?: boolean
  showProgress?: boolean
  className?: string
}

export function UpdateBanner({ 
  variant = 'banner',
  position = 'top',
  autoShow = true,
  showProgress = true,
  className = ''
}: UpdateBannerProps) {
  const { shouldShow, isUpdating, update } = useUpdateBanner()
  const [isVisible, setIsVisible] = useState(false)
  const [updateProgress, setUpdateProgress] = useState(0)
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'downloading' | 'installing' | 'complete' | 'error'>('idle')

  useEffect(() => {
    if (autoShow && shouldShow) {
      setIsVisible(true)
    }
  }, [shouldShow, autoShow])

  useEffect(() => {
    if (isUpdating) {
      setUpdateStatus('downloading')
      
      // Simulate progress for better UX
      const progressInterval = setInterval(() => {
        setUpdateProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval)
            setUpdateStatus('installing')
            return 90
          }
          return prev + Math.random() * 10
        })
      }, 200)

      return () => clearInterval(progressInterval)
    }
  }, [isUpdating])

  const handleUpdate = async () => {
    setUpdateStatus('downloading')
    setUpdateProgress(0)
    
    try {
      await update()
      setUpdateStatus('complete')
      setUpdateProgress(100)
      
      // Auto-hide after success
      setTimeout(() => {
        setIsVisible(false)
      }, 2000)
    } catch (error) {
      console.error('Update failed:', error)
      setUpdateStatus('error')
    }
  }

  const handleDismiss = () => {
    setIsVisible(false)
  }

  if (!shouldShow || !isVisible) return null

  const getStatusIcon = () => {
    switch (updateStatus) {
      case 'downloading':
        return (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          >
            <Download className="h-5 w-5" />
          </motion.div>
        )
      case 'installing':
        return (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          >
            <RefreshCw className="h-5 w-5" />
          </motion.div>
        )
      case 'complete':
        return <CheckCircle className="h-5 w-5 text-green-500" />
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-500" />
      default:
        return <RefreshCw className="h-5 w-5" />
    }
  }

  const getStatusText = () => {
    switch (updateStatus) {
      case 'downloading':
        return 'Downloading update...'
      case 'installing':
        return 'Installing update...'
      case 'complete':
        return 'Update complete! Reloading...'
      case 'error':
        return 'Update failed. Please try again.'
      default:
        return 'A new version is available'
    }
  }

  const getStatusDescription = () => {
    switch (updateStatus) {
      case 'downloading':
        return 'Please wait while we download the latest version'
      case 'installing':
        return 'Almost done! Installing the new features'
      case 'complete':
        return 'Success! The app will reload automatically'
      case 'error':
        return 'Something went wrong during the update'
      default:
        return 'Update now to get the latest features and improvements'
    }
  }

  if (variant === 'toast') {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, x: 300 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 300 }}
          className={`fixed top-4 right-4 z-50 ${className}`}
        >
          <Card className="p-4 max-w-sm bg-white shadow-lg border-primary/20">
            <div className="flex items-start space-x-3">
              <div className="bg-primary/10 p-2 rounded-lg text-primary">
                {getStatusIcon()}
              </div>
              
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm">{getStatusText()}</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {getStatusDescription()}
                </p>
                
                {showProgress && (updateStatus === 'downloading' || updateStatus === 'installing') && (
                  <Progress value={updateProgress} className="mt-2 h-1" />
                )}
                
                {updateStatus === 'idle' && (
                  <div className="flex space-x-2 mt-3">
                    <Button
                      size="sm"
                      onClick={handleUpdate}
                      className="h-7 text-xs"
                    >
                      Update
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleDismiss}
                      className="h-7 text-xs"
                    >
                      Later
                    </Button>
                  </div>
                )}
              </div>
              
              {updateStatus === 'idle' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDismiss}
                  className="h-6 w-6 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </Card>
        </motion.div>
      </AnimatePresence>
    )
  }

  if (variant === 'modal') {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-white rounded-lg shadow-xl max-w-md w-full"
          >
            <div className="p-6">
              <div className="text-center">
                <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4 text-primary">
                  {getStatusIcon()}
                </div>
                
                <h2 className="text-xl font-bold mb-2">{getStatusText()}</h2>
                <p className="text-muted-foreground mb-6">
                  {getStatusDescription()}
                </p>

                {showProgress && (updateStatus === 'downloading' || updateStatus === 'installing') && (
                  <div className="mb-6">
                    <Progress value={updateProgress} className="mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {Math.round(updateProgress)}% complete
                    </p>
                  </div>
                )}
              </div>

              {updateStatus === 'idle' && (
                <div className="flex space-x-3">
                  <Button
                    onClick={handleUpdate}
                    className="flex-1"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Update Now
                  </Button>
                  
                  <Button variant="outline" onClick={handleDismiss}>
                    Later
                  </Button>
                </div>
              )}

              {updateStatus === 'error' && (
                <div className="flex space-x-3">
                  <Button
                    onClick={handleUpdate}
                    className="flex-1"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Retry
                  </Button>
                  
                  <Button variant="outline" onClick={handleDismiss}>
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    )
  }

  // Default banner variant
  const getPositionClasses = () => {
    switch (position) {
      case 'bottom':
        return 'bottom-0 left-0 right-0'
      case 'top':
      default:
        return 'top-0 left-0 right-0'
    }
  }

  const getBannerColor = () => {
    switch (updateStatus) {
      case 'complete':
        return 'bg-gradient-to-r from-green-500 to-green-600'
      case 'error':
        return 'bg-gradient-to-r from-red-500 to-red-600'
      case 'downloading':
      case 'installing':
        return 'bg-gradient-to-r from-blue-500 to-blue-600'
      default:
        return 'bg-gradient-to-r from-primary to-primary/80'
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: position === 'top' ? -100 : 100 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: position === 'top' ? -100 : 100 }}
        className={`fixed ${getPositionClasses()} z-50 ${className}`}
      >
        <div className={`${getBannerColor()} text-white shadow-lg`}>
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="bg-white/20 p-2 rounded-lg">
                  {getStatusIcon()}
                </div>
                
                <div className="flex-1">
                  <h3 className="font-semibold text-sm">
                    {getStatusText()}
                  </h3>
                  <p className="text-xs text-white/80">
                    {getStatusDescription()}
                  </p>
                  
                  {showProgress && (updateStatus === 'downloading' || updateStatus === 'installing') && (
                    <div className="mt-2">
                      <Progress 
                        value={updateProgress} 
                        className="h-1 bg-white/20"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center space-x-3">
                {updateStatus === 'idle' && (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleUpdate}
                      className="bg-white text-primary hover:bg-white/90"
                    >
                      Update
                    </Button>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleDismiss}
                      className="text-white hover:bg-white/20 h-8 w-8 p-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                )}

                {updateStatus === 'error' && (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleUpdate}
                      className="bg-white text-red-600 hover:bg-white/90"
                    >
                      Retry
                    </Button>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleDismiss}
                      className="text-white hover:bg-white/20 h-8 w-8 p-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

/**
 * Simple update notification for use in status bars
 */
export function UpdateNotification({ className = '' }: { className?: string }) {
  const { shouldShow, update } = useUpdateBanner()
  const [isUpdating, setIsUpdating] = useState(false)

  if (!shouldShow) return null

  const handleUpdate = async () => {
    setIsUpdating(true)
    try {
      await update()
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      className={`inline-flex items-center space-x-2 ${className}`}
    >
      <Button
        size="sm"
        variant="outline"
        onClick={handleUpdate}
        disabled={isUpdating}
        className="h-7 text-xs border-primary text-primary hover:bg-primary hover:text-white"
      >
        {isUpdating ? (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="mr-1"
          >
            <RefreshCw className="h-3 w-3" />
          </motion.div>
        ) : (
          <RefreshCw className="h-3 w-3 mr-1" />
        )}
        {isUpdating ? 'Updating...' : 'Update Available'}
      </Button>
    </motion.div>
  )
}

export default UpdateBanner