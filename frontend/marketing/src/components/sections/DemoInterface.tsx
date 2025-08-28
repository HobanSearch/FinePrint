'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Upload, Link, FileText, Loader2, AlertTriangle, CheckCircle, Info } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

const sampleDocuments = [
  { id: 'facebook-tos', name: 'Facebook Terms of Service', type: 'tos' },
  { id: 'google-privacy', name: 'Google Privacy Policy', type: 'privacy' },
  { id: 'tiktok-tos', name: 'TikTok Terms of Service', type: 'tos' },
  { id: 'amazon-privacy', name: 'Amazon Privacy Notice', type: 'privacy' },
]

const mockResults = {
  score: 4.2,
  rating: 'fair',
  issues: [
    {
      severity: 'high',
      category: 'Data Sharing',
      title: 'Broad third-party data sharing',
      description: 'Your data may be shared with numerous third parties for marketing and advertising purposes.',
    },
    {
      severity: 'medium',
      category: 'Account Termination',
      title: 'Unilateral termination rights',
      description: 'The service can terminate your account at any time without prior notice.',
    },
    {
      severity: 'high',
      category: 'Legal Rights',
      title: 'Class action waiver',
      description: 'You waive your right to participate in class action lawsuits against the company.',
    },
    {
      severity: 'low',
      category: 'Changes',
      title: 'Terms can change without notice',
      description: 'The terms can be modified at any time without direct notification to users.',
    },
  ],
  positives: [
    'Clear data deletion process',
    'GDPR compliance mentioned',
    'Opt-out options available',
  ],
}

