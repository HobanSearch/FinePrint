import React, { useState } from 'react'
import DocumentUpload from '../../components/DocumentUpload'
import AnalysisResults from '../../components/AnalysisResults'
import { AnalysisJob } from '../../services/api'

const Analyze: React.FC = () => {
  const [currentAnalysis, setCurrentAnalysis] = useState<AnalysisJob | null>(null)

  const handleAnalysisStart = (analysisId: string) => {
    // This would be handled by parent component in real app
    console.log('Analysis started:', analysisId)
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Analyze Document</h1>
        <p className="text-gray-600 mt-2">
          Upload a legal document or paste text to identify problematic clauses and hidden risks.
        </p>
      </div>

      <DocumentUpload onAnalysisStart={handleAnalysisStart} />
      
      {currentAnalysis && (
        <div className="mt-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Analysis Results</h2>
          <AnalysisResults analysis={currentAnalysis} />
        </div>
      )}
    </div>
  )
}

export default Analyze