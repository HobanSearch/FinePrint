'use client'

import { motion } from 'framer-motion'
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

const plans = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Perfect for personal use',
    features: [
      '5 document analyses per month',
      'Basic risk detection',
      'Browser extension',
      'Privacy score ratings',
      'Email support',
    ],
    notIncluded: [
      'Advanced AI insights',
      'Unlimited analyses',
      'API access',
      'Priority support',
      'Team collaboration',
    ],
    cta: 'Start Free',
    ctaVariant: 'outline' as const,
    popular: false,
  },
  {
    name: 'Pro',
    price: '$9.99',
    period: '/month',
    description: 'For power users and professionals',
    features: [
      'Unlimited document analyses',
      'Advanced AI insights',
      'All 50+ risk patterns',
      'Detailed reports & exports',
      'Browser & mobile apps',
      'Priority email support',
      'Change tracking alerts',
    ],
    notIncluded: [
      'API access',
      'Team collaboration',
      'Custom integrations',
    ],
    cta: 'Start 14-Day Trial',
    ctaVariant: 'gradient' as const,
    popular: true,
  },
  {
    name: 'Business',
    price: '$49.99',
    period: '/month',
    description: 'For teams and businesses',
    features: [
      'Everything in Pro',
      '10 team members included',
      'API access (10k calls/month)',
      'Team collaboration tools',
      'Admin dashboard',
      'Priority phone support',
      'Custom risk patterns',
      'SSO authentication',
    ],
    notIncluded: [
      'Unlimited API calls',
      'White-label options',
    ],
    cta: 'Contact Sales',
    ctaVariant: 'default' as const,
    popular: false,
  },
]

export function PricingSection() {
  return (
    <section id="pricing" className="py-20 bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
            Simple, Transparent Pricing
          </h2>
          <p className="mt-4 text-xl text-gray-600 max-w-3xl mx-auto">
            Choose the plan that fits your needs. No hidden fees, cancel anytime.
          </p>
        </motion.div>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">
          {plans.map((plan, index) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className={cn(
                'relative bg-white rounded-2xl shadow-sm border-2 p-8',
                plan.popular
                  ? 'border-primary-500 shadow-xl scale-105'
                  : 'border-gray-200'
              )}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <span className="bg-gradient-to-r from-primary-500 to-accent-500 text-white text-sm font-medium px-4 py-1 rounded-full">
                    Most Popular
                  </span>
                </div>
              )}

              <div className="text-center">
                <h3 className="text-2xl font-bold text-gray-900">{plan.name}</h3>
                <p className="mt-2 text-gray-600">{plan.description}</p>
                <div className="mt-6">
                  <span className="text-5xl font-bold text-gray-900">{plan.price}</span>
                  <span className="text-gray-600">{plan.period}</span>
                </div>
              </div>

              <div className="mt-8 space-y-4">
                {plan.features.map((feature) => (
                  <div key={feature} className="flex items-start">
                    <Check className="h-5 w-5 text-success-500 flex-shrink-0 mt-0.5" />
                    <span className="ml-3 text-gray-700">{feature}</span>
                  </div>
                ))}
                {plan.notIncluded.map((feature) => (
                  <div key={feature} className="flex items-start opacity-50">
                    <X className="h-5 w-5 text-gray-400 flex-shrink-0 mt-0.5" />
                    <span className="ml-3 text-gray-500">{feature}</span>
                  </div>
                ))}
              </div>

              <div className="mt-8">
                <Button
                  variant={plan.ctaVariant}
                  size="lg"
                  className="w-full"
                >
                  {plan.cta}
                </Button>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Enterprise section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-16 bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 lg:p-12 text-white"
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
            <div>
              <h3 className="text-3xl font-bold">Enterprise</h3>
              <p className="mt-4 text-gray-300 text-lg">
                Custom solutions for large organizations with advanced security and compliance needs.
              </p>
              <ul className="mt-6 space-y-3">
                <li className="flex items-center">
                  <Check className="h-5 w-5 text-success-400 mr-3" />
                  <span>Unlimited everything</span>
                </li>
                <li className="flex items-center">
                  <Check className="h-5 w-5 text-success-400 mr-3" />
                  <span>On-premise deployment options</span>
                </li>
                <li className="flex items-center">
                  <Check className="h-5 w-5 text-success-400 mr-3" />
                  <span>Custom AI model training</span>
                </li>
                <li className="flex items-center">
                  <Check className="h-5 w-5 text-success-400 mr-3" />
                  <span>24/7 dedicated support</span>
                </li>
              </ul>
            </div>
            <div className="text-center lg:text-right">
              <p className="text-3xl font-bold">Custom Pricing</p>
              <p className="mt-2 text-gray-300">Based on your needs</p>
              <Button
                variant="outline"
                size="lg"
                className="mt-6 bg-white text-gray-900 hover:bg-gray-100"
              >
                Contact Enterprise Sales
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}