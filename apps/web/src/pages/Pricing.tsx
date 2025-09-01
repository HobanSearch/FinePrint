import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { CheckIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'

interface PricingTier {
  id: string
  name: string
  price: number
  description: string
  features: string[]
  limitations: string[]
  analysesPerMonth: number | 'unlimited'
  monitoredDocs: number | 'unlimited'
  apiCalls: number | 'unlimited'
  teamMembers: number | 'unlimited'
  popular?: boolean
  buttonText: string
  buttonVariant: 'primary' | 'secondary' | 'outline'
}

const pricingTiers: PricingTier[] = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    description: 'Perfect for trying out Fine Print AI',
    features: [
      '3 document analyses per month',
      'Basic risk detection',
      'Email support',
      'Standard processing speed'
    ],
    limitations: [
      'No document monitoring',
      'No API access',
      'No team collaboration',
      'No priority support'
    ],
    analysesPerMonth: 3,
    monitoredDocs: 0,
    apiCalls: 0,
    teamMembers: 1,
    buttonText: 'Get Started',
    buttonVariant: 'outline'
  },
  {
    id: 'starter',
    name: 'Starter',
    price: 9,
    description: 'For individuals who need regular document analysis',
    features: [
      '20 document analyses per month',
      'Advanced risk detection',
      'Monitor up to 5 documents',
      'Email & chat support',
      'Faster processing speed',
      'Export reports as PDF'
    ],
    limitations: [
      'No API access',
      'No team collaboration',
      'Limited monitoring'
    ],
    analysesPerMonth: 20,
    monitoredDocs: 5,
    apiCalls: 0,
    teamMembers: 1,
    buttonText: 'Start Free Trial',
    buttonVariant: 'secondary'
  },
  {
    id: 'professional',
    name: 'Professional',
    price: 29,
    description: 'For professionals and small businesses',
    features: [
      'Unlimited document analyses',
      'Unlimited document monitoring',
      'AI-powered recommendations',
      '1,000 API calls per month',
      'Priority support',
      'Custom risk profiles',
      'Bulk document processing',
      'Advanced analytics dashboard'
    ],
    limitations: [
      'Single user account',
      'API rate limits apply'
    ],
    analysesPerMonth: 'unlimited',
    monitoredDocs: 'unlimited',
    apiCalls: 1000,
    teamMembers: 1,
    popular: true,
    buttonText: 'Start Free Trial',
    buttonVariant: 'primary'
  },
  {
    id: 'team',
    name: 'Team',
    price: 99,
    description: 'For teams that need collaboration features',
    features: [
      'Everything in Professional',
      'Up to 5 team members',
      '10,000 API calls per month',
      'Team collaboration tools',
      'Shared document library',
      'Role-based access control',
      'Audit logs',
      'SSO authentication',
      'Dedicated account manager'
    ],
    limitations: [],
    analysesPerMonth: 'unlimited',
    monitoredDocs: 'unlimited',
    apiCalls: 10000,
    teamMembers: 5,
    buttonText: 'Start Free Trial',
    buttonVariant: 'secondary'
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: -1, // Custom pricing
    description: 'For large organizations with custom needs',
    features: [
      'Everything in Team',
      'Unlimited team members',
      'Unlimited API calls',
      'Custom AI model training',
      'On-premise deployment option',
      'SLA guarantee',
      'Custom integrations',
      'Dedicated support team',
      'Compliance certifications'
    ],
    limitations: [],
    analysesPerMonth: 'unlimited',
    monitoredDocs: 'unlimited',
    apiCalls: 'unlimited',
    teamMembers: 'unlimited',
    buttonText: 'Contact Sales',
    buttonVariant: 'outline'
  }
]

const Pricing: React.FC = () => {
  const navigate = useNavigate()
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly')

  const handleSelectPlan = (tierId: string) => {
    if (tierId === 'enterprise') {
      // Navigate to contact sales form
      navigate('/contact-sales')
    } else if (tierId === 'free') {
      // Navigate to signup
      navigate('/signup')
    } else {
      // Navigate to checkout with selected plan
      navigate(`/checkout?plan=${tierId}&billing=${billingPeriod}`)
    }
  }

  const getDisplayPrice = (tier: PricingTier) => {
    if (tier.price === -1) {
      return 'Custom'
    }
    if (tier.price === 0) {
      return 'Free'
    }
    const price = billingPeriod === 'annual' ? tier.price * 0.85 : tier.price // 15% discount for annual
    return `$${Math.floor(price)}`
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center">
          <motion.h1 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl font-extrabold text-gray-900 sm:text-5xl"
          >
            Simple, Transparent Pricing
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mt-4 text-xl text-gray-600 max-w-2xl mx-auto"
          >
            Choose the perfect plan for your needs. All plans include our core AI-powered document analysis.
          </motion.p>
        </div>

        {/* Billing Period Toggle */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-8 flex justify-center"
        >
          <div className="relative bg-gray-100 rounded-lg p-1 flex">
            <button
              onClick={() => setBillingPeriod('monthly')}
              className={clsx(
                'relative px-4 py-2 rounded-md text-sm font-medium transition-all',
                billingPeriod === 'monthly' 
                  ? 'bg-white text-gray-900 shadow-sm' 
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingPeriod('annual')}
              className={clsx(
                'relative px-4 py-2 rounded-md text-sm font-medium transition-all',
                billingPeriod === 'annual' 
                  ? 'bg-white text-gray-900 shadow-sm' 
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              Annual
              <span className="ml-2 inline-block px-2 py-0.5 text-xs font-semibold text-green-800 bg-green-100 rounded-full">
                Save 15%
              </span>
            </button>
          </div>
        </motion.div>

        {/* Pricing Cards */}
        <div className="mt-12 grid gap-8 lg:grid-cols-3 xl:grid-cols-5">
          {pricingTiers.map((tier, index) => (
            <motion.div
              key={tier.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + index * 0.1 }}
              className={clsx(
                'relative rounded-2xl shadow-lg overflow-hidden',
                tier.popular 
                  ? 'ring-2 ring-indigo-500 scale-105' 
                  : 'border border-gray-200'
              )}
            >
              {tier.popular && (
                <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 rotate-45 bg-indigo-500 text-white px-10 py-1 text-xs font-semibold">
                  Popular
                </div>
              )}
              
              <div className="bg-white p-6">
                <h3 className="text-2xl font-semibold text-gray-900">{tier.name}</h3>
                <p className="mt-2 text-sm text-gray-500">{tier.description}</p>
                
                <div className="mt-4">
                  <span className="text-4xl font-extrabold text-gray-900">
                    {getDisplayPrice(tier)}
                  </span>
                  {tier.price > 0 && tier.price !== -1 && (
                    <span className="text-gray-500 ml-2">
                      /{billingPeriod === 'annual' ? 'mo' : 'month'}
                    </span>
                  )}
                  {billingPeriod === 'annual' && tier.price > 0 && tier.price !== -1 && (
                    <div className="text-sm text-gray-500 mt-1">
                      billed annually
                    </div>
                  )}
                </div>

                <button
                  onClick={() => handleSelectPlan(tier.id)}
                  className={clsx(
                    'mt-6 w-full py-3 px-4 rounded-lg font-medium transition-colors',
                    tier.buttonVariant === 'primary' 
                      ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                      : tier.buttonVariant === 'secondary'
                      ? 'bg-gray-800 text-white hover:bg-gray-900'
                      : 'border-2 border-gray-300 text-gray-700 hover:border-gray-400'
                  )}
                >
                  {tier.buttonText}
                </button>

                {/* Usage Limits */}
                <div className="mt-6 space-y-2 border-t pt-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Analyses/month</span>
                    <span className="font-medium text-gray-900">
                      {tier.analysesPerMonth === 'unlimited' ? 'Unlimited' : tier.analysesPerMonth}
                    </span>
                  </div>
                  {tier.monitoredDocs > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Monitored docs</span>
                      <span className="font-medium text-gray-900">
                        {tier.monitoredDocs === 'unlimited' ? 'Unlimited' : tier.monitoredDocs}
                      </span>
                    </div>
                  )}
                  {tier.apiCalls > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">API calls</span>
                      <span className="font-medium text-gray-900">
                        {tier.apiCalls === 'unlimited' ? 'Unlimited' : `${tier.apiCalls.toLocaleString()}/mo`}
                      </span>
                    </div>
                  )}
                  {tier.teamMembers > 1 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Team members</span>
                      <span className="font-medium text-gray-900">
                        {tier.teamMembers === 'unlimited' ? 'Unlimited' : tier.teamMembers}
                      </span>
                    </div>
                  )}
                </div>

                {/* Features */}
                <ul className="mt-6 space-y-3">
                  {tier.features.map((feature, i) => (
                    <li key={i} className="flex items-start">
                      <CheckIcon className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                      <span className="ml-2 text-sm text-gray-700">{feature}</span>
                    </li>
                  ))}
                  {tier.limitations.map((limitation, i) => (
                    <li key={`limit-${i}`} className="flex items-start">
                      <XMarkIcon className="h-5 w-5 text-gray-400 shrink-0 mt-0.5" />
                      <span className="ml-2 text-sm text-gray-400">{limitation}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          ))}
        </div>

        {/* FAQ Section */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="mt-20"
        >
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-8">
            Frequently Asked Questions
          </h2>
          
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-2">
                Can I change plans at any time?
              </h3>
              <p className="text-gray-600">
                Yes! You can upgrade or downgrade your plan at any time. Changes take effect immediately, and we'll prorate any differences.
              </p>
            </div>
            
            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-2">
                Do you offer a free trial?
              </h3>
              <p className="text-gray-600">
                Yes, all paid plans come with a 14-day free trial. No credit card required to start.
              </p>
            </div>
            
            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-2">
                What happens if I exceed my usage limits?
              </h3>
              <p className="text-gray-600">
                We'll notify you when you're approaching your limits. You can either upgrade your plan or pay for additional usage at $0.50 per analysis.
              </p>
            </div>
            
            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-2">
                Is my data secure?
              </h3>
              <p className="text-gray-600">
                Absolutely. We use bank-level encryption, process everything locally with our AI models, and never store your documents longer than necessary.
              </p>
            </div>
          </div>
        </motion.div>

        {/* CTA Section */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1 }}
          className="mt-20 text-center bg-gradient-to-r from-indigo-500 to-purple-600 rounded-3xl p-12"
        >
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to protect yourself from fine print?
          </h2>
          <p className="text-xl text-indigo-100 mb-8 max-w-2xl mx-auto">
            Join thousands of users who are already using Fine Print AI to understand legal documents better.
          </p>
          <button
            onClick={() => navigate('/signup')}
            className="bg-white text-indigo-600 px-8 py-4 rounded-lg font-semibold text-lg hover:bg-gray-100 transition-colors"
          >
            Start Your Free Trial
          </button>
          <p className="mt-4 text-sm text-indigo-200">
            No credit card required · 14-day free trial · Cancel anytime
          </p>
        </motion.div>
      </div>
    </div>
  )
}

export default Pricing