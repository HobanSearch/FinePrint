/**
 * PWA Install Prompt Component
 * Handles app installation prompts and onboarding
 */

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, X, Smartphone, Monitor, Zap, Shield, Wifi, ChevronRight } from 'lucide-react'
import { useInstallBanner } from '@/hooks/usePWA'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

interface InstallPromptProps {
  showFeatures?: boolean
  autoShow?: boolean
  variant?: 'banner' | 'modal' | 'toast'
  position?: 'top' | 'bottom' | 'center'
  className?: string
}

export function InstallPrompt({ 
  showFeatures = true,
  autoShow = true,
  variant = 'banner',
  position = 'bottom',
  className = ''
}: InstallPromptProps) {
  const { shouldShow, install, dismiss } = useInstallBanner()
  const [isVisible, setIsVisible] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [isInstalling, setIsInstalling] = useState(false)

  useEffect(() => {
    if (autoShow && shouldShow) {
      // Show after a short delay to avoid being intrusive
      const timer = setTimeout(() => {
        setIsVisible(true)
      }, 3000)
      
      return () => clearTimeout(timer)
    }
  }, [shouldShow, autoShow])

  const handleInstall = async () => {
    setIsInstalling(true)
    
    try {
      const success = await install()
      
      if (success) {
        setIsVisible(false)
        // Show success message
        setTimeout(() => {
          // You could trigger a success notification here
        }, 1000)
      }
    } catch (error) {
      console.error('Installation failed:', error)
    } finally {
      setIsInstalling(false)
    }
  }

  const handleDismiss = () => {
    setIsVisible(false)
    dismiss()
  }

  if (!shouldShow || !isVisible) return null

  const features = [
    {
      icon: <Zap className="h-5 w-5" />,
      title: 'Lightning Fast',
      description: 'Instant loading and smooth performance'
    },
    {
      icon: <Wifi className="h-5 w-5" />,
      title: 'Works Offline',
      description: 'Analyze documents even without internet'
    },
    {
      icon: <Shield className="h-5 w-5" />,
      title: 'Secure & Private',
      description: 'Your data stays on your device'
    },
    {
      icon: <Smartphone className="h-5 w-5" />,
      title: 'Native Experience',
      description: 'App-like experience on any device'
    }
  ]

  if (variant === 'toast') {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, x: 300 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 300 }}
          className={`fixed top-4 right-4 z-50 ${className}`}
        >
          <Card className="p-4 max-w-sm bg-white shadow-lg border">
            <div className="flex items-start space-x-3">
              <div className="bg-primary/10 p-2 rounded-lg">
                <Download className="h-5 w-5 text-primary" />
              </div>
              
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm">Install Fine Print AI</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Get the app for faster access and offline support
                </p>
                
                <div className="flex space-x-2 mt-3">
                  <Button
                    size="sm"
                    onClick={handleInstall}
                    disabled={isInstalling}
                    className="h-7 text-xs"
                  >
                    {isInstalling ? 'Installing...' : 'Install'}
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
              </div>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDismiss}
                className="h-6 w-6 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
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
          onClick={handleDismiss}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-white rounded-lg shadow-xl max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="text-center">
                <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                  <Download className="h-8 w-8 text-primary" />
                </div>
                
                <h2 className="text-xl font-bold mb-2">Install Fine Print AI</h2>
                <p className="text-muted-foreground mb-6">
                  Get the full app experience with offline support and faster loading
                </p>
              </div>

              {showFeatures && (
                <div className="space-y-3 mb-6">
                  {features.map((feature, index) => (
                    <div key={index} className="flex items-center space-x-3">
                      <div className="text-primary">{feature.icon}</div>
                      <div className="flex-1">
                        <h4 className="font-medium text-sm">{feature.title}</h4>
                        <p className="text-xs text-muted-foreground">{feature.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex space-x-3">
                <Button
                  onClick={handleInstall}
                  disabled={isInstalling}
                  className="flex-1"
                >
                  {isInstalling ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="mr-2"
                      >
                        <Download className="h-4 w-4" />
                      </motion.div>
                      Installing...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Install App
                    </>
                  )}
                </Button>
                
                <Button variant="outline" onClick={handleDismiss}>
                  Not Now
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    )
  }

  // Default banner variant
  const getPositionClasses = () => {
    switch (position) {
      case 'top':
        return 'top-0 left-0 right-0'
      case 'center':
        return 'top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2'
      case 'bottom':
      default:
        return 'bottom-0 left-0 right-0'
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
        <div className="bg-gradient-to-r from-primary to-primary/80 text-white shadow-lg">
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="bg-white/20 p-2 rounded-lg">
                  <Download className="h-5 w-5" />
                </div>
                
                <div className="flex-1">
                  <h3 className="font-semibold text-sm">
                    Install Fine Print AI
                  </h3>
                  <p className="text-xs text-white/80">
                    Get the app for offline access and better performance
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                {showFeatures && (
                  <div className="hidden md:flex items-center space-x-4">
                    {features.slice(0, 2).map((feature, index) => (
                      <div key={index} className="flex items-center space-x-2">
                        <div className="text-white/80">{feature.icon}</div>
                        <span className="text-xs font-medium">{feature.title}</span>
                      </div>
                    ))}
                  </div>
                )}

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleInstall}
                  disabled={isInstalling}
                  className="bg-white text-primary hover:bg-white/90"
                >
                  {isInstalling ? 'Installing...' : 'Install'}
                </Button>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDismiss}
                  className="text-white hover:bg-white/20 h-8 w-8 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

/**
 * Guided onboarding for PWA features
 */
export function PWAOnboarding({ onComplete }: { onComplete?: () => void }) {
  const [currentStep, setCurrentStep] = useState(0)
  const [isVisible, setIsVisible] = useState(true)

  const steps = [
    {
      title: 'Welcome to Fine Print AI',
      description: 'Your AI-powered legal document analyzer',
      icon: <Shield className="h-8 w-8" />,
      content: 'Analyze Terms of Service, Privacy Policies, and contracts with AI-powered insights.'
    },
    {
      title: 'Works Offline',
      description: 'Analyze documents even without internet',
      icon: <Wifi className="h-8 w-8" />,
      content: 'Your documents are processed locally for privacy and speed, even when offline.'
    },
    {
      title: 'Install for Best Experience',
      description: 'Add to your home screen for app-like experience',
      icon: <Smartphone className="h-8 w-8" />,
      content: 'Installing the app gives you faster loading, push notifications, and offline access.'
    }
  ]

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      setIsVisible(false)
      onComplete?.()
    }
  }

  const handleSkip = () => {
    setIsVisible(false)
    onComplete?.()
  }

  if (!isVisible) return null

  const currentStepData = steps[currentStep]

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      >
        <motion.div
          key={currentStep}
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-white rounded-lg shadow-xl max-w-md w-full"
        >
          <div className="p-6 text-center">
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4 text-primary">
              {currentStepData.icon}
            </div>
            
            <h2 className="text-xl font-bold mb-2">{currentStepData.title}</h2>
            <p className="text-muted-foreground mb-2">{currentStepData.description}</p>
            <p className="text-sm text-muted-foreground mb-6">{currentStepData.content}</p>

            {/* Step Indicators */}
            <div className="flex justify-center space-x-2 mb-6">
              {steps.map((_, index) => (
                <div
                  key={index}
                  className={`h-2 w-8 rounded-full transition-colors ${
                    index === currentStep ? 'bg-primary' : 'bg-gray-200'
                  }`}
                />
              ))}
            </div>

            <div className="flex space-x-3">
              <Button variant="outline" onClick={handleSkip} className="flex-1">
                Skip
              </Button>
              
              <Button onClick={handleNext} className="flex-1">
                {currentStep === steps.length - 1 ? (
                  'Get Started'
                ) : (
                  <>
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

/**
 * Inline install suggestion for use in components
 */
export function InlineInstallSuggestion({ className = '' }: { className?: string }) {
  const { shouldShow, install, dismiss } = useInstallBanner()
  const [isInstalling, setIsInstalling] = useState(false)

  if (!shouldShow) return null

  const handleInstall = async () => {
    setIsInstalling(true)
    try {
      await install()
    } finally {
      setIsInstalling(false)
    }
  }

  return (
    <Card className={`p-4 border-primary/20 bg-primary/5 ${className}`}>
      <div className="flex items-center space-x-3">
        <div className="text-primary">
          <Download className="h-5 w-5" />
        </div>
        
        <div className="flex-1">
          <h4 className="font-medium text-sm">Install Fine Print AI</h4>
          <p className="text-xs text-muted-foreground">
            Get faster loading and offline access
          </p>
        </div>
        
        <div className="flex space-x-2">
          <Button
            size="sm"
            onClick={handleInstall}
            disabled={isInstalling}
            className="h-7 text-xs"
          >
            {isInstalling ? 'Installing...' : 'Install'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={dismiss}
            className="h-7 text-xs"
          >
            Dismiss
          </Button>
        </div>
      </div>
    </Card>
  )
}

export default InstallPrompt