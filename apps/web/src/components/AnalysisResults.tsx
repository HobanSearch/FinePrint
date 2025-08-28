import React, { useState } from 'react'
import { motion } from 'framer-motion'
import {
  ExclamationTriangleIcon,
  ShieldExclamationIcon,
  CheckCircleIcon,
  ClockIcon,
  DocumentTextIcon,
  ChartBarIcon,
  ArrowDownTrayIcon,
  SparklesIcon,
  CpuChipIcon,
} from '@heroicons/react/24/outline'
import { AnalysisJob, AnalysisResult } from '../services/api'
import RiskScoreGauge from './RiskScoreGauge'
import FindingCard from './FindingCard'
import clsx from 'clsx'

interface AnalysisResultsProps {
  analysis: AnalysisJob
  onRetry?: () => void
}

const AnalysisResults: React.FC<AnalysisResultsProps> = ({ analysis, onRetry }) => {
  const [expandedFinding, setExpandedFinding] = useState<string | null>(null)
  const getSeverityColor = (severity: 'low' | 'medium' | 'high' | 'critical') => {
    switch (severity) {
      case 'low':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200'
      case 'medium':
        return 'text-orange-600 bg-orange-50 border-orange-200'
      case 'high':
        return 'text-red-600 bg-red-50 border-red-200'
      case 'critical':
        return 'text-red-800 bg-red-100 border-red-300'
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200'
    }
  }

  const getSeverityIcon = (severity: 'low' | 'medium' | 'high' | 'critical') => {
    switch (severity) {
      case 'low':
        return <ExclamationTriangleIcon className="w-5 h-5 text-yellow-600" />
      case 'medium':
        return <ExclamationTriangleIcon className="w-5 h-5 text-orange-600" />
      case 'high':
        return <ShieldExclamationIcon className="w-5 h-5 text-red-600" />
      case 'critical':
        return <ShieldExclamationIcon className="w-5 h-5 text-red-800" />
      default:
        return <ExclamationTriangleIcon className="w-5 h-5 text-gray-600" />
    }
  }

  const getRiskScoreColor = (score: number) => {
    if (score >= 80) return 'text-red-600 bg-red-50 border-red-200'
    if (score >= 60) return 'text-orange-600 bg-orange-50 border-orange-200'
    if (score >= 40) return 'text-yellow-600 bg-yellow-50 border-yellow-200'
    return 'text-green-600 bg-green-50 border-green-200'
  }

  const getRiskLabel = (score: number) => {
    if (score >= 80) return 'High Risk'
    if (score >= 60) return 'Medium Risk'
    if (score >= 40) return 'Low Risk'
    return 'Minimal Risk'
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  const exportResults = () => {
    if (!analysis.result) return
    
    const exportData = {
      analysisId: analysis.id,
      createdAt: analysis.createdAt,
      riskScore: analysis.result.riskScore,
      findings: analysis.result.findings,
      recommendations: analysis.result.recommendations,
      summary: analysis.result.summary,
    }
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `fine-print-analysis-${analysis.id}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (analysis.status === 'pending' || analysis.status === 'processing') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card p-6 text-center"
      >
        <div className="flex flex-col items-center space-y-4">
          <div className="relative">
            <ClockIcon className="w-12 h-12 text-primary-600 animate-pulse" />
            <div className="absolute inset-0 rounded-full border-2 border-primary-200 border-t-primary-600 animate-spin"></div>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {analysis.status === 'pending' ? 'Analysis Queued' : 'Analyzing Document'}
            </h3>
            <p className="text-gray-600 mb-4">
              {analysis.status === 'pending' 
                ? 'Your analysis is in queue and will start shortly'
                : 'Our AI is analyzing the document for problematic clauses'
              }
            </p>
            {analysis.progress > 0 && (
              <div className="w-full max-w-md mx-auto">
                <div className="flex justify-between text-sm text-gray-600 mb-1">
                  <span>Progress</span>
                  <span>{analysis.progress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <motion.div
                    className="bg-primary-600 h-2 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${analysis.progress}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    )
  }

  if (analysis.status === 'failed') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card p-6 text-center"
      >
        <div className="flex flex-col items-center space-y-4">
          <ShieldExclamationIcon className="w-12 h-12 text-red-600" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Analysis Failed</h3>
            <p className="text-gray-600 mb-4">
              We encountered an error while analyzing your document. Please try again.
            </p>
            {onRetry && (
              <button onClick={onRetry} className="btn-primary">
                Try Again
              </button>
            )}
          </div>
        </div>
      </motion.div>
    )
  }

  if (!analysis.result) {
    return (
      <div className="card p-6 text-center text-gray-500">
        <DocumentTextIcon className="w-12 h-12 mx-auto mb-4 text-gray-400" />
        <p>No analysis results available</p>
      </div>
    )
  }

  const result = analysis.result

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header with Risk Score */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Analysis Results</h2>
            <p className="text-gray-600">Completed on {formatDate(analysis.updatedAt)}</p>
          </div>
          <button
            onClick={exportResults}
            className="btn-secondary flex items-center space-x-2"
          >
            <ArrowDownTrayIcon className="w-4 h-4" />
            <span>Export</span>
          </button>
        </div>

        {/* Enhanced Risk Visualization */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Risk Score Gauge */}
          <div className="lg:col-span-1">
            <RiskScoreGauge 
              score={result.riskScore} 
              size="lg" 
              animated={true}
              showDetails={true}
            />
          </div>

          {/* Statistics Cards */}
          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white rounded-xl border border-gray-200 p-6 shadow-lg hover:shadow-xl transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Clauses</p>
                  <motion.p 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.4, type: "spring", stiffness: 300 }}
                    className="text-3xl font-bold text-gray-900"
                  >
                    {result.totalClauses}
                  </motion.p>
                  <p className="text-sm text-gray-600">Analyzed by AI</p>
                </div>
                <div className="p-3 bg-blue-100 rounded-xl">
                  <DocumentTextIcon className="w-8 h-8 text-blue-600" />
                </div>
              </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-white rounded-xl border border-gray-200 p-6 shadow-lg hover:shadow-xl transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Issues Found</p>
                  <motion.p 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.5, type: "spring", stiffness: 300 }}
                    className="text-3xl font-bold text-orange-600"
                  >
                    {result.problematicClauses}
                  </motion.p>
                  <p className="text-sm text-gray-600">Problematic clauses</p>
                </div>
                <div className="p-3 bg-orange-100 rounded-xl">
                  <ExclamationTriangleIcon className="w-8 h-8 text-orange-600" />
                </div>
              </div>
            </motion.div>

            {/* AI Analysis Info */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="sm:col-span-2 bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl border border-purple-200 p-6"
            >
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <SparklesIcon className="w-6 h-6 text-purple-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-purple-900">AI-Powered Analysis</h3>
                  <div className="flex items-center space-x-4 mt-1 text-sm text-purple-700">
                    <span className="flex items-center space-x-1">
                      <CpuChipIcon className="w-4 h-4" />
                      <span>DSPy + LoRA Enhanced</span>
                    </span>
                    {(analysis.result as any)?.aiMetadata?.confidence && (
                      <span>
                        {Math.round((analysis.result as any).aiMetadata.confidence * 100)}% confidence
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Executive Summary</h3>
        <p className="text-gray-700 leading-relaxed">{result.summary}</p>
      </div>

      {/* Enhanced Findings Section */}
      {result.findings && result.findings.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-white rounded-2xl border border-gray-200 p-8 shadow-lg"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-2xl font-bold text-gray-900">
                Problematic Clauses
              </h3>
              <p className="text-gray-600 mt-1">
                {result.findings.length} issue{result.findings.length !== 1 ? 's' : ''} found in this document
              </p>
            </div>
            
            {/* Severity Summary */}
            <div className="flex items-center space-x-2">
              {['critical', 'high', 'medium', 'low'].map(severity => {
                const count = result.findings.filter(f => f.severity === severity).length
                if (count === 0) return null
                
                const severityColors = {
                  critical: 'bg-red-100 text-red-800',
                  high: 'bg-orange-100 text-orange-800', 
                  medium: 'bg-yellow-100 text-yellow-800',
                  low: 'bg-blue-100 text-blue-800'
                }
                
                return (
                  <span
                    key={severity}
                    className={clsx(
                      'px-2 py-1 rounded-full text-xs font-medium',
                      severityColors[severity as keyof typeof severityColors]
                    )}
                  >
                    {count} {severity}
                  </span>
                )
              })}
            </div>
          </div>
          
          <div className="space-y-4">
            {result.findings
              .sort((a, b) => {
                // Sort by severity: critical > high > medium > low
                const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 }
                return severityOrder[b.severity] - severityOrder[a.severity]
              })
              .map((finding, index) => (
                <FindingCard
                  key={finding.id}
                  finding={finding}
                  index={index}
                  isExpanded={expandedFinding === finding.id}
                  onToggle={() => setExpandedFinding(
                    expandedFinding === finding.id ? null : finding.id
                  )}
                  showClauseText={true}
                />
              ))
            }
          </div>
          
          {/* Quick Actions */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200"
          >
            <div className="flex space-x-3">
              <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
                Generate Report
              </button>
              <button className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium">
                Share Analysis
              </button>
            </div>
            
            <button 
              onClick={() => setExpandedFinding(expandedFinding ? null : result.findings[0]?.id)}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              {expandedFinding ? 'Collapse All' : 'Expand All'}
            </button>
          </motion.div>
        </motion.div>
      )}

      {/* Recommendations */}
      {result.recommendations && result.recommendations.length > 0 && (
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">General Recommendations</h3>
          <div className="space-y-3">
            {result.recommendations.map((recommendation, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex items-start space-x-3"
              >
                <CheckCircleIcon className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                <p className="text-gray-700">{recommendation}</p>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  )
}

export default AnalysisResults