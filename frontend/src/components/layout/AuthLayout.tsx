import React from 'react'
import { Outlet, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Shield, ArrowLeft } from 'lucide-react'
import { Card, CardContent } from '../ui/Card'
import { Button } from '../ui/Button'
import { useTheme } from '../../stores'

export function AuthLayout() {
  const theme = useTheme()

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background/95 to-muted/20">
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-10 p-6">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          {/* Logo */}
          <Link 
            to="/" 
            className="flex items-center space-x-2 text-foreground hover:text-foreground/80 transition-colors"
          >
            <Shield className="h-8 w-8 text-guardian" />
            <span className="text-xl font-bold">Fine Print AI</span>
          </Link>

          {/* Back to Home */}
          <Button variant="ghost" size="sm" asChild>
            <Link to="/" className="flex items-center space-x-2">
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Home</span>
            </Link>
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex items-center justify-center min-h-screen p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <Card className="shadow-2xl border-0 bg-card/80 backdrop-blur-sm">
            <CardContent className="p-8">
              <Outlet />
            </CardContent>
          </Card>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="absolute bottom-0 left-0 right-0 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center space-x-6 text-sm text-muted-foreground">
            <Link 
              to="/privacy" 
              className="hover:text-foreground transition-colors"
            >
              Privacy Policy
            </Link>
            <span>•</span>
            <Link 
              to="/terms" 
              className="hover:text-foreground transition-colors"
            >
              Terms of Service
            </Link>
            <span>•</span>
            <Link 
              to="/about" 
              className="hover:text-foreground transition-colors"
            >
              About
            </Link>
          </div>
          <div className="mt-2 text-center text-xs text-muted-foreground/60">
            © 2024 Fine Print AI. All rights reserved.
          </div>
        </div>
      </footer>

      {/* Background decoration */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-guardian/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-sage/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary/3 rounded-full blur-3xl" />
      </div>
    </div>
  )
}

export default AuthLayout