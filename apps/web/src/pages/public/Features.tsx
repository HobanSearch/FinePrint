import React from 'react'
import { motion } from 'framer-motion'
import { 
  DocumentMagnifyingGlassIcon,
  ShieldCheckIcon,
  BoltIcon,
  ChartBarIcon,
  BellAlertIcon,
  LanguageIcon,
  CloudArrowDownIcon,
  LockClosedIcon,
  CpuChipIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline'

const Features: React.FC = () => {
  const mainFeatures = [
    {
      icon: DocumentMagnifyingGlassIcon,
      title: 'Smart Document Analysis',
      description: 'Our AI analyzes entire documents in seconds, identifying key clauses and potential issues.',
      details: [
        'Support for PDFs, Word docs, and plain text',
        'Automatic language detection',
        'OCR for scanned documents',
        'Batch processing capabilities'
      ]
    },
    {
      icon: ShieldCheckIcon,
      title: 'Risk Assessment',
      description: 'Get instant risk scores and understand potential legal implications before you sign.',
      details: [
        'Color-coded risk indicators',
        'Severity rankings for each clause',
        'Comparative analysis with industry standards',
        'Customizable risk thresholds'
      ]
    },
    {
      icon: BoltIcon,
      title: 'Real-Time Monitoring',
      description: 'Track changes to terms of service and privacy policies automatically.',
      details: [
        'Automatic change detection',
        'Email notifications for updates',
        'Version comparison tools',
        'Historical change tracking'
      ]
    },
    {
      icon: ChartBarIcon,
      title: 'Detailed Reports',
      description: 'Comprehensive analysis reports that break down complex legal language.',
      details: [
        'Plain English explanations',
        'Visual risk breakdown',
        'Exportable PDF reports',
        'Shareable analysis links'
      ]
    }
  ]

  const capabilities = [
    {
      category: 'Document Types',
      items: [
        'Terms of Service',
        'Privacy Policies',
        'Employment Contracts',
        'Rental Agreements',
        'NDAs',
        'Service Agreements',
        'EULAs',
        'Purchase Agreements'
      ]
    },
    {
      category: 'Detection Capabilities',
      items: [
        'Automatic renewal clauses',
        'Liability limitations',
        'Data sharing permissions',
        'Arbitration requirements',
        'Termination penalties',
        'Hidden fees',
        'Jurisdiction issues',
        'IP rights transfers'
      ]
    },
    {
      category: 'Analysis Features',
      items: [
        'Risk scoring',
        'Clause highlighting',
        'Plain language summaries',
        'Comparison tools',
        'Legal term glossary',
        'Action recommendations',
        'Negotiation points',
        'Red flag alerts'
      ]
    }
  ]

  const security = [
    { icon: LockClosedIcon, text: 'End-to-end encryption for all documents' },
    { icon: CloudArrowDownIcon, text: 'Local AI processing - your data never leaves your control' },
    { icon: ShieldCheckIcon, text: 'SOC 2 Type II certified infrastructure' },
    { icon: CpuChipIcon, text: 'On-device processing available for sensitive documents' }
  ]

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative py-20 bg-gradient-to-b from-indigo-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Powerful Features for Complete Protection
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Everything you need to understand, track, and protect yourself from 
              unfavorable legal terms in any document.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Main Features */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="space-y-16">
            {mainFeatures.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                viewport={{ once: true }}
                className={`flex flex-col lg:flex-row gap-12 items-center ${
                  index % 2 === 1 ? 'lg:flex-row-reverse' : ''
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center mb-4">
                    <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
                      <feature.icon className="h-6 w-6 text-indigo-600" />
                    </div>
                    <h2 className="ml-4 text-3xl font-bold text-gray-900">
                      {feature.title}
                    </h2>
                  </div>
                  <p className="text-lg text-gray-600 mb-6">
                    {feature.description}
                  </p>
                  <ul className="space-y-3">
                    {feature.details.map((detail, i) => (
                      <li key={i} className="flex items-start">
                        <CheckCircleIcon className="h-5 w-5 text-green-500 mt-0.5 mr-3 flex-shrink-0" />
                        <span className="text-gray-700">{detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex-1">
                  <div className="aspect-w-16 aspect-h-9 rounded-lg overflow-hidden shadow-xl bg-gradient-to-br from-indigo-100 to-purple-100 p-8">
                    <div className="flex items-center justify-center h-64">
                      <feature.icon className="h-32 w-32 text-indigo-600 opacity-20" />
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Capabilities Grid */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Comprehensive Coverage
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Fine Print AI handles every type of legal document and identifies all 
              types of problematic clauses.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {capabilities.map((cap, index) => (
              <motion.div
                key={cap.category}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                viewport={{ once: true }}
                className="bg-white p-6 rounded-lg shadow-md"
              >
                <h3 className="text-xl font-semibold text-gray-900 mb-4">
                  {cap.category}
                </h3>
                <ul className="space-y-2">
                  {cap.items.map((item, i) => (
                    <li key={i} className="flex items-center text-gray-700">
                      <CheckCircleIcon className="h-4 w-4 text-green-500 mr-2" />
                      {item}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Security Section */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Enterprise-Grade Security
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Your documents are protected with the highest level of security and privacy.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {security.map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                viewport={{ once: true }}
                className="flex flex-col items-center text-center p-6 bg-gray-50 rounded-lg"
              >
                <item.icon className="h-12 w-12 text-indigo-600 mb-4" />
                <p className="text-gray-700">{item.text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-gradient-to-r from-indigo-600 to-purple-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl font-bold text-white mb-4">
              Experience the Power of Fine Print AI
            </h2>
            <p className="text-xl text-indigo-100 mb-8 max-w-2xl mx-auto">
              Start protecting yourself today with our comprehensive document analysis platform.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="/auth/signup"
                className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-indigo-600 bg-white hover:bg-indigo-50 transition-colors"
              >
                Start Free Trial
              </a>
              <a
                href="/pricing"
                className="inline-flex items-center px-6 py-3 border border-white text-base font-medium rounded-md text-white hover:bg-white hover:text-indigo-600 transition-colors"
              >
                View Pricing
              </a>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  )
}

export default Features