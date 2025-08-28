import React from 'react'
import { motion } from 'framer-motion'
import { useAnalysisStats, useAuth } from '../stores'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { FileSearch, Shield, Activity, Clock, TrendingUp, AlertTriangle } from 'lucide-react'

export default function Dashboard() {
  const { user } = useAuth()
  const analysisStats = useAnalysisStats()

  const quickStats = [
    {
      id: 'total-analyses',
      label: 'Total Analyses',
      value: analysisStats.total.toString(),
      change: { value: 12, direction: 'up' as const, period: 'last month' },
      icon: FileSearch,
      color: 'guardian' as const
    },
    {
      id: 'critical-issues',
      label: 'Critical Issues Found',
      value: analysisStats.critical.toString(),
      change: { value: 5, direction: 'down' as const, period: 'last week' },
      icon: AlertTriangle,
      color: 'danger' as const
    },
    {
      id: 'analysis-progress',
      label: 'Analysis in Progress',
      value: analysisStats.isAnalyzing ? '1' : '0',
      change: { value: analysisStats.progress, direction: 'up' as const, period: 'current' },
      icon: Activity,
      color: 'sage' as const
    },
    {
      id: 'time-saved',
      label: 'Hours Saved',
      value: '156',
      change: { value: 18, direction: 'up' as const, period: 'this month' },
      icon: Clock,
      color: 'guardian' as const
    }
  ]

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="text-3xl font-bold text-foreground">
          Welcome back, {user?.displayName || user?.email || 'User'}!
        </h1>
        <p className="text-muted-foreground mt-2">
          Here's what's happening with your document analyses
        </p>
      </motion.div>

      {/* Quick Stats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
      >
        {quickStats.map((stat, index) => (
          <motion.div
            key={stat.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 + index * 0.1 }}
          >
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      {stat.label}
                    </p>
                    <p className="text-2xl font-bold text-foreground">
                      {stat.value}
                    </p>
                    <div className="flex items-center mt-1">
                      <TrendingUp 
                        className={`h-3 w-3 mr-1 ${
                          stat.change.direction === 'up' 
                            ? 'text-green-500' 
                            : 'text-red-500'
                        }`} 
                      />
                      <span 
                        className={`text-xs ${
                          stat.change.direction === 'up' 
                            ? 'text-green-500' 
                            : 'text-red-500'
                        }`}
                      >
                        {stat.change.direction === 'up' ? '+' : '-'}{stat.change.value}% {stat.change.period}
                      </span>
                    </div>
                  </div>
                  <div className={`p-3 rounded-full bg-${stat.color}/10`}>
                    <stat.icon className={`h-6 w-6 text-${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Recent Activity */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Recent Analyses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Placeholder for recent analyses */}
              <div className="text-center py-8 text-muted-foreground">
                <FileSearch className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No recent analyses</p>
                <p className="text-sm">Upload a document to get started</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Security Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <span className="text-sm font-medium">Account Security</span>
                <span className="text-sm text-green-600 font-medium">Secure</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <span className="text-sm font-medium">Data Encryption</span>
                <span className="text-sm text-green-600 font-medium">Enabled</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <span className="text-sm font-medium">Privacy Settings</span>
                <span className="text-sm text-blue-600 font-medium">Configured</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}