export function DemoInterface() {
  const [activeTab, setActiveTab] = useState<'url' | 'text' | 'sample'>('sample')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [results, setResults] = useState<typeof mockResults | null>(null)
  const [selectedSample, setSelectedSample] = useState('')
  const [urlInput, setUrlInput] = useState('')
  const [textInput, setTextInput] = useState('')

  const handleAnalyze = async () => {
    setIsAnalyzing(true)
    setResults(null)
    
    // Simulate analysis
    await new Promise(resolve => setTimeout(resolve, 3000))
    
    setResults(mockResults)
    setIsAnalyzing(false)
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'border-danger-200 bg-danger-50'
      case 'medium':
        return 'border-warning-200 bg-warning-50'
      case 'low':
        return 'border-blue-200 bg-blue-50'
      default:
        return 'border-gray-200 bg-gray-50'
    }
  }

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'high':
        return <AlertTriangle className="h-5 w-5 text-danger-600" />
      case 'medium':
        return <Info className="h-5 w-5 text-warning-600" />
      case 'low':
        return <Info className="h-5 w-5 text-blue-600" />
      default:
        return <Info className="h-5 w-5 text-gray-600" />
    }
  }

  return (
    <div className="py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl font-bold text-gray-900">Try Fine Print AI</h1>
          <p className="mt-4 text-xl text-gray-600">
            Test our analysis with sample documents or your own content
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Input Section */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
          >
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Document Input</h2>

            {/* Tabs */}
            <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg mb-6">
              <button
                onClick={() => setActiveTab('sample')}
                className={cn(
                  'flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all',
                  activeTab === 'sample'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                )}
              >
                <FileText className="h-4 w-4 inline mr-2" />
                Sample Docs
              </button>
              <button
                onClick={() => setActiveTab('url')}
                className={cn(
                  'flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all',
                  activeTab === 'url'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                )}
              >
                <Link className="h-4 w-4 inline mr-2" />
                URL
              </button>
              <button
                onClick={() => setActiveTab('text')}
                className={cn(
                  'flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all',
                  activeTab === 'text'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                )}
              >
                <Upload className="h-4 w-4 inline mr-2" />
                Paste Text
              </button>
            </div>

            {/* Tab Content */}
            <div className="min-h-[300px]">
              {activeTab === 'sample' && (
                <div className="space-y-3">
                  {sampleDocuments.map((doc) => (
                    <label
                      key={doc.id}
                      className={cn(
                        'flex items-center p-4 rounded-lg border-2 cursor-pointer transition-all',
                        selectedSample === doc.id
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-200 hover:border-gray-300'
                      )}
                    >
                      <input
                        type="radio"
                        name="sample"
                        value={doc.id}
                        checked={selectedSample === doc.id}
                        onChange={(e) => setSelectedSample(e.target.value)}
                        className="sr-only"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{doc.name}</div>
                        <div className="text-sm text-gray-600 capitalize">{doc.type}</div>
                      </div>
                    </label>
                  ))}
                </div>
              )}

              {activeTab === 'url' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Document URL
                  </label>
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://example.com/terms"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                  <p className="mt-2 text-sm text-gray-600">
                    Enter the URL of a Terms of Service or Privacy Policy
                  </p>
                </div>
              )}

              {activeTab === 'text' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Document Text
                  </label>
                  <textarea
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="Paste the legal document text here..."
                    className="w-full h-48 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                  />
                  <p className="mt-2 text-sm text-gray-600">
                    Paste the full text of the document you want to analyze
                  </p>
                </div>
              )}
            </div>

            <Button
              onClick={handleAnalyze}
              disabled={isAnalyzing || (activeTab === 'sample' && !selectedSample) || (activeTab === 'url' && !urlInput) || (activeTab === 'text' && !textInput)}
              size="lg"
              variant="gradient"
              className="w-full mt-6"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Analyzing...
                </>
              ) : (
                'Analyze Document'
              )}
            </Button>

            <p className="mt-4 text-xs text-gray-500 text-center">
              This is a demo with sample results. Get the full version for real analysis.
            </p>
          </motion.div>

          {/* Results Section */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
          >
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Analysis Results</h2>

            {!results && !isAnalyzing && (
              <div className="flex items-center justify-center h-full min-h-[400px] text-gray-400">
                <div className="text-center">
                  <FileText className="h-12 w-12 mx-auto mb-4" />
                  <p>Select a document and click analyze to see results</p>
                </div>
              </div>
            )}

            {isAnalyzing && (
              <div className="flex items-center justify-center h-full min-h-[400px]">
                <div className="text-center">
                  <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-primary-600" />
                  <p className="text-gray-600">Analyzing document...</p>
                  <p className="text-sm text-gray-500 mt-2">This usually takes 3-5 seconds</p>
                </div>
              </div>
            )}

            {results && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
              >
                {/* Score */}
                <div className="text-center mb-8">
                  <div className="text-5xl font-bold text-gray-900">{results.score}</div>
                  <div className="text-lg text-gray-600">out of 10</div>
                  <div className={cn(
                    'inline-flex items-center px-3 py-1 rounded-full text-sm font-medium mt-2',
                    results.rating === 'good' && 'bg-success-100 text-success-700',
                    results.rating === 'fair' && 'bg-warning-100 text-warning-700',
                    results.rating === 'poor' && 'bg-danger-100 text-danger-700'
                  )}>
                    {results.rating.toUpperCase()} Privacy Score
                  </div>
                </div>

                {/* Issues */}
                <div className="mb-6">
                  <h3 className="font-medium text-gray-900 mb-3">Issues Found</h3>
                  <div className="space-y-3">
                    {results.issues.map((issue, index) => (
                      <div
                        key={index}
                        className={cn('p-4 rounded-lg border', getSeverityColor(issue.severity))}
                      >
                        <div className="flex items-start">
                          <div className="flex-shrink-0 mt-0.5">
                            {getSeverityIcon(issue.severity)}
                          </div>
                          <div className="ml-3">
                            <div className="font-medium text-gray-900">{issue.title}</div>
                            <div className="text-sm text-gray-600 mt-1">{issue.description}</div>
                            <div className="text-xs text-gray-500 mt-2">
                              Category: {issue.category}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Positives */}
                <div>
                  <h3 className="font-medium text-gray-900 mb-3">Positive Aspects</h3>
                  <div className="space-y-2">
                    {results.positives.map((positive, index) => (
                      <div key={index} className="flex items-center">
                        <CheckCircle className="h-5 w-5 text-success-500 flex-shrink-0" />
                        <span className="ml-2 text-gray-700">{positive}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  )
}