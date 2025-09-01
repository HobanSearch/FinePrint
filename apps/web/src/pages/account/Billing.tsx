import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  CreditCardIcon,
  DocumentTextIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  CalendarIcon,
  ChartBarIcon,
  CogIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline'
import { apiClient } from '../../services/api'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'

interface Subscription {
  id: string
  tier: 'free' | 'starter' | 'professional' | 'team' | 'enterprise'
  status: 'active' | 'canceled' | 'past_due' | 'trialing'
  currentPeriodStart: string
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
  trialEnd?: string
}

interface Usage {
  analyses: {
    used: number
    limit: number | 'unlimited'
  }
  monitoredDocs: {
    used: number
    limit: number | 'unlimited'
  }
  apiCalls: {
    used: number
    limit: number | 'unlimited'
  }
  teamMembers: {
    used: number
    limit: number | 'unlimited'
  }
}

interface Invoice {
  id: string
  amount: number
  currency: string
  status: 'paid' | 'pending' | 'failed'
  date: string
  downloadUrl: string
}

interface PaymentMethod {
  id: string
  brand: string
  last4: string
  expiryMonth: number
  expiryYear: number
  isDefault: boolean
}

const tierDetails = {
  free: { name: 'Free', price: 0, color: 'gray' },
  starter: { name: 'Starter', price: 9, color: 'blue' },
  professional: { name: 'Professional', price: 29, color: 'indigo' },
  team: { name: 'Team', price: 99, color: 'purple' },
  enterprise: { name: 'Enterprise', price: -1, color: 'gray' }
}

const Billing: React.FC = () => {
  const navigate = useNavigate()
  
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [usage, setUsage] = useState<Usage | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'invoices' | 'payment' | 'usage'>('overview')
  const [isCanceling, setIsCanceling] = useState(false)
  const [isReactivating, setIsReactivating] = useState(false)

  useEffect(() => {
    fetchBillingData()
  }, [])

  const fetchBillingData = async () => {
    setIsLoading(true)
    try {
      const [subResponse, usageResponse, invoicesResponse, methodsResponse] = await Promise.all([
        apiClient.get('/billing/subscription'),
        apiClient.get('/billing/usage'),
        apiClient.get('/billing/invoices'),
        apiClient.get('/billing/payment-methods')
      ])

      setSubscription(subResponse.data.subscription)
      setUsage(subResponse.data.usage)
      setInvoices(invoicesResponse.data)
      setPaymentMethods(methodsResponse.data)
    } catch (error) {
      console.error('Failed to fetch billing data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancelSubscription = async () => {
    if (!subscription || !window.confirm('Are you sure you want to cancel your subscription?')) {
      return
    }

    setIsCanceling(true)
    try {
      await apiClient.post('/billing/subscription/cancel', {
        cancelAtPeriodEnd: true
      })
      await fetchBillingData()
    } catch (error) {
      console.error('Failed to cancel subscription:', error)
    } finally {
      setIsCanceling(false)
    }
  }

  const handleReactivateSubscription = async () => {
    if (!subscription) return

    setIsReactivating(true)
    try {
      await apiClient.post('/billing/subscription/reactivate')
      await fetchBillingData()
    } catch (error) {
      console.error('Failed to reactivate subscription:', error)
    } finally {
      setIsReactivating(false)
    }
  }

  const handleUpdatePaymentMethod = async (paymentMethodId: string) => {
    try {
      await apiClient.post('/billing/payment-method/set-default', {
        paymentMethodId
      })
      await fetchBillingData()
    } catch (error) {
      console.error('Failed to update payment method:', error)
    }
  }

  const getUsagePercentage = (used: number, limit: number | 'unlimited'): number => {
    if (limit === 'unlimited') return 0
    return Math.min((used / limit) * 100, 100)
  }

  const getUsageColor = (percentage: number): string => {
    if (percentage < 50) return 'green'
    if (percentage < 80) return 'yellow'
    return 'red'
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  const currentTier = subscription ? tierDetails[subscription.tier] : tierDetails.free

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Billing & Subscription</h1>
          <p className="mt-2 text-gray-600">
            Manage your subscription, payment methods, and view usage
          </p>
        </div>

        {/* Subscription Status Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8"
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center">
                <h2 className="text-2xl font-bold text-gray-900">{currentTier.name} Plan</h2>
                {subscription?.status === 'trialing' && (
                  <span className="ml-3 px-3 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                    Trial
                  </span>
                )}
                {subscription?.status === 'active' && (
                  <span className="ml-3 px-3 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                    Active
                  </span>
                )}
                {subscription?.status === 'past_due' && (
                  <span className="ml-3 px-3 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">
                    Past Due
                  </span>
                )}
                {subscription?.cancelAtPeriodEnd && (
                  <span className="ml-3 px-3 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">
                    Canceling
                  </span>
                )}
              </div>
              
              {currentTier.price > 0 && (
                <p className="mt-1 text-3xl font-bold text-gray-900">
                  ${currentTier.price}<span className="text-lg font-normal text-gray-500">/month</span>
                </p>
              )}
              
              {subscription && (
                <div className="mt-4 space-y-2 text-sm text-gray-600">
                  {subscription.status === 'trialing' && subscription.trialEnd && (
                    <p>
                      Trial ends on {new Date(subscription.trialEnd).toLocaleDateString()}
                    </p>
                  )}
                  {subscription.cancelAtPeriodEnd ? (
                    <p>
                      Your subscription will end on {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                    </p>
                  ) : (
                    <p>
                      Next billing date: {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex space-x-3">
              {subscription?.tier !== 'enterprise' && (
                <button
                  onClick={() => navigate('/pricing')}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  {subscription?.tier === 'free' ? 'Upgrade' : 'Change Plan'}
                </button>
              )}
              
              {subscription?.tier !== 'free' && subscription?.tier !== 'enterprise' && (
                <>
                  {subscription?.cancelAtPeriodEnd ? (
                    <button
                      onClick={handleReactivateSubscription}
                      disabled={isReactivating}
                      className="px-4 py-2 border border-green-600 text-green-600 rounded-lg hover:bg-green-50 transition-colors"
                    >
                      {isReactivating ? 'Reactivating...' : 'Reactivate'}
                    </button>
                  ) : (
                    <button
                      onClick={handleCancelSubscription}
                      disabled={isCanceling}
                      className="px-4 py-2 border border-red-600 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      {isCanceling ? 'Canceling...' : 'Cancel'}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </motion.div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-8">
          <nav className="-mb-px flex space-x-8">
            {['overview', 'usage', 'invoices', 'payment'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={clsx(
                  'py-2 px-1 border-b-2 font-medium text-sm capitalize',
                  activeTab === tab
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                )}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div>
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="grid gap-6 md:grid-cols-2 lg:grid-cols-4"
            >
              {/* Usage Summary Cards */}
              {usage && (
                <>
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center justify-between">
                      <DocumentTextIcon className="h-8 w-8 text-indigo-600" />
                      <span className={clsx(
                        'text-xs font-medium px-2 py-1 rounded-full',
                        getUsageColor(getUsagePercentage(usage.analyses.used, usage.analyses.limit)) === 'green' 
                          ? 'bg-green-100 text-green-800'
                          : getUsageColor(getUsagePercentage(usage.analyses.used, usage.analyses.limit)) === 'yellow'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                      )}>
                        {getUsagePercentage(usage.analyses.used, usage.analyses.limit).toFixed(0)}%
                      </span>
                    </div>
                    <h3 className="mt-4 text-lg font-semibold text-gray-900">Analyses</h3>
                    <p className="mt-2 text-2xl font-bold text-gray-900">
                      {usage.analyses.used}
                      {usage.analyses.limit !== 'unlimited' && (
                        <span className="text-sm font-normal text-gray-500">/{usage.analyses.limit}</span>
                      )}
                    </p>
                    {usage.analyses.limit === 'unlimited' && (
                      <p className="text-sm text-gray-500">Unlimited</p>
                    )}
                  </div>

                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center justify-between">
                      <ChartBarIcon className="h-8 w-8 text-purple-600" />
                      <span className={clsx(
                        'text-xs font-medium px-2 py-1 rounded-full',
                        getUsageColor(getUsagePercentage(usage.apiCalls.used, usage.apiCalls.limit)) === 'green' 
                          ? 'bg-green-100 text-green-800'
                          : getUsageColor(getUsagePercentage(usage.apiCalls.used, usage.apiCalls.limit)) === 'yellow'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                      )}>
                        {getUsagePercentage(usage.apiCalls.used, usage.apiCalls.limit).toFixed(0)}%
                      </span>
                    </div>
                    <h3 className="mt-4 text-lg font-semibold text-gray-900">API Calls</h3>
                    <p className="mt-2 text-2xl font-bold text-gray-900">
                      {usage.apiCalls.used.toLocaleString()}
                      {usage.apiCalls.limit !== 'unlimited' && (
                        <span className="text-sm font-normal text-gray-500">/{usage.apiCalls.limit.toLocaleString()}</span>
                      )}
                    </p>
                    {usage.apiCalls.limit === 'unlimited' && (
                      <p className="text-sm text-gray-500">Unlimited</p>
                    )}
                  </div>

                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center justify-between">
                      <CalendarIcon className="h-8 w-8 text-green-600" />
                      <span className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-800">
                        Monthly
                      </span>
                    </div>
                    <h3 className="mt-4 text-lg font-semibold text-gray-900">Monitored Docs</h3>
                    <p className="mt-2 text-2xl font-bold text-gray-900">
                      {usage.monitoredDocs.used}
                      {usage.monitoredDocs.limit !== 'unlimited' && (
                        <span className="text-sm font-normal text-gray-500">/{usage.monitoredDocs.limit}</span>
                      )}
                    </p>
                    {usage.monitoredDocs.limit === 'unlimited' && (
                      <p className="text-sm text-gray-500">Unlimited</p>
                    )}
                  </div>

                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center justify-between">
                      <CogIcon className="h-8 w-8 text-blue-600" />
                      <span className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-800">
                        Team
                      </span>
                    </div>
                    <h3 className="mt-4 text-lg font-semibold text-gray-900">Team Members</h3>
                    <p className="mt-2 text-2xl font-bold text-gray-900">
                      {usage.teamMembers.used}
                      {usage.teamMembers.limit !== 'unlimited' && (
                        <span className="text-sm font-normal text-gray-500">/{usage.teamMembers.limit}</span>
                      )}
                    </p>
                    {usage.teamMembers.limit === 'unlimited' && (
                      <p className="text-sm text-gray-500">Unlimited</p>
                    )}
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* Usage Tab */}
          {activeTab === 'usage' && usage && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-6">Current Period Usage</h3>
              
              <div className="space-y-6">
                {/* Document Analyses */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-700">Document Analyses</span>
                    <span className="text-sm text-gray-600">
                      {usage.analyses.used} / {usage.analyses.limit === 'unlimited' ? '∞' : usage.analyses.limit}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={clsx(
                        'h-2 rounded-full transition-all',
                        getUsageColor(getUsagePercentage(usage.analyses.used, usage.analyses.limit)) === 'green'
                          ? 'bg-green-500'
                          : getUsageColor(getUsagePercentage(usage.analyses.used, usage.analyses.limit)) === 'yellow'
                          ? 'bg-yellow-500'
                          : 'bg-red-500'
                      )}
                      style={{ width: `${getUsagePercentage(usage.analyses.used, usage.analyses.limit)}%` }}
                    />
                  </div>
                </div>

                {/* API Calls */}
                {usage.apiCalls.limit !== 0 && (
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-gray-700">API Calls</span>
                      <span className="text-sm text-gray-600">
                        {usage.apiCalls.used.toLocaleString()} / {usage.apiCalls.limit === 'unlimited' ? '∞' : usage.apiCalls.limit.toLocaleString()}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={clsx(
                          'h-2 rounded-full transition-all',
                          getUsageColor(getUsagePercentage(usage.apiCalls.used, usage.apiCalls.limit)) === 'green'
                            ? 'bg-green-500'
                            : getUsageColor(getUsagePercentage(usage.apiCalls.used, usage.apiCalls.limit)) === 'yellow'
                            ? 'bg-yellow-500'
                            : 'bg-red-500'
                        )}
                        style={{ width: `${getUsagePercentage(usage.apiCalls.used, usage.apiCalls.limit)}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Monitored Documents */}
                {usage.monitoredDocs.limit !== 0 && (
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-gray-700">Monitored Documents</span>
                      <span className="text-sm text-gray-600">
                        {usage.monitoredDocs.used} / {usage.monitoredDocs.limit === 'unlimited' ? '∞' : usage.monitoredDocs.limit}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={clsx(
                          'h-2 rounded-full transition-all',
                          getUsageColor(getUsagePercentage(usage.monitoredDocs.used, usage.monitoredDocs.limit)) === 'green'
                            ? 'bg-green-500'
                            : getUsageColor(getUsagePercentage(usage.monitoredDocs.used, usage.monitoredDocs.limit)) === 'yellow'
                            ? 'bg-yellow-500'
                            : 'bg-red-500'
                        )}
                        style={{ width: `${getUsagePercentage(usage.monitoredDocs.used, usage.monitoredDocs.limit)}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Team Members */}
                {usage.teamMembers.limit !== 1 && (
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-gray-700">Team Members</span>
                      <span className="text-sm text-gray-600">
                        {usage.teamMembers.used} / {usage.teamMembers.limit === 'unlimited' ? '∞' : usage.teamMembers.limit}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={clsx(
                          'h-2 rounded-full transition-all',
                          getUsageColor(getUsagePercentage(usage.teamMembers.used, usage.teamMembers.limit)) === 'green'
                            ? 'bg-green-500'
                            : getUsageColor(getUsagePercentage(usage.teamMembers.used, usage.teamMembers.limit)) === 'yellow'
                            ? 'bg-yellow-500'
                            : 'bg-red-500'
                        )}
                        style={{ width: `${getUsagePercentage(usage.teamMembers.used, usage.teamMembers.limit)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Usage Period Info */}
              {subscription && (
                <div className="mt-8 p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">
                    Usage period: {new Date(subscription.currentPeriodStart).toLocaleDateString()} - {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    Usage resets on {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                  </p>
                </div>
              )}
            </motion.div>
          )}

          {/* Invoices Tab */}
          {activeTab === 'invoices' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-white rounded-lg shadow-sm border border-gray-200"
            >
              {invoices.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Amount
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {invoices.map((invoice) => (
                        <tr key={invoice.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {new Date(invoice.date).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {new Intl.NumberFormat('en-US', {
                              style: 'currency',
                              currency: invoice.currency.toUpperCase()
                            }).format(invoice.amount / 100)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={clsx(
                              'px-2 inline-flex text-xs leading-5 font-semibold rounded-full',
                              invoice.status === 'paid'
                                ? 'bg-green-100 text-green-800'
                                : invoice.status === 'pending'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-red-100 text-red-800'
                            )}>
                              {invoice.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <a
                              href={invoice.downloadUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-indigo-600 hover:text-indigo-900"
                            >
                              Download
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-12 text-center">
                  <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900">No invoices</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Your invoices will appear here once you have a paid subscription.
                  </p>
                </div>
              )}
            </motion.div>
          )}

          {/* Payment Methods Tab */}
          {activeTab === 'payment' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              {paymentMethods.length > 0 ? (
                <>
                  {paymentMethods.map((method) => (
                    <div
                      key={method.id}
                      className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <CreditCardIcon className="h-10 w-10 text-gray-400" />
                          <div className="ml-4">
                            <p className="text-sm font-medium text-gray-900">
                              {method.brand} •••• {method.last4}
                            </p>
                            <p className="text-sm text-gray-500">
                              Expires {method.expiryMonth}/{method.expiryYear}
                            </p>
                          </div>
                          {method.isDefault && (
                            <span className="ml-4 px-3 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                              Default
                            </span>
                          )}
                        </div>
                        
                        <div className="flex items-center space-x-3">
                          {!method.isDefault && (
                            <button
                              onClick={() => handleUpdatePaymentMethod(method.id)}
                              className="text-sm text-indigo-600 hover:text-indigo-700"
                            >
                              Set as default
                            </button>
                          )}
                          <button className="text-sm text-red-600 hover:text-red-700">
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  <button
                    onClick={() => navigate('/account/add-payment-method')}
                    className="w-full bg-white rounded-lg shadow-sm border-2 border-dashed border-gray-300 p-6 text-center hover:border-gray-400 transition-colors"
                  >
                    <CreditCardIcon className="mx-auto h-8 w-8 text-gray-400" />
                    <p className="mt-2 text-sm font-medium text-gray-900">Add payment method</p>
                  </button>
                </>
              ) : (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
                  <CreditCardIcon className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900">No payment methods</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Add a payment method to subscribe to a paid plan.
                  </p>
                  <button
                    onClick={() => navigate('/account/add-payment-method')}
                    className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    Add payment method
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Billing