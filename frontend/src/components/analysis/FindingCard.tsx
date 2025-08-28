import React from 'react'
import { motion } from 'framer-motion'
import { 
  ChevronDown, 
  ChevronRight, 
  AlertTriangle, 
  Shield, 
  Eye,
  ExternalLink,
  Copy,
  Check
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { cn, getRiskColor, formatRelativeTime } from '@/lib/utils'
import { PATTERN_CATEGORIES } from '@/lib/constants'
import type { Finding } from '@/types/analysis'

export interface FindingCardProps {
  finding: Finding
  expanded?: boolean
  onToggle?: () => void
  onViewSource?: () => void
  onTakeAction?: () => void
  className?: string
}

const severityIcons = {
  MINIMAL: Shield,
  LOW: Shield,
  MEDIUM: AlertTriangle,
  HIGH: AlertTriangle,
  CRITICAL: AlertTriangle,
}

const severityColors = {
  MINIMAL: 'minimal',
  LOW: 'low', 
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
} as const

export const FindingCard: React.FC<FindingCardProps> = ({
  finding,
  expanded = false,
  onToggle,
  onViewSource,
  onTakeAction,
  className,
}) => {
  const [copied, setCopied] = React.useState(false)
  const SeverityIcon = severityIcons[finding.severity]
  const riskColor = getRiskColor(finding.confidence)

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(finding.sourceText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy text:', err)
    }
  }

  return (
    <Card 
      className={cn(
        'transition-all duration-300 hover:shadow-md',
        expanded && 'ring-2 ring-guardian-200 dark:ring-guardian-800',
        className
      )}
      hover="lift"
      interactive={!!onToggle}
    >
      <CardContent className="p-0">
        {/* Header */}
        <div 
          className="flex items-start gap-3 p-4 cursor-pointer"
          onClick={onToggle}
        >
          {/* Severity Icon */}
          <div className={cn(
            'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-1',
            `bg-${riskColor}-100 text-${riskColor}-600 dark:bg-${riskColor}-950 dark:text-${riskColor}-400`
          )}>
            <SeverityIcon className="w-4 h-4" />
          </div>

          {/* Main Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <h3 className="font-semibold text-foreground mb-1 leading-tight">
                  {finding.title}
                </h3>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {finding.description}
                </p>
              </div>

              {/* Expand Icon */}
              {onToggle && (
                <Button 
                  variant="ghost" 
                  size="icon-sm"
                  className="flex-shrink-0 mt-1"
                >
                  {expanded ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </Button>
              )}
            </div>

            {/* Badges */}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <Badge variant={severityColors[finding.severity]} size="sm">
                {finding.severity.toLowerCase()}
              </Badge>
              
              <Badge variant="outline" size="sm">
                {PATTERN_CATEGORIES[finding.category]}
              </Badge>

              <Badge variant="outline" size="sm">
                {finding.confidence}% confidence
              </Badge>

              {finding.tags.slice(0, 2).map((tag) => (
                <Badge key={tag} variant="secondary" size="sm">
                  {tag}
                </Badge>
              ))}
              
              {finding.tags.length > 2 && (
                <Badge variant="secondary" size="sm">
                  +{finding.tags.length - 2} more
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Expanded Content */}
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="border-t border-border"
          >
            <div className="p-4 space-y-4">
              {/* Detailed Explanation */}
              <div>
                <h4 className="font-medium text-foreground mb-2">
                  What this means
                </h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {finding.explanation}
                </p>
              </div>

              {/* Impact */}
              <div>
                <h4 className="font-medium text-foreground mb-2">
                  Potential impact
                </h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {finding.impact}
                </p>
              </div>

              {/* Source Text */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-foreground">
                    Relevant clause
                  </h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyText}
                    leftIcon={copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 border-l-4 border-guardian-500">
                  <p className="text-sm text-muted-foreground italic leading-relaxed">
                    "{finding.sourceText}"
                  </p>
                  {finding.location.section && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Found in: {finding.location.section}
                      {finding.location.paragraph && `, paragraph ${finding.location.paragraph}`}
                    </p>
                  )}
                </div>
              </div>

              {/* All Tags */}
              {finding.tags.length > 0 && (
                <div>
                  <h4 className="font-medium text-foreground mb-2">
                    Related topics
                  </h4>
                  <div className="flex flex-wrap gap-1">
                    {finding.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" size="sm">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <div className="flex gap-2">
                  {onViewSource && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onViewSource}
                      leftIcon={<Eye className="w-3 h-3" />}
                    >
                      View in document
                    </Button>
                  )}
                  
                  {onTakeAction && (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={onTakeAction}
                      leftIcon={<ExternalLink className="w-3 h-3" />}
                    >
                      Take action
                    </Button>
                  )}
                </div>

                <div className="text-xs text-muted-foreground">
                  Confidence: {finding.confidence}%
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </CardContent>
    </Card>
  )
}

// Compact version for lists
export interface FindingListItemProps {
  finding: Finding
  onClick?: () => void
  className?: string
}

export const FindingListItem: React.FC<FindingListItemProps> = ({
  finding,
  onClick,
  className,
}) => {
  const SeverityIcon = severityIcons[finding.severity]
  const riskColor = getRiskColor(finding.confidence)

  return (
    <div 
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer',
        className
      )}
      onClick={onClick}
    >
      <div className={cn(
        'flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center',
        `bg-${riskColor}-100 text-${riskColor}-600 dark:bg-${riskColor}-950 dark:text-${riskColor}-400`
      )}>
        <SeverityIcon className="w-3 h-3" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-foreground truncate">
          {finding.title}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {PATTERN_CATEGORIES[finding.category]}
        </p>
      </div>

      <Badge variant={severityColors[finding.severity]} size="sm">
        {finding.severity.toLowerCase()}
      </Badge>
    </div>
  )
}