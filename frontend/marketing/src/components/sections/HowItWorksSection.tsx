'use client'

import { motion } from 'framer-motion'
import { Upload, Cpu, FileCheck } from 'lucide-react'

const steps = [
  {
    number: '01',
    title: 'Upload Document',
    description: 'Paste a URL or upload any legal document - Terms of Service, Privacy Policy, or EULA',
    icon: Upload,
    color: 'primary',
  },
  {
    number: '02',
    title: 'AI Analysis',
    description: 'Our local AI instantly scans for 50+ problematic patterns and hidden clauses',
    icon: Cpu,
    color: 'accent',
  },
  {
    number: '03',
    title: 'Get Insights',
    description: 'Receive clear explanations, risk scores, and actionable recommendations',
    icon: FileCheck,
    color: 'success',
  },
]

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-20 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
            How It Works
          </h2>
          <p className="mt-4 text-xl text-gray-600 max-w-3xl mx-auto">
            Protect your digital rights in three simple steps
          </p>
        </motion.div>

        <div className="mt-16 relative">
          {/* Connection line */}
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-gray-200 -translate-y-1/2 hidden lg:block" />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">
            {steps.map((step, index) => {
              const Icon = step.icon
              const colorClasses = {
                primary: 'bg-primary-100 text-primary-600',
                accent: 'bg-accent-100 text-accent-600',
                success: 'bg-success-100 text-success-600',
              }
              
              return (
                <motion.div
                  key={step.number}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className="relative"
                >
                  <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
                    {/* Step number */}
                    <div className="absolute -top-4 left-8 bg-white px-2">
                      <span className="text-4xl font-bold text-gray-200">
                        {step.number}
                      </span>
                    </div>

                    {/* Icon */}
                    <div className={`w-16 h-16 rounded-xl ${colorClasses[step.color]} flex items-center justify-center mb-6 mt-4`}>
                      <Icon className="h-8 w-8" />
                    </div>

                    {/* Content */}
                    <h3 className="text-xl font-semibold text-gray-900 mb-3">
                      {step.title}
                    </h3>
                    <p className="text-gray-600">
                      {step.description}
                    </p>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>

        {/* Time indicator */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-16 text-center"
        >
          <div className="inline-flex items-center justify-center px-6 py-3 bg-primary-50 rounded-full">
            <span className="text-lg font-medium text-primary-700">
              Complete analysis in under 5 seconds
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  )
}