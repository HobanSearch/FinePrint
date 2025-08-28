import React from 'react'
import { motion } from 'framer-motion'
import { Shield, Loader2 } from 'lucide-react'

interface LoadingPageProps {
  message?: string
  showLogo?: boolean
}

export function LoadingPage({ 
  message = 'Loading...', 
  showLogo = true 
}: LoadingPageProps) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-6">
        {showLogo && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="flex items-center justify-center space-x-2 mb-8"
          >
            <Shield className="h-12 w-12 text-guardian" />
            <span className="text-2xl font-bold text-foreground">Fine Print AI</span>
          </motion.div>
        )}

        <div className="flex items-center justify-center space-x-3">
          <Loader2 className="h-6 w-6 animate-spin text-guardian" />
          <p className="text-lg text-muted-foreground">{message}</p>
        </div>

        {/* Progress indicator */}
        <div className="w-64 mx-auto">
          <div className="h-1 bg-muted rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-guardian to-sage"
              initial={{ width: 0 }}
              animate={{ width: '100%' }}
              transition={{
                duration: 2,
                repeat: Infinity,
                repeatType: 'reverse',
                ease: 'easeInOut'
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default LoadingPage