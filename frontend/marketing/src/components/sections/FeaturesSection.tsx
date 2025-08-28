'use client'

import { motion } from 'framer-motion'
import {
  Shield,
  Zap,
  Eye,
  Lock,
  Globe,
  Sparkles,
  FileSearch,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react'

const features = [
  {
    title: 'Privacy-First Processing',
    description: 'All analysis happens locally on your device. Your documents never leave your control.',
    icon: Lock,
    gradient: 'from-primary-500 to-primary-600',
  },
  {
    title: 'Lightning Fast Analysis',
    description: 'Get comprehensive results in under 5 seconds, no matter the document length.',
    icon: Zap,
    gradient: 'from-accent-500 to-accent-600',
  },
  {
    title: '50+ Risk Patterns',
    description: 'Detects hidden fees, auto-renewals, data sharing, and legal rights waivers.',
    icon: AlertTriangle,
    gradient: 'from-warning-500 to-warning-600',
  },
  {
    title: 'Plain English Explanations',
    description: 'Complex legal jargon translated into clear, actionable insights anyone can understand.',
    icon: FileSearch,
    gradient: 'from-success-500 to-success-600',
  },
  {
    title: 'Browser Extension',
    description: 'Analyze any website\'s legal documents with a single click, right from your browser.',
    icon: Globe,
    gradient: 'from-primary-500 to-accent-500',
  },
  {
    title: 'AI-Powered Insights',
    description: 'Advanced language models trained on millions of legal documents for accuracy.',
    icon: Sparkles,
    gradient: 'from-accent-500 to-primary-500',
  },
]

export function FeaturesSection() {
  return (
    <section id="features" className="py-20 bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
            Powerful Features for Your Protection
          </h2>
          <p className="mt-4 text-xl text-gray-600 max-w-3xl mx-auto">
            Everything you need to understand and protect your digital rights
          </p>
        </motion.div>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => {
            const Icon = feature.icon
            return (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="group relative"
              >
                <div className="h-full bg-white rounded-2xl p-8 shadow-sm border border-gray-200 hover:shadow-lg transition-all duration-300">
                  {/* Gradient background on hover */}
                  <div className="absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-5 rounded-2xl transition-opacity duration-300"
                    style={{
                      backgroundImage: `linear-gradient(to bottom right, var(--tw-gradient-stops))`,
                    }}
                  />
                  
                  {/* Icon */}
                  <div className="relative">
                    <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-6`}>
                      <Icon className="h-7 w-7 text-white" />
                    </div>
                  </div>

                  {/* Content */}
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">
                    {feature.title}
                  </h3>
                  <p className="text-gray-600">
                    {feature.description}
                  </p>
                </div>
              </motion.div>
            )
          })}
        </div>

        {/* Additional features list */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-16 bg-white rounded-2xl p-8 shadow-sm border border-gray-200"
        >
          <h3 className="text-xl font-semibold text-gray-900 mb-6 text-center">
            And Much More...
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              'Automatic renewal detection',
              'Hidden fee identification',
              'Data retention policies',
              'Third-party sharing alerts',
              'Jurisdiction analysis',
              'Change tracking over time',
              'Export reports as PDF',
              'Team collaboration',
              'API access for developers',
            ].map((item, index) => (
              <div key={index} className="flex items-center space-x-2">
                <CheckCircle className="h-5 w-5 text-success-500 flex-shrink-0" />
                <span className="text-gray-700">{item}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  )
}