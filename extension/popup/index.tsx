import { useEffect, useState } from "react"
import { useStorage } from "@plasmohq/storage/hook"
import { sendToBackground } from "@plasmohq/messaging"
import { 
  AlertTriangle, 
  CheckCircle, 
  ExternalLink, 
  Eye, 
  EyeOff, 
  RefreshCw, 
  Settings,
  Shield,
  TrendingUp,
  Zap
} from "lucide-react"

import type { PageAnalysisState, ExtensionSettings } from "@/types"
import "../style.css"

interface PopupState {
  currentTab?: chrome.tabs.Tab
  analysis?: PageAnalysisState
  isLoading: boolean
  error?: string
}

export default function IndexPopup() {
  const [settings] = useStorage<ExtensionSettings>("settings")
  const [state, setState] = useState<PopupState>({
    isLoading: true
  })

  useEffect(() => {
    initializePopup()
  }, [])

  const initializePopup = async () => {
    try {
      // Get current active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      
      if (!tab || !tab.url) {
        setState({ isLoading: false, error: "No active tab found" })
        return
      }

      setState(prev => ({ ...prev, currentTab: tab }))

      // Get analysis for current URL
      const analysis = await sendToBackground({
        name: "getAnalysis",
        body: { url: tab.url }
      })

      setState(prev => ({
        ...prev,
        analysis,
        isLoading: false
      }))

    } catch (error) {
      console.error("Failed to initialize popup:", error)
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : "Failed to load"
      }))
    }
  }

  const startAnalysis = async () => {
    if (!state.currentTab?.url) return

    setState(prev => ({ ...prev, isLoading: true, error: undefined }))

    try {
      // Get page content from content script
      const pageData = await chrome.tabs.sendMessage(state.currentTab.id!, {
        type: "GET_PAGE_CONTENT"
      })

      // Start analysis
      const result = await sendToBackground({
        name: "startAnalysis",
        body: {
          url: state.currentTab.url,
          title: state.currentTab.title || "",
          content: pageData.content,
          detection: {
            isTermsPage: true, // Assume true for manual analysis
            isPrivacyPage: true,
            documentType: "terms",
            confidence: 1.0,
            indicators: ["Manual analysis"]
          }
        }
      })

      setState(prev => ({
        ...prev,
        analysis: result,
        isLoading: false
      }))

    } catch (error) {
      console.error("Analysis failed:", error)
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : "Analysis failed"
      }))
    }
  }

  const toggleHighlights = async () => {
    if (!state.currentTab?.id) return

    try {
      await chrome.tabs.sendMessage(state.currentTab.id, {
        type: "TOGGLE_HIGHLIGHTS"
      })
    } catch (error) {
      console.error("Failed to toggle highlights:", error)
    }
  }

  const openFullReport = () => {
    if (state.analysis?.analysisId) {
      const reportUrl = `${settings?.apiEndpoint || 'http://localhost:3003'}/analysis/${state.analysis.analysisId}`
      chrome.tabs.create({ url: reportUrl })
    }
  }

  const openOptions = () => {
    chrome.runtime.openOptionsPage()
  }

  if (state.isLoading) {
    return (
      <div className="w-96 p-6 bg-white">
        <div className="flex items-center justify-center space-x-3">
          <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
          <span className="text-gray-600">Loading...</span>
        </div>
      </div>
    )
  }

  if (state.error) {
    return (
      <div className="w-96 p-6 bg-white">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Error</h3>
          <p className="text-sm text-gray-600 mb-4">{state.error}</p>
          <button
            onClick={initializePopup}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  const { analysis } = state

  return (
    <div className="w-96 bg-white shadow-lg">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-4 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Shield className="w-6 h-6" />
            <span className="font-semibold">Fine Print AI</span>
          </div>
          <button
            onClick={openOptions}
            className="p-1 hover:bg-white/20 rounded transition-colors"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
        
        <div className="mt-2">
          <p className="text-sm text-blue-100">
            {state.currentTab?.title || "Current Page"}
          </p>
          <p className="text-xs text-blue-200 truncate">
            {state.currentTab?.url}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {!analysis ? (
          /* No Analysis State */
          <div className="text-center py-8">
            <Zap className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Ready to Analyze
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Click the button below to analyze this page for legal issues and privacy concerns.
            </p>
            <button
              onClick={startAnalysis}
              disabled={state.isLoading}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {state.isLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin mx-auto" />
              ) : (
                "Analyze Page"
              )}
            </button>
          </div>
        ) : (
          /* Analysis Results */
          <div className="space-y-4">
            {/* Risk Score */}
            {analysis.riskScore !== null && analysis.riskScore !== undefined && (
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">Risk Score</span>
                  <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                    getRiskScoreStyle(analysis.riskScore)
                  }`}>
                    {analysis.riskScore}/100
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      getRiskScoreBarColor(analysis.riskScore)
                    }`}
                    style={{ width: `${analysis.riskScore}%` }}
                  />
                </div>
                <p className="text-xs text-gray-600 mt-2">
                  {getRiskScoreDescription(analysis.riskScore)}
                </p>
              </div>
            )}

            {/* Document Type */}
            {analysis.documentType && (
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full" />
                <span className="text-sm text-gray-600">
                  Document Type: <span className="font-medium capitalize">{analysis.documentType}</span>
                </span>
              </div>
            )}

            {/* Findings Summary */}
            {analysis.findings.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-gray-900">
                    {analysis.findings.length} Issues Found
                  </h4>
                  <button
                    onClick={toggleHighlights}
                    className="flex items-center space-x-1 text-sm text-blue-600 hover:text-blue-800"
                    title="Toggle highlights on page"
                  >
                    <Eye className="w-4 h-4" />
                    <span>Highlights</span>
                  </button>
                </div>

                {/* Findings by Severity */}
                <div className="space-y-2">
                  {getSeverityGroups(analysis.findings).map(({ severity, count, color }) => (
                    <div key={severity} className="flex items-center justify-between py-1">
                      <div className="flex items-center space-x-2">
                        <div className={`w-3 h-3 rounded-full ${color}`} />
                        <span className="text-sm capitalize">{severity}</span>
                      </div>
                      <span className="text-sm font-medium">{count}</span>
                    </div>
                  ))}
                </div>

                {/* Top Findings */}
                <div className="space-y-2">
                  <h5 className="text-sm font-medium text-gray-700">Top Issues</h5>
                  {analysis.findings.slice(0, 3).map((finding) => (
                    <div key={finding.id} className="bg-gray-50 rounded-lg p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h6 className="text-sm font-medium text-gray-900 mb-1">
                            {finding.title}
                          </h6>
                          <p className="text-xs text-gray-600 line-clamp-2">
                            {finding.description}
                          </p>
                          {finding.recommendation && (
                            <p className="text-xs text-blue-600 mt-1">
                              💡 {finding.recommendation}
                            </p>
                          )}
                        </div>
                        <div className={`ml-2 px-2 py-1 rounded text-xs font-medium ${
                          getSeverityStyle(finding.severity)
                        }`}>
                          {finding.severity.toUpperCase()}
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {analysis.findings.length > 3 && (
                    <p className="text-xs text-gray-500 text-center">
                      +{analysis.findings.length - 3} more issues
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
                <p className="text-sm text-gray-600">No major issues found</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex space-x-2 pt-4 border-t">
              <button
                onClick={startAnalysis}
                disabled={state.isLoading}
                className="flex-1 bg-gray-100 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium disabled:opacity-50"
              >
                <RefreshCw className="w-4 h-4 inline mr-1" />
                Re-analyze
              </button>
              
              {analysis.analysisId && (
                <button
                  onClick={openFullReport}
                  className="flex-1 bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                >
                  <ExternalLink className="w-4 h-4 inline mr-1" />
                  Full Report
                </button>
              )}
            </div>

            {/* Last Analyzed */}
            {analysis.lastAnalyzed && (
              <p className="text-xs text-gray-500 text-center">
                Last analyzed {formatDate(analysis.lastAnalyzed)}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="bg-gray-50 px-4 py-3 text-center border-t">
        <p className="text-xs text-gray-600">
          Powered by Fine Print AI • <button 
            onClick={openOptions}
            className="text-blue-600 hover:text-blue-800"
          >
            Settings
          </button>
        </p>
      </div>
    </div>
  )
}

// Helper functions
function getRiskScoreStyle(score: number): string {
  if (score >= 80) return "bg-red-100 text-red-800"
  if (score >= 60) return "bg-orange-100 text-orange-800"
  if (score >= 40) return "bg-yellow-100 text-yellow-800"
  return "bg-green-100 text-green-800"
}

function getRiskScoreBarColor(score: number): string {
  if (score >= 80) return "bg-red-500"
  if (score >= 60) return "bg-orange-500"
  if (score >= 40) return "bg-yellow-500"
  return "bg-green-500"
}

function getRiskScoreDescription(score: number): string {
  if (score >= 80) return "High risk - Multiple serious concerns found"
  if (score >= 60) return "Medium-high risk - Several issues identified"
  if (score >= 40) return "Medium risk - Some concerns to review"
  if (score >= 20) return "Low-medium risk - Minor issues found"
  return "Low risk - Document appears acceptable"
}

function getSeverityStyle(severity: string): string {
  switch (severity) {
    case 'critical': return "bg-red-100 text-red-800"
    case 'high': return "bg-orange-100 text-orange-800"
    case 'medium': return "bg-yellow-100 text-yellow-800"
    case 'low': return "bg-green-100 text-green-800"
    default: return "bg-gray-100 text-gray-800"
  }
}

function getSeverityGroups(findings: any[]) {
  const groups = findings.reduce((acc, finding) => {
    acc[finding.severity] = (acc[finding.severity] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return [
    { severity: 'critical', count: groups.critical || 0, color: 'bg-red-500' },
    { severity: 'high', count: groups.high || 0, color: 'bg-orange-500' },
    { severity: 'medium', count: groups.medium || 0, color: 'bg-yellow-500' },
    { severity: 'low', count: groups.low || 0, color: 'bg-green-500' }
  ].filter(group => group.count > 0)
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return "just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}