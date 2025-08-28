import React from 'react'
import { motion } from 'framer-motion'
import { 
  AlertTriangle, 
  Shield, 
  Clock, 
  FileText, 
  TrendingUp,
  TrendingDown,
  Minus,
  ExternalLink
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { RiskGauge, RiskTrend } from '@/components/ui/RiskGauge'
import { cn, formatRelativeTime, formatDateTime } from '@/lib/utils'
import { DOCUMENT_TYPES, RISK_LEVELS } from '@/lib/constants'
import type { DocumentAnalysis, Finding } from '@/types/analysis'

export interface AnalysisSummaryProps {
  analysis: DocumentAnalysis
  onViewFindings?: () => void
  onTakeAction?: () => void
  onViewDocument?: () => void
  className?: string
  showTrend?: boolean
  trendData?: Array<{ date: string; score: number }>
}

export const AnalysisSummary: React.FC<AnalysisSummaryProps> = ({
  analysis,
  onViewFindings,
  onTakeAction,
  onViewDocument,
  className,
  showTrend = false,
  trendData = [],
}) => {
  const criticalFindings = analysis.findings.filter(f => f.severity === 'CRITICAL')
  const highFindings = analysis.findings.filter(f => f.severity === 'HIGH')
  const totalConcerns = criticalFindings.length + highFindings.length

  // Calculate risk change trend
  const riskTrend = React.useMemo(() => {
    if (trendData.length < 2) return 'stable'
    const current = analysis.overallScore
    const previous = trendData[trendData.length - 2]?.score || 0
    const diff = current - previous
    
    if (Math.abs(diff) < 5) return 'stable'
    return diff > 0 ? 'increasing' : 'decreasing'
  }, [analysis.overallScore, trendData])

  const TrendIcon = {
    increasing: TrendingUp,
    decreasing: TrendingDown,
    stable: Minus,
  }[riskTrend]

  const trendColor = {
    increasing: 'text-danger-600',
    decreasing: 'text-sage-600',
    stable: 'text-muted-foreground',
  }[riskTrend]

  return (
    <Card className={cn('overflow-hidden', className)} variant="elevated">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-2xl font-bold">
              Analysis Summary
            </CardTitle>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <FileText className="w-4 h-4" />
                {DOCUMENT_TYPES[analysis.documentType]}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {formatRelativeTime(analysis.analysisDate)}
              </span>
              {analysis.metadata.company && (
                <span>{analysis.metadata.company.name}</span>
              )}
            </div>
          </div>

          {onViewDocument && (
            <Button
              variant="outline"
              size="sm"
              onClick={onViewDocument}
              rightIcon={<ExternalLink className="w-3 h-3" />}
            >
              View Document
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Risk Score and Key Metrics */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
          {/* Risk Gauge */}
          <div className="flex justify-center lg:justify-start">
            <RiskGauge 
              score={analysis.overallScore}
              size="lg"
              animated
              showLabel
              showScore
            />
          </div>

          {/* Key Stats */}
          <div className="space-y-4 lg:col-span-2">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-foreground">
                  {analysis.findings.length}
                </div>
                <div className="text-sm text-muted-foreground">
                  Total Findings
                </div>
              </div>
              
              <div className="text-center">
                <div className="text-2xl font-bold text-danger-600">
                  {criticalFindings.length}
                </div>
                <div className="text-sm text-muted-foreground">
                  Critical Issues
                </div>
              </div>
              
              <div className="text-center">
                <div className="text-2xl font-bold text-alert-600">
                  {highFindings.length}
                </div>
                <div className="text-sm text-muted-foreground">
                  High Risk
                </div>
              </div>
              
              <div className="text-center">
                <div className="text-2xl font-bold text-guardian-600">
                  {Math.round(analysis.processingTime)}s
                </div>
                <div className="text-sm text-muted-foreground">
                  Analysis Time
                </div>
              </div>
            </div>

            {/* Risk Trend */}
            {showTrend && trendData.length > 1 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Risk Trend</span>
                  <div className={cn('flex items-center gap-1 text-sm', trendColor)}>
                    <TrendIcon className="w-3 h-3" />
                    <span className="capitalize">{riskTrend}</span>
                  </div>
                </div>
                <RiskTrend data={trendData} height={60} />
              </div>
            )}
          </div>
        </div>

        {/* Summary Text */}
        <div className="space-y-3">
          <h3 className="font-semibold text-lg">Executive Summary</h3>
          <p className="text-muted-foreground leading-relaxed">
            {analysis.summary}
          </p>
        </div>

        {/* Top Concerns Preview */}
        {totalConcerns > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-alert-600" />
                Top Concerns ({totalConcerns})
              </h3>
              {onViewFindings && (
                <Button variant="outline" size="sm" onClick={onViewFindings}>
                  View All Findings
                </Button>
              )}
            </div>
            
            <div className="space-y-2">
              {[...criticalFindings, ...highFindings].slice(0, 3).map((finding) => (
                <motion.div
                  key={finding.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border"
                >
                  <div className={cn(
                    'w-2 h-2 rounded-full mt-2 flex-shrink-0',
                    finding.severity === 'CRITICAL' ? 'bg-danger-500' : 'bg-alert-500'
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-foreground">
                      {finding.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {finding.description}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge 
                        variant={finding.severity === 'CRITICAL' ? 'critical' : 'high'} 
                        size="sm"
                      >
                        {finding.severity.toLowerCase()}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {finding.confidence}% confidence
                      </span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Document Metadata */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-border">
          <div>
            <div className="text-sm font-medium text-foreground">Language</div>
            <div className="text-sm text-muted-foreground">
              {analysis.metadata.language.toUpperCase()}
            </div>
          </div>
          
          <div>
            <div className="text-sm font-medium text-foreground">Word Count</div>
            <div className="text-sm text-muted-foreground">
              {analysis.metadata.wordCount.toLocaleString()} words
            </div>
          </div>
          
          <div>
            <div className="text-sm font-medium text-foreground">Reading Time</div>
            <div className="text-sm text-muted-foreground">
              {analysis.metadata.readingTime} minutes
            </div>
          </div>
          
          <div>
            <div className="text-sm font-medium text-foreground">Analysis Date</div>
            <div className="text-sm text-muted-foreground">
              {formatDateTime(analysis.analysisDate)}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-border">
          {onViewFindings && (
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={onViewFindings}
            >
              View Detailed Findings
            </Button>
          )}
          
          {onTakeAction && totalConcerns > 0 && (
            <Button 
              variant="default" 
              className="flex-1"
              onClick={onTakeAction}
            >
              Take Recommended Actions
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// Compact version for lists
export interface AnalysisCardProps {
  analysis: DocumentAnalysis
  onClick?: () => void
  showActions?: boolean
  className?: string
}

export const AnalysisCard: React.FC<AnalysisCardProps> = ({
  analysis,
  onClick,
  showActions = true,
  className,
}) => {
  const criticalCount = analysis.findings.filter(f => f.severity === 'CRITICAL').length
  const highCount = analysis.findings.filter(f => f.severity === 'HIGH').length

  return (
    <Card 
      className={cn('cursor-pointer', className)}
      hover="lift"
      interactive
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground truncate">
              {DOCUMENT_TYPES[analysis.documentType]}
              {analysis.metadata.company && (
                <span className="text-muted-foreground"> • {analysis.metadata.company.name}</span>
              )}
            </h3>
            <p className="text-sm text-muted-foreground">
              Analyzed {formatRelativeTime(analysis.analysisDate)}
            </p>
          </div>
          
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="text-right">
              <div className="text-sm font-medium">Risk Score</div>
              <div className={cn(
                'text-lg font-bold',
                analysis.overallScore >= 80 ? 'text-danger-600' : 
                analysis.overallScore >= 60 ? 'text-alert-600' : 
                'text-sage-600'
              )}>
                {Math.round(analysis.overallScore)}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-sm">
              <Shield className="w-4 h-4 text-muted-foreground" />
              <span>{analysis.findings.length} findings</span>
            </div>
            
            {(criticalCount > 0 || highCount > 0) && (
              <div className="flex items-center gap-2">
                {criticalCount > 0 && (
                  <Badge variant="critical" size="sm">
                    {criticalCount} critical
                  </Badge>
                )}
                {highCount > 0 && (
                  <Badge variant="high" size="sm">
                    {highCount} high
                  </Badge>
                )}
              </div>
            )}
          </div>

          {showActions && (
            <Button variant="ghost" size="sm">
              View Details
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}