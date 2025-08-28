'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { ArrowRight, Shield, Eye, Zap } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center pt-16 pb-20 overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary-50 via-white to-accent-50 opacity-50" />
      
      {/* Animated background shapes */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          animate={{
            x: [0, 100, 0],
            y: [0, -100, 0],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: 'linear',
          }}
          className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-primary-200 to-transparent rounded-full opacity-20 blur-3xl"
        />
        <motion.div
          animate={{
            x: [0, -100, 0],
            y: [0, 100, 0],
          }}
          transition={{
            duration: 25,
            repeat: Infinity,
            ease: 'linear',
          }}
          className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-accent-200 to-transparent rounded-full opacity-20 blur-3xl"
        />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center rounded-full bg-primary-100 px-4 py-1.5 text-sm font-medium text-primary-700 mb-6"
          >
            <Shield className="mr-2 h-4 w-4" />
            Privacy-First AI Analysis
          </motion.div>

          {/* Main heading */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-5xl sm:text-6xl lg:text-7xl font-display font-bold tracking-tight text-gray-900"
          >
            The Guardian of Your{' '}
            <span className="gradient-text">Digital Rights</span>
          </motion.h1>

          {/* Subheading */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-6 text-xl sm:text-2xl text-gray-600 max-w-3xl mx-auto"
          >
            AI-powered legal document analysis that instantly reveals hidden clauses, 
            privacy risks, and unfair terms in any Terms of Service, Privacy Policy, or EULA.
          </motion.p>

          {/* CTA buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-10 flex flex-col sm:flex-row gap-4 justify-center"
          >
            <Link href="/demo">
              <Button size="xl" variant="gradient" className="group">
                Try Live Demo
                <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
            <Link href="https://app.fineprint.ai">
              <Button size="xl" variant="outline">
                Get Started Free
              </Button>
            </Link>
          </motion.div>

          {/* Features */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-8 max-w-4xl mx-auto"
          >
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 rounded-lg bg-primary-100 flex items-center justify-center mb-4">
                <Zap className="h-6 w-6 text-primary-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Instant Analysis</h3>
              <p className="mt-2 text-gray-600 text-center">
                Get comprehensive insights in under 5 seconds
              </p>
            </div>
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 rounded-lg bg-accent-100 flex items-center justify-center mb-4">
                <Shield className="h-6 w-6 text-accent-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">100% Private</h3>
              <p className="mt-2 text-gray-600 text-center">
                Local AI processing, your data never leaves your device
              </p>
            </div>
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 rounded-lg bg-success-100 flex items-center justify-center mb-4">
                <Eye className="h-6 w-6 text-success-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">50+ Risk Patterns</h3>
              <p className="mt-2 text-gray-600 text-center">
                Detects hidden fees, data sharing, and legal traps
              </p>
            </div>
          </motion.div>

          {/* Trust indicators */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="mt-16 flex flex-col items-center"
          >
            <p className="text-sm text-gray-500 font-medium">
              TRUSTED BY PRIVACY-CONSCIOUS USERS
            </p>
            <div className="mt-4 flex items-center space-x-8">
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-900">50K+</div>
                <div className="text-sm text-gray-600">Active Users</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-900">1M+</div>
                <div className="text-sm text-gray-600">Documents Analyzed</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-900">4.9/5</div>
                <div className="text-sm text-gray-600">User Rating</div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}