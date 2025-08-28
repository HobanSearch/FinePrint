import React from 'react'
import { motion } from 'framer-motion'
import { 
  Filter, 
  Search, 
  Download, 
  Share, 
  ChevronDown,
  AlertTriangle,
  Shield,
  Activity,
  TrendingUp,
  FileText,
  Clock
} from 'lucide-react'
import { DashboardLayout, QuickStats } from '@/components/layout/DashboardLayout'
import { AnalysisSummary } from '@/components/analysis/AnalysisSummary'
import { FindingCard } from '@/components/analysis/FindingCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { RiskGauge, RiskTrend } from '@/components/ui/RiskGauge'
import { cn } from '@/lib/utils'
import type { DocumentAnalysis, Finding } from '@/types/analysis'

export interface AnalysisResultsDashboardProps {
  analysis: DocumentAnalysis
  className?: string
}

export const AnalysisResultsDashboard: React.FC<AnalysisResultsDashboardProps> = ({
  analysis,
  className,
}) => {
  const [expandedFinding, setExpandedFinding] = React.useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = React.useState<string>('all')
  const [selectedSeverity, setSelectedSeverity] = React.useState<string>('all')
  const [searchQuery, setSearchQuery] = React.useState('')

  // Filter findings based on selected filters
  const filteredFindings = React.useMemo(() => {
    return analysis.findings.filter(finding => {
      const matchesCategory = selectedCategory === 'all' || finding.category === selectedCategory
      const matchesSeverity = selectedSeverity === 'all' || finding.severity === selectedSeverity
      const matchesSearch = !searchQuery || 
        finding.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        finding.description.toLowerCase().includes(searchQuery.toLowerCase())
      
      return matchesCategory && matchesSeverity && matchesSearch
    })
  }, [analysis.findings, selectedCategory, selectedSeverity, searchQuery])

  // Calculate statistics
  const stats = React.useMemo(() => {
    const severityCounts = analysis.findings.reduce((acc, finding) => {
      acc[finding.severity] = (acc[finding.severity] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    return [
      {
        id: 'overall-score',
        label: 'Overall Risk Score',
        value: `${Math.round(analysis.overallScore)}/100`,
        icon: Shield,
        color: analysis.overallScore >= 80 ? 'danger' : 
              analysis.overallScore >= 60 ? 'alert' : 'sage' as const,
        change: {
          value: -5,
          direction: 'down' as const,
          period: 'last analysis'
        }
      },
      {
        id: 'critical-findings',
        label: 'Critical Issues',
        value: severityCounts.CRITICAL || 0,
        icon: AlertTriangle,
        color: 'danger' as const,
      },
      {
        id: 'total-findings',
        label: 'Total Findings',
        value: analysis.findings.length,
        icon: FileText,
        color: 'guardian' as const,
      },
      {
        id: 'processing-time',
        label: 'Analysis Time',
        value: `${Math.round(analysis.processingTime)}s`,
        icon: Clock,
        color: 'sage' as const,
      },
    ]
  }, [analysis])

  // Get unique categories and severities for filters
  const categories = [...new Set(analysis.findings.map(f => f.category))]
  const severities = [...new Set(analysis.findings.map(f => f.severity))]

  const handleToggleFinding = (findingId: string) => {
    setExpandedFinding(expandedFinding === findingId ? null : findingId)
  }

  const handleViewSource = (finding: Finding) => {
    // Implementation would show the source document with highlighting
    console.log('View source for:', finding.id)
  }

  const handleTakeAction = (finding: Finding) => {
    // Implementation would open action center for this finding
    console.log('Take action for:', finding.id)
  }

  const handleExportReport = () => {
    // Implementation would generate and download PDF report
    console.log('Export report')
  }

  const handleShareAnalysis = () => {
    // Implementation would create shareable link
    console.log('Share analysis')
  }

  // Mock trend data - in real app this would come from props or API
  const trendData = [
    { date: '2024-01-01', score: 75 },
    { date: '2024-01-08', score: 82 },
    { date: '2024-01-15', score: 78 },
    { date: '2024-01-22', score: analysis.overallScore },
  ]

  return (
    <DashboardLayout
      title="Analysis Results"
      subtitle={`${analysis.findings.length} findings identified in your document`}
      showBreadcrumbs
      breadcrumbs={[
        { label: 'Dashboard', href: '/' },
        { label: 'Analysis Results' }
      ]}
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleShareAnalysis}
            leftIcon={<Share className="w-3 h-3" />}
          >
            Share
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportReport}
            leftIcon={<Download className="w-3 h-3" />}
          >
            Export Report
          </Button>
        </div>
      }
      className={className}
    >
      <div className="space-y-6">
        {/* Quick Stats */}
        <QuickStats stats={stats} />

        {/* Analysis Summary */}
        <AnalysisSummary
          analysis={analysis}
          showTrend
          trendData={trendData}
          onViewFindings={() => {
            // Scroll to findings section
            document.getElementById('findings-section')?.scrollIntoView({ 
              behavior: 'smooth' 
            })
          }}
          onTakeAction={() => {
            // Navigate to action center
            window.location.href = '/actions'
          }}
        />

        {/* Findings Section */}
        <div id="findings-section" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Detailed Findings ({filteredFindings.length})
                </CardTitle>
                
                <div className="flex items-center gap-2">
                  {/* Search */}
                  <Input
                    placeholder="Search findings..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    leftIcon={<Search className="w-4 h-4" />}
                    size="sm"
                    className="w-64"
                  />
                  
                  {/* Filter dropdown - simplified for demo */}
                  <Button
                    variant="outline"
                    size="sm"
                    rightIcon={<ChevronDown className="w-3 h-3" />}
                  >
                    <Filter className="w-3 h-3 mr-1" />
                    Filters
                  </Button>
                </div>
              </div>
              
              {/* Active filters */}
              {(selectedCategory !== 'all' || selectedSeverity !== 'all' || searchQuery) && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-muted-foreground">Active filters:</span>
                  {selectedCategory !== 'all' && (
                    <Badge variant="outline" className="gap-1">
                      Category: {selectedCategory}
                      <button 
                        onClick={() => setSelectedCategory('all')}
                        className="ml-1 hover:text-foreground"
                      >
                        ×
                      </button>
                    </Badge>
                  )}
                  {selectedSeverity !== 'all' && (
                    <Badge variant="outline" className="gap-1">
                      Severity: {selectedSeverity}
                      <button 
                        onClick={() => setSelectedSeverity('all')}
                        className="ml-1 hover:text-foreground"
                      >
                        ×
                      </button>
                    </Badge>
                  )}
                  {searchQuery && (
                    <Badge variant="outline" className="gap-1">
                      Search: "{searchQuery}"
                      <button 
                        onClick={() => setSearchQuery('')}
                        className="ml-1 hover:text-foreground"
                      >
                        ×
                      </button>
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedCategory('all')
                      setSelectedSeverity('all')
                      setSearchQuery('')
                    }}
                  >
                    Clear all
                  </Button>
                </div>
              )}
            </CardHeader>

            <CardContent className="space-y-3">
              {filteredFindings.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No findings match your current filters.</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedCategory('all')
                      setSelectedSeverity('all')
                      setSearchQuery('')
                    }}
                    className="mt-2"
                  >
                    Clear filters
                  </Button>
                </div>
              ) : (
                filteredFindings
                  .sort((a, b) => {
                    // Sort by severity first, then by confidence
                    const severityOrder = { CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, MINIMAL: 1 }
                    const severityDiff = severityOrder[b.severity] - severityOrder[a.severity]
                    if (severityDiff !== 0) return severityDiff
                    return b.confidence - a.confidence
                  })
                  .map((finding, index) => (
                    <motion.div
                      key={finding.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <FindingCard
                        finding={finding}
                        expanded={expandedFinding === finding.id}
                        onToggle={() => handleToggleFinding(finding.id)}
                        onViewSource={() => handleViewSource(finding)}
                        onTakeAction={() => handleTakeAction(finding)}
                      />
                    </motion.div>
                  ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Risk Analysis Chart */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Risk Trend Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <RiskTrend data={trendData} height={120} />
                <div className="text-sm text-muted-foreground">
                  Risk score has decreased by 5 points since last analysis, 
                  indicating improved terms or reduced concerns.
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5" />
                Category Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(
                  analysis.findings.reduce((acc, finding) => {
                    acc[finding.category] = (acc[finding.category] || 0) + 1
                    return acc
                  }, {} as Record<string, number>)
                )
                  .sort(([,a], [,b]) => b - a)
                  .slice(0, 5)
                  .map(([category, count]) => (
                    <div key={category} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-guardian-500" />
                        <span className="text-sm text-foreground">
                          {category.replace(/_/g, ' ').toLowerCase()}
                        </span>
                      </div>
                      <Badge variant="secondary" size="sm">
                        {count}
                      </Badge>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  )
}