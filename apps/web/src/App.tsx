import React, { useState, useEffect } from 'react'
import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import {
  HomeIcon,
  DocumentMagnifyingGlassIcon,
  ClockIcon,
  UserCircleIcon,
  ArrowRightOnRectangleIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'

import DocumentUpload from './components/DocumentUpload'
import AnalysisResults from './components/AnalysisResults'
import { apiClient, AnalysisJob } from './services/api'
import { webSocketService } from './services/websocket'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
})

interface NavItemProps {
  to: string
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
  isActive?: boolean
}

const NavItem: React.FC<NavItemProps> = ({ to, icon: Icon, children, isActive }) => (
  <Link
    to={to}
    className={clsx(
      'flex items-center space-x-3 px-4 py-2 rounded-lg transition-colors',
      isActive
        ? 'bg-primary-100 text-primary-700 font-medium'
        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
    )}
  >
    <Icon className="w-5 h-5" />
    <span>{children}</span>
  </Link>
)

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [currentAnalysis, setCurrentAnalysis] = useState<AnalysisJob | null>(null)
  const [recentAnalyses, setRecentAnalyses] = useState<AnalysisJob[]>([])
  const location = useLocation()

  useEffect(() => {
    // Check authentication status
    const checkAuth = async () => {
      try {
        await apiClient.healthCheck()
        setIsAuthenticated(apiClient.isAuthenticated())
      } catch (error) {
        console.error('Health check failed:', error)
        setIsAuthenticated(false)
      } finally {
        setIsLoading(false)
      }
    }

    checkAuth()
  }, [])

  useEffect(() => {
    if (isAuthenticated) {
      // Connect WebSocket
      webSocketService.connect()
      
      // Load recent analyses
      loadRecentAnalyses()

      // Set up WebSocket listeners
      webSocketService.on('analysis:update', handleAnalysisUpdate)
      webSocketService.on('analysis:completed', handleAnalysisCompleted)
      webSocketService.on('analysis:failed', handleAnalysisFailed)

      return () => {
        webSocketService.off('analysis:update', handleAnalysisUpdate)
        webSocketService.off('analysis:completed', handleAnalysisCompleted)
        webSocketService.off('analysis:failed', handleAnalysisFailed)
        webSocketService.disconnect()
      }
    }
  }, [isAuthenticated])

  const loadRecentAnalyses = async () => {
    try {
      const response = await apiClient.getAnalysisList(1, 10)
      setRecentAnalyses(response.analyses)
    } catch (error) {
      console.error('Failed to load recent analyses:', error)
    }
  }

  const handleAnalysisUpdate = (data: any) => {
    if (currentAnalysis?.id === data.analysisId) {
      setCurrentAnalysis(prev => prev ? { ...prev, status: data.status, progress: data.progress } : null)
    }
  }

  const handleAnalysisCompleted = (data: any) => {
    if (currentAnalysis?.id === data.analysisId) {
      setCurrentAnalysis(prev => prev ? { ...prev, status: 'completed', result: data.result } : null)
      loadRecentAnalyses()
    }
  }

  const handleAnalysisFailed = (data: any) => {
    if (currentAnalysis?.id === data.analysisId) {
      setCurrentAnalysis(prev => prev ? { ...prev, status: 'failed' } : null)
    }
  }

  const handleAnalysisStart = async (analysisId: string) => {
    try {
      // Try to get the analysis, but handle queued state gracefully
      const analysis = await apiClient.getAnalysis(analysisId)
      setCurrentAnalysis(analysis)
      webSocketService.subscribeToAnalysis(analysisId)
      
      // If analysis is still processing, poll for updates
      if (analysis.status === 'queued' || analysis.status === 'processing') {
        pollAnalysisStatus(analysisId)
      }
    } catch (error: any) {
      console.error('Failed to get analysis:', error)
      // If analysis not found, create a placeholder for tracking
      if (error.response?.status === 404) {
        const placeholderAnalysis = {
          id: analysisId,
          status: 'queued' as const,
          progress: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
        setCurrentAnalysis(placeholderAnalysis)
        pollAnalysisStatus(analysisId)
      }
    }
  }

  const pollAnalysisStatus = (analysisId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const analysis = await apiClient.getAnalysis(analysisId)
        setCurrentAnalysis(analysis)
        
        if (analysis.status === 'completed' || analysis.status === 'failed') {
          clearInterval(pollInterval)
          loadRecentAnalyses() // Refresh the list
        }
      } catch (error) {
        console.error('Failed to poll analysis status:', error)
        clearInterval(pollInterval)
      }
    }, 2000) // Poll every 2 seconds
    
    // Clean up after 5 minutes to prevent infinite polling
    setTimeout(() => clearInterval(pollInterval), 5 * 60 * 1000)
  }

  const handleLogin = async (email: string, password: string) => {
    try {
      await apiClient.login({ email, password })
      setIsAuthenticated(true)
    } catch (error) {
      throw error
    }
  }

  const handleLogout = () => {
    apiClient.logout()
    webSocketService.disconnect()
    setIsAuthenticated(false)
    setCurrentAnalysis(null)
    setRecentAnalyses([])
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading Fine Print AI...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <QueryClientProvider client={queryClient}>
        <LoginPage onLogin={handleLogin} />
        <Toaster position="top-right" />
      </QueryClientProvider>
    )
  }

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-gray-50">
        <Toaster position="top-right" />
        
        {/* Navigation */}
        <nav className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center space-x-8">
                <Link to="/" className="flex items-center space-x-2">
                  <MagnifyingGlassIcon className="w-8 h-8 text-primary-600" />
                  <span className="text-xl font-bold text-gray-900">Fine Print AI</span>
                </Link>
                
                <div className="hidden md:flex items-center space-x-4">
                  <NavItem to="/" icon={HomeIcon} isActive={location.pathname === '/'}>
                    Dashboard
                  </NavItem>
                  <NavItem to="/analyze" icon={DocumentMagnifyingGlassIcon} isActive={location.pathname === '/analyze'}>
                    Analyze
                  </NavItem>
                  <NavItem to="/history" icon={ClockIcon} isActive={location.pathname === '/history'}>
                    History
                  </NavItem>
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <button
                  onClick={handleLogout}
                  className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors"
                >
                  <ArrowRightOnRectangleIcon className="w-5 h-5" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </div>
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <AnimatePresence mode="wait">
            <Routes>
              <Route path="/" element={<DashboardPage currentAnalysis={currentAnalysis} recentAnalyses={recentAnalyses} />} />
              <Route path="/analyze" element={<AnalyzePage onAnalysisStart={handleAnalysisStart} />} />
              <Route path="/history" element={<HistoryPage analyses={recentAnalyses} />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AnimatePresence>
        </main>
      </div>
    </QueryClientProvider>
  )
}

// Login Page Component
interface LoginPageProps {
  onLogin: (email: string, password: string) => Promise<void>
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('admin@fineprintai.com')
  const [password, setPassword] = useState('password')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      await onLogin(email, password)
    } catch (error: any) {
      setError(error.response?.data?.error || 'Login failed')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <MagnifyingGlassIcon className="w-12 h-12 text-primary-600" />
        </div>
        <h2 className="mt-6 text-center text-3xl font-bold text-gray-900">
          Sign in to Fine Print AI
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          AI-powered legal document analysis
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <div className="mt-1">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <div className="mt-1">
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input"
                />
              </div>
            </div>

            {error && (
              <div className="text-red-600 text-sm text-center">{error}</div>
            )}

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full btn-primary py-2 px-4"
              >
                {isLoading ? 'Signing in...' : 'Sign in'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

// Dashboard Page
interface DashboardPageProps {
  currentAnalysis: AnalysisJob | null
  recentAnalyses: AnalysisJob[]
}

const DashboardPage: React.FC<DashboardPageProps> = ({ currentAnalysis, recentAnalyses }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-8"
    >
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600">Monitor your document analysis activities</p>
      </div>

      {currentAnalysis && (
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Current Analysis</h2>
          <AnalysisResults analysis={currentAnalysis} />
        </div>
      )}

      {recentAnalyses && recentAnalyses.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Analyses</h2>
          <div className="grid gap-4">
            {recentAnalyses.slice(0, 3).map((analysis) => (
              <div key={analysis.id} className="card p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">Analysis #{analysis.id.slice(-8)}</p>
                    <p className="text-sm text-gray-600">
                      {new Date(analysis.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className={clsx(
                      'px-2 py-1 rounded-full text-xs font-medium',
                      analysis.status === 'completed' && 'bg-green-100 text-green-800',
                      analysis.status === 'processing' && 'bg-blue-100 text-blue-800',
                      analysis.status === 'failed' && 'bg-red-100 text-red-800',
                      analysis.status === 'pending' && 'bg-yellow-100 text-yellow-800'
                    )}>
                      {analysis.status}
                    </span>
                    {analysis.result && (
                      <span className="text-sm font-medium text-gray-600">
                        Risk: {analysis.result.riskScore}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!currentAnalysis && (!recentAnalyses || recentAnalyses.length === 0) && (
        <div className="text-center py-12">
          <DocumentMagnifyingGlassIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No analyses yet</h3>
          <p className="text-gray-600 mb-4">Start by analyzing your first legal document</p>
          <Link to="/analyze" className="btn-primary">
            Start Analysis
          </Link>
        </div>
      )}
    </motion.div>
  )
}

// Analyze Page
interface AnalyzePageProps {
  onAnalysisStart: (analysisId: string) => void
}

const AnalyzePage: React.FC<AnalyzePageProps> = ({ onAnalysisStart }) => {
  const [pageAnalysis, setPageAnalysis] = useState<AnalysisJob | null>(null)

  const handleAnalysisStart = async (analysisId: string) => {
    // Call the parent handler for global state
    onAnalysisStart(analysisId)
    
    // Also track analysis on this page
    try {
      const analysis = await apiClient.getAnalysis(analysisId)
      setPageAnalysis(analysis)
      
      // Poll for updates if still processing
      if (analysis.status === 'queued' || analysis.status === 'processing') {
        pollPageAnalysisStatus(analysisId)
      }
    } catch (error: any) {
      console.error('Failed to get analysis:', error)
      // Create placeholder for tracking
      if (error.response?.status === 404) {
        const placeholderAnalysis = {
          id: analysisId,
          status: 'queued' as const,
          progress: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
        setPageAnalysis(placeholderAnalysis)
        pollPageAnalysisStatus(analysisId)
      }
    }
  }

  const pollPageAnalysisStatus = (analysisId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const analysis = await apiClient.getAnalysis(analysisId)
        setPageAnalysis(analysis)
        
        if (analysis.status === 'completed' || analysis.status === 'failed') {
          clearInterval(pollInterval)
        }
      } catch (error) {
        console.error('Failed to poll analysis status:', error)
        clearInterval(pollInterval)
      }
    }, 2000)
    
    // Clean up after 5 minutes
    setTimeout(() => clearInterval(pollInterval), 5 * 60 * 1000)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-8"
    >
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900">Analyze Document</h1>
        <p className="text-gray-600 mt-2">
          Upload a legal document or paste text to identify problematic clauses
        </p>
      </div>

      <DocumentUpload onAnalysisStart={handleAnalysisStart} />
      
      {/* Show results directly on this page */}
      {pageAnalysis && (
        <div className="mt-8">
          <div className="border-t border-gray-200 pt-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Analysis Results</h2>
            <AnalysisResults analysis={pageAnalysis} />
          </div>
        </div>
      )}
    </motion.div>
  )
}

// History Page
interface HistoryPageProps {
  analyses: AnalysisJob[]
}

const HistoryPage: React.FC<HistoryPageProps> = ({ analyses }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-8"
    >
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Analysis History</h1>
        <p className="text-gray-600">View all your previous document analyses</p>
      </div>

      {analyses.length > 0 ? (
        <div className="space-y-4">
          {analyses.map((analysis) => (
            <div key={analysis.id} className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-gray-900">
                    Analysis #{analysis.id.slice(-8)}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {new Date(analysis.createdAt).toLocaleString()}
                  </p>
                </div>
                <span className={clsx(
                  'px-3 py-1 rounded-full text-sm font-medium',
                  analysis.status === 'completed' && 'bg-green-100 text-green-800',
                  analysis.status === 'processing' && 'bg-blue-100 text-blue-800',
                  analysis.status === 'failed' && 'bg-red-100 text-red-800',
                  analysis.status === 'pending' && 'bg-yellow-100 text-yellow-800'
                )}>
                  {analysis.status}
                </span>
              </div>
              
              {analysis.result && (
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{analysis.result.riskScore}</p>
                    <p className="text-sm text-gray-600">Risk Score</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{analysis.result.totalClauses}</p>
                    <p className="text-sm text-gray-600">Total Clauses</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{analysis.result.problematicClauses}</p>
                    <p className="text-sm text-gray-600">Issues Found</p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <ClockIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No analysis history</h3>
          <p className="text-gray-600">Your completed analyses will appear here</p>
        </div>
      )}
    </motion.div>
  )
}

export default App