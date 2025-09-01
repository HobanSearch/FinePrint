import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  DocumentMagnifyingGlassIcon,
  ClockIcon,
  ChartBarIcon,
  ExclamationTriangleIcon,
  ArrowTrendingUpIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  ArrowRightIcon
} from '@heroicons/react/24/outline'
import { apiClient, AnalysisJob } from '../../services/api'

interface DashboardStats {
  totalAnalyses: number
  thisMonth: number
  riskDetected: number
  avgRiskScore: number
}

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats>({
    totalAnalyses: 0,
    thisMonth: 0,
    riskDetected: 0,
    avgRiskScore: 0
  })
  const [recentAnalyses, setRecentAnalyses] = useState<AnalysisJob[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadDashboardData()
  }, [])

  const loadDashboardData = async () => {
    try {
      // Load recent analyses
      const response = await apiClient.getAnalysisList(1, 5)
      setRecentAnalyses(response.analyses)
      
      // Calculate stats from analyses
      const total = response.total || 0
      const thisMonthCount = response.analyses.filter(a => {
        const date = new Date(a.createdAt)
        const now = new Date()
        return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()
      }).length
      
      const withRisk = response.analyses.filter(a => a.result && a.result.riskScore > 50).length
      const avgScore = response.analyses.reduce((acc, a) => acc + (a.result?.riskScore || 0), 0) / (response.analyses.length || 1)
      
      setStats({
        totalAnalyses: total,
        thisMonth: thisMonthCount,
        riskDetected: withRisk,
        avgRiskScore: Math.round(avgScore)
      })
    } catch (error) {
      console.error('Failed to load dashboard data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const quickActions = [
    {
      title: 'Analyze Document',
      description: 'Upload a new document for analysis',
      icon: DocumentMagnifyingGlassIcon,
      href: '/app/analyze',
      color: 'bg-indigo-500'
    },
    {
      title: 'View History',
      description: 'Review your past analyses',
      icon: ClockIcon,
      href: '/app/history',
      color: 'bg-purple-500'
    },
    {
      title: 'Subscription',
      description: 'Manage your plan and billing',
      icon: ChartBarIcon,
      href: '/app/billing',
      color: 'bg-green-500'
    }
  ]

  const statCards = [
    {
      title: 'Total Analyses',
      value: stats.totalAnalyses,
      icon: DocumentTextIcon,
      change: '+12%',
      changeType: 'positive'
    },
    {
      title: 'This Month',
      value: stats.thisMonth,
      icon: ArrowTrendingUpIcon,
      change: '+5',
      changeType: 'positive'
    },
    {
      title: 'Risks Detected',
      value: stats.riskDetected,
      icon: ExclamationTriangleIcon,
      change: '2 critical',
      changeType: 'negative'
    },
    {
      title: 'Avg Risk Score',
      value: `${stats.avgRiskScore}%`,
      icon: ChartBarIcon,
      change: '-8%',
      changeType: 'positive'
    }
  ]

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-2">Welcome back! Here's an overview of your document analysis activity.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, index) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
            className="bg-white p-6 rounded-lg shadow-sm border border-gray-200"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">{stat.value}</p>
                <p className={`text-sm mt-2 ${
                  stat.changeType === 'positive' ? 'text-green-600' : 'text-red-600'
                }`}>
                  {stat.change} from last month
                </p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <stat.icon className="h-6 w-6 text-gray-600" />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {quickActions.map((action, index) => (
            <motion.div
              key={action.title}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
            >
              <Link
                to={action.href}
                className="block p-6 bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center">
                  <div className={`p-3 rounded-lg ${action.color}`}>
                    <action.icon className="h-6 w-6 text-white" />
                  </div>
                  <div className="ml-4 flex-1">
                    <h3 className="text-lg font-medium text-gray-900">{action.title}</h3>
                    <p className="text-sm text-gray-500 mt-1">{action.description}</p>
                  </div>
                  <ArrowRightIcon className="h-5 w-5 text-gray-400" />
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Recent Analyses */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Recent Analyses</h2>
          <Link to="/app/history" className="text-sm text-indigo-600 hover:text-indigo-500">
            View all →
          </Link>
        </div>
        
        {recentAnalyses.length > 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Document
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Risk Score
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {recentAnalyses.map((analysis) => (
                  <tr key={analysis.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <DocumentTextIcon className="h-5 w-5 text-gray-400 mr-3" />
                        <span className="text-sm font-medium text-gray-900">
                          Document #{analysis.id.slice(-8)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(analysis.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {analysis.result ? (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          analysis.result.riskScore > 70 
                            ? 'bg-red-100 text-red-800'
                            : analysis.result.riskScore > 40
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {analysis.result.riskScore}% Risk
                        </span>
                      ) : (
                        <span className="text-sm text-gray-500">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {analysis.status === 'completed' ? (
                        <span className="flex items-center text-sm text-green-600">
                          <CheckCircleIcon className="h-4 w-4 mr-1" />
                          Completed
                        </span>
                      ) : (
                        <span className="text-sm text-gray-500">
                          {analysis.status}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <Link
                        to={`/app/analysis/${analysis.id}`}
                        className="text-indigo-600 hover:text-indigo-900"
                      >
                        View Details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <DocumentMagnifyingGlassIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No analyses yet</h3>
            <p className="text-gray-500 mb-4">Start by analyzing your first document</p>
            <Link
              to="/app/analyze"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
            >
              <DocumentMagnifyingGlassIcon className="h-5 w-5 mr-2" />
              Analyze Document
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

export default Dashboard