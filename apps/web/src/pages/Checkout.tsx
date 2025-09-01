import React, { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CheckIcon, ArrowLeftIcon } from '@heroicons/react/24/outline'
import PaymentForm from '../components/PaymentForm'
import { apiClient } from '../services/api'
import clsx from 'clsx'

interface PlanDetails {
  id: string
  name: string
  price: number
  features: string[]
  billingPeriod: 'monthly' | 'annual'
}

const planConfigs: Record<string, Omit<PlanDetails, 'billingPeriod'>> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    price: 9,
    features: [
      '20 document analyses per month',
      'Advanced risk detection',
      'Monitor up to 5 documents',
      'Email & chat support',
      'Export reports as PDF'
    ]
  },
  professional: {
    id: 'professional',
    name: 'Professional',
    price: 29,
    features: [
      'Unlimited document analyses',
      'Unlimited document monitoring',
      'AI-powered recommendations',
      '1,000 API calls per month',
      'Priority support',
      'Custom risk profiles',
      'Advanced analytics'
    ]
  },
  team: {
    id: 'team',
    name: 'Team',
    price: 99,
    features: [
      'Everything in Professional',
      'Up to 5 team members',
      '10,000 API calls per month',
      'Team collaboration tools',
      'Shared document library',
      'Role-based access control',
      'SSO authentication',
      'Dedicated account manager'
    ]
  }
}

const Checkout: React.FC = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  
  const planId = searchParams.get('plan')
  const billingPeriod = (searchParams.get('billing') || 'monthly') as 'monthly' | 'annual'
  
  const [isLoading, setIsLoading] = useState(false)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<'details' | 'payment' | 'success'>('details')
  
  // User details form state
  const [userDetails, setUserDetails] = useState({
    firstName: '',
    lastName: '',
    email: '',
    company: '',
    vatId: '',
    address: {
      line1: '',
      line2: '',
      city: '',
      state: '',
      postalCode: '',
      country: 'US'
    },
    acceptTerms: false
  })

  const plan = planId ? planConfigs[planId] : null
  
  useEffect(() => {
    if (!plan) {
      navigate('/pricing')
    }
  }, [plan, navigate])

  const calculatePrice = () => {
    if (!plan) return 0
    const basePrice = plan.price
    const discount = billingPeriod === 'annual' ? 0.15 : 0
    const monthlyPrice = basePrice * (1 - discount)
    return billingPeriod === 'annual' ? monthlyPrice * 12 : monthlyPrice
  }

  const handleDetailsSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!userDetails.acceptTerms) {
      setError('Please accept the terms and conditions')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Create subscription and get client secret
      const response = await apiClient.post('/billing/subscription', {
        tier: planId,
        billingPeriod,
        userDetails
      })

      if (response.data.clientSecret) {
        setClientSecret(response.data.clientSecret)
        setStep('payment')
      }
    } catch (err) {
      setError('Failed to initialize checkout. Please try again.')
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  const handlePaymentSuccess = async (paymentMethodId: string) => {
    setIsLoading(true)
    
    try {
      // Confirm subscription activation
      await apiClient.post('/billing/subscription/confirm', {
        paymentMethodId,
        subscriptionId: clientSecret
      })
      
      setStep('success')
    } catch (err) {
      setError('Payment was successful but subscription activation failed. Please contact support.')
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  const handlePaymentError = (errorMessage: string) => {
    setError(errorMessage)
  }

  if (!plan) {
    return null
  }

  const displayPrice = calculatePrice()
  const monthlyDisplay = billingPeriod === 'annual' 
    ? Math.floor(displayPrice / 12) 
    : Math.floor(displayPrice)

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/pricing')}
            className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeftIcon className="h-5 w-5 mr-2" />
            Back to pricing
          </button>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Order Summary - Sticky Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 lg:sticky lg:top-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Order Summary</h2>
              
              {/* Plan Details */}
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium text-gray-900">{plan.name} Plan</h3>
                  <p className="text-sm text-gray-500">
                    {billingPeriod === 'annual' ? 'Annual billing' : 'Monthly billing'}
                    {billingPeriod === 'annual' && ' (15% discount applied)'}
                  </p>
                </div>

                {/* Price Breakdown */}
                <div className="border-t pt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">
                      {plan.name} ({billingPeriod})
                    </span>
                    <span className="text-gray-900">
                      ${monthlyDisplay}/{billingPeriod === 'annual' ? 'mo' : 'month'}
                    </span>
                  </div>
                  
                  {billingPeriod === 'annual' && (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Annual total</span>
                        <span className="text-gray-900">${displayPrice}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-green-600">Discount (15%)</span>
                        <span className="text-green-600">
                          -${Math.floor(plan.price * 12 * 0.15)}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* Total */}
                <div className="border-t pt-4">
                  <div className="flex justify-between">
                    <span className="text-lg font-semibold text-gray-900">Total</span>
                    <span className="text-lg font-semibold text-gray-900">
                      ${displayPrice}
                      {billingPeriod === 'annual' ? '/year' : '/month'}
                    </span>
                  </div>
                </div>

                {/* Features */}
                <div className="border-t pt-4">
                  <h4 className="text-sm font-medium text-gray-900 mb-3">Included features</h4>
                  <ul className="space-y-2">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start text-sm">
                        <CheckIcon className="h-4 w-4 text-green-500 mt-0.5 mr-2 shrink-0" />
                        <span className="text-gray-600">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Checkout Form */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              {/* Progress Steps */}
              <div className="border-b px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className={clsx(
                      'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium',
                      step === 'details' ? 'bg-indigo-600 text-white' : 'bg-green-500 text-white'
                    )}>
                      {step === 'success' ? <CheckIcon className="h-5 w-5" /> : '1'}
                    </div>
                    <span className="ml-3 text-sm font-medium text-gray-900">Account Details</span>
                  </div>
                  
                  <div className="flex-1 mx-4">
                    <div className="h-1 bg-gray-200 rounded">
                      <div className={clsx(
                        'h-1 rounded transition-all',
                        step === 'details' ? 'w-0 bg-gray-200' : 
                        step === 'payment' ? 'w-1/2 bg-indigo-600' : 
                        'w-full bg-green-500'
                      )} />
                    </div>
                  </div>
                  
                  <div className="flex items-center">
                    <div className={clsx(
                      'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium',
                      step === 'details' ? 'bg-gray-200 text-gray-400' :
                      step === 'payment' ? 'bg-indigo-600 text-white' :
                      'bg-green-500 text-white'
                    )}>
                      {step === 'success' ? <CheckIcon className="h-5 w-5" /> : '2'}
                    </div>
                    <span className="ml-3 text-sm font-medium text-gray-900">Payment</span>
                  </div>
                </div>
              </div>

              <div className="p-6">
                {/* Step 1: Account Details */}
                {step === 'details' && (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                  >
                    <h2 className="text-xl font-semibold text-gray-900 mb-6">Account Information</h2>
                    
                    <form onSubmit={handleDetailsSubmit} className="space-y-6">
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            First Name *
                          </label>
                          <input
                            type="text"
                            required
                            value={userDetails.firstName}
                            onChange={(e) => setUserDetails({...userDetails, firstName: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Last Name *
                          </label>
                          <input
                            type="text"
                            required
                            value={userDetails.lastName}
                            onChange={(e) => setUserDetails({...userDetails, lastName: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Email Address *
                        </label>
                        <input
                          type="email"
                          required
                          value={userDetails.email}
                          onChange={(e) => setUserDetails({...userDetails, email: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Company (Optional)
                        </label>
                        <input
                          type="text"
                          value={userDetails.company}
                          onChange={(e) => setUserDetails({...userDetails, company: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>

                      {/* Billing Address */}
                      <div>
                        <h3 className="text-lg font-medium text-gray-900 mb-4">Billing Address</h3>
                        
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Address Line 1 *
                            </label>
                            <input
                              type="text"
                              required
                              value={userDetails.address.line1}
                              onChange={(e) => setUserDetails({
                                ...userDetails,
                                address: {...userDetails.address, line1: e.target.value}
                              })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Address Line 2
                            </label>
                            <input
                              type="text"
                              value={userDetails.address.line2}
                              onChange={(e) => setUserDetails({
                                ...userDetails,
                                address: {...userDetails.address, line2: e.target.value}
                              })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>

                          <div className="grid sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                City *
                              </label>
                              <input
                                type="text"
                                required
                                value={userDetails.address.city}
                                onChange={(e) => setUserDetails({
                                  ...userDetails,
                                  address: {...userDetails.address, city: e.target.value}
                                })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                State/Province *
                              </label>
                              <input
                                type="text"
                                required
                                value={userDetails.address.state}
                                onChange={(e) => setUserDetails({
                                  ...userDetails,
                                  address: {...userDetails.address, state: e.target.value}
                                })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                            </div>
                          </div>

                          <div className="grid sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Postal Code *
                              </label>
                              <input
                                type="text"
                                required
                                value={userDetails.address.postalCode}
                                onChange={(e) => setUserDetails({
                                  ...userDetails,
                                  address: {...userDetails.address, postalCode: e.target.value}
                                })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Country *
                              </label>
                              <select
                                required
                                value={userDetails.address.country}
                                onChange={(e) => setUserDetails({
                                  ...userDetails,
                                  address: {...userDetails.address, country: e.target.value}
                                })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              >
                                <option value="US">United States</option>
                                <option value="CA">Canada</option>
                                <option value="GB">United Kingdom</option>
                                <option value="AU">Australia</option>
                                <option value="DE">Germany</option>
                                <option value="FR">France</option>
                                {/* Add more countries as needed */}
                              </select>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* VAT ID for EU customers */}
                      {['DE', 'FR', 'IT', 'ES', 'NL', 'BE'].includes(userDetails.address.country) && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            VAT ID (Optional)
                          </label>
                          <input
                            type="text"
                            value={userDetails.vatId}
                            onChange={(e) => setUserDetails({...userDetails, vatId: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="e.g., DE123456789"
                          />
                        </div>
                      )}

                      {/* Terms and Conditions */}
                      <div className="flex items-start">
                        <input
                          type="checkbox"
                          id="acceptTerms"
                          checked={userDetails.acceptTerms}
                          onChange={(e) => setUserDetails({...userDetails, acceptTerms: e.target.checked})}
                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded mt-0.5"
                        />
                        <label htmlFor="acceptTerms" className="ml-2 text-sm text-gray-700">
                          I agree to the{' '}
                          <a href="/terms" target="_blank" className="text-indigo-600 hover:text-indigo-700">
                            Terms of Service
                          </a>{' '}
                          and{' '}
                          <a href="/privacy" target="_blank" className="text-indigo-600 hover:text-indigo-700">
                            Privacy Policy
                          </a>
                        </label>
                      </div>

                      {error && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                          <p className="text-sm text-red-600">{error}</p>
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={isLoading || !userDetails.acceptTerms}
                        className={clsx(
                          'w-full py-3 px-4 rounded-lg font-medium transition-colors',
                          isLoading || !userDetails.acceptTerms
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            : 'bg-indigo-600 text-white hover:bg-indigo-700'
                        )}
                      >
                        {isLoading ? 'Processing...' : 'Continue to Payment'}
                      </button>
                    </form>
                  </motion.div>
                )}

                {/* Step 2: Payment */}
                {step === 'payment' && clientSecret && (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                  >
                    <h2 className="text-xl font-semibold text-gray-900 mb-6">Payment Information</h2>
                    
                    <PaymentForm
                      clientSecret={clientSecret}
                      amount={displayPrice * 100} // Convert to cents
                      onSuccess={handlePaymentSuccess}
                      onError={handlePaymentError}
                      saveCard={true}
                    />
                  </motion.div>
                )}

                {/* Step 3: Success */}
                {step === 'success' && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center py-12"
                  >
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-6">
                      <CheckIcon className="h-8 w-8 text-green-600" />
                    </div>
                    
                    <h2 className="text-2xl font-bold text-gray-900 mb-4">
                      Welcome to Fine Print AI!
                    </h2>
                    
                    <p className="text-gray-600 mb-8 max-w-md mx-auto">
                      Your subscription to the {plan.name} plan is now active. 
                      You can start analyzing documents right away.
                    </p>
                    
                    <div className="space-y-3">
                      <button
                        onClick={() => navigate('/dashboard')}
                        className="w-full sm:w-auto px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
                      >
                        Go to Dashboard
                      </button>
                      
                      <div>
                        <button
                          onClick={() => navigate('/upload')}
                          className="text-indigo-600 hover:text-indigo-700 font-medium"
                        >
                          Upload Your First Document →
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Checkout