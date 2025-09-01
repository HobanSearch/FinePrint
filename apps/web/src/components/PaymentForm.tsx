import React, { useState, useEffect } from 'react'
import {
  PaymentElement,
  Elements,
  useStripe,
  useElements,
  CardElement,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement
} from '@stripe/react-stripe-js'
import { loadStripe, StripeElementsOptions } from '@stripe/stripe-js'
import { motion, AnimatePresence } from 'framer-motion'
import { CreditCardIcon, LockClosedIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import clsx from 'clsx'

// Initialize Stripe - this will be loaded from environment variable
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '')

interface PaymentFormProps {
  clientSecret?: string
  amount: number
  currency?: string
  onSuccess: (paymentMethodId: string) => void
  onError: (error: string) => void
  saveCard?: boolean
  className?: string
}

const PaymentFormContent: React.FC<PaymentFormProps> = ({
  clientSecret,
  amount,
  currency = 'usd',
  onSuccess,
  onError,
  saveCard = true,
  className
}) => {
  const stripe = useStripe()
  const elements = useElements()
  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [succeeded, setSucceeded] = useState(false)
  const [cardholderName, setCardholderName] = useState('')
  const [email, setEmail] = useState('')
  const [saveCardForFuture, setSaveCardForFuture] = useState(saveCard)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!stripe || !elements) {
      return
    }

    setIsProcessing(true)
    setErrorMessage(null)

    try {
      if (clientSecret) {
        // Process payment with PaymentElement
        const { error, paymentIntent } = await stripe.confirmPayment({
          elements,
          confirmParams: {
            return_url: `${window.location.origin}/payment-success`,
            payment_method_data: {
              billing_details: {
                name: cardholderName,
                email: email
              }
            }
          },
          redirect: 'if_required'
        })

        if (error) {
          setErrorMessage(error.message || 'Payment failed')
          onError(error.message || 'Payment failed')
        } else if (paymentIntent && paymentIntent.status === 'succeeded') {
          setSucceeded(true)
          onSuccess(paymentIntent.payment_method as string)
        }
      } else {
        // Create payment method only (for saving card)
        const cardElement = elements.getElement(CardNumberElement)
        
        if (!cardElement) {
          throw new Error('Card element not found')
        }

        const { error, paymentMethod } = await stripe.createPaymentMethod({
          type: 'card',
          card: cardElement,
          billing_details: {
            name: cardholderName,
            email: email
          }
        })

        if (error) {
          setErrorMessage(error.message || 'Failed to save payment method')
          onError(error.message || 'Failed to save payment method')
        } else if (paymentMethod) {
          setSucceeded(true)
          onSuccess(paymentMethod.id)
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Payment processing failed'
      setErrorMessage(message)
      onError(message)
    } finally {
      setIsProcessing(false)
    }
  }

  const cardElementOptions = {
    style: {
      base: {
        fontSize: '16px',
        color: '#424770',
        '::placeholder': {
          color: '#aab7c4',
        },
        fontFamily: '"Inter", sans-serif',
      },
      invalid: {
        color: '#9e2146',
      },
    },
  }

  return (
    <div className={clsx('max-w-md mx-auto', className)}>
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Success State */}
        <AnimatePresence>
          {succeeded && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-green-50 border border-green-200 rounded-lg p-6 text-center"
            >
              <CheckCircleIcon className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-green-900">Payment Successful!</h3>
              <p className="mt-2 text-sm text-green-700">
                Your payment has been processed successfully.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {!succeeded && (
          <>
            {/* Payment Amount Display */}
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Amount to pay</span>
                <span className="text-2xl font-bold text-gray-900">
                  {new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: currency.toUpperCase()
                  }).format(amount / 100)}
                </span>
              </div>
            </div>

            {/* Cardholder Information */}
            <div className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="john@example.com"
                />
              </div>

              <div>
                <label htmlFor="cardholderName" className="block text-sm font-medium text-gray-700 mb-1">
                  Cardholder Name
                </label>
                <input
                  type="text"
                  id="cardholderName"
                  value={cardholderName}
                  onChange={(e) => setCardholderName(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="John Doe"
                />
              </div>
            </div>

            {/* Card Input */}
            {clientSecret ? (
              // Use PaymentElement for full payment flow
              <div className="space-y-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Payment Details
                </label>
                <div className="border border-gray-300 rounded-lg p-4">
                  <PaymentElement 
                    options={{
                      layout: 'tabs'
                    }}
                  />
                </div>
              </div>
            ) : (
              // Use individual card elements for saving card only
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Card Number
                  </label>
                  <div className="border border-gray-300 rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500">
                    <CardNumberElement options={cardElementOptions} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Expiry Date
                    </label>
                    <div className="border border-gray-300 rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500">
                      <CardExpiryElement options={cardElementOptions} />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      CVC
                    </label>
                    <div className="border border-gray-300 rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500">
                      <CardCvcElement options={cardElementOptions} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Save Card Checkbox */}
            {saveCard && (
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="saveCard"
                  checked={saveCardForFuture}
                  onChange={(e) => setSaveCardForFuture(e.target.checked)}
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                />
                <label htmlFor="saveCard" className="ml-2 text-sm text-gray-700">
                  Save this card for future payments
                </label>
              </div>
            )}

            {/* Error Message */}
            <AnimatePresence>
              {errorMessage && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="bg-red-50 border border-red-200 rounded-lg p-3"
                >
                  <p className="text-sm text-red-600">{errorMessage}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={!stripe || isProcessing}
              className={clsx(
                'w-full py-3 px-4 rounded-lg font-medium transition-all flex items-center justify-center',
                isProcessing || !stripe
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              )}
            >
              {isProcessing ? (
                <>
                  <svg 
                    className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" 
                    xmlns="http://www.w3.org/2000/svg" 
                    fill="none" 
                    viewBox="0 0 24 24"
                  >
                    <circle 
                      className="opacity-25" 
                      cx="12" 
                      cy="12" 
                      r="10" 
                      stroke="currentColor" 
                      strokeWidth="4"
                    />
                    <path 
                      className="opacity-75" 
                      fill="currentColor" 
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Processing...
                </>
              ) : (
                <>
                  <LockClosedIcon className="h-5 w-5 mr-2" />
                  {clientSecret ? `Pay ${new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: currency.toUpperCase()
                  }).format(amount / 100)}` : 'Save Payment Method'}
                </>
              )}
            </button>

            {/* Security Badge */}
            <div className="flex items-center justify-center text-xs text-gray-500">
              <LockClosedIcon className="h-4 w-4 mr-1" />
              <span>Secured by Stripe. Your payment info is encrypted.</span>
            </div>

            {/* Accepted Cards */}
            <div className="flex items-center justify-center space-x-2">
              <span className="text-xs text-gray-500">We accept:</span>
              <div className="flex space-x-2">
                <CreditCardIcon className="h-8 w-8 text-gray-400" />
                {/* Add actual card brand logos here */}
              </div>
            </div>
          </>
        )}
      </form>
    </div>
  )
}

// Main component wrapped with Stripe Elements provider
const PaymentForm: React.FC<PaymentFormProps> = (props) => {
  const elementsOptions: StripeElementsOptions = props.clientSecret 
    ? {
        clientSecret: props.clientSecret,
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: '#4f46e5',
            fontFamily: '"Inter", sans-serif',
          }
        }
      }
    : {
        mode: 'setup',
        currency: props.currency || 'usd',
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: '#4f46e5',
            fontFamily: '"Inter", sans-serif',
          }
        }
      }

  return (
    <Elements stripe={stripePromise} options={elementsOptions}>
      <PaymentFormContent {...props} />
    </Elements>
  )
}

export default PaymentForm