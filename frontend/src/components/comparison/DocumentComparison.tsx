import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  GitCompare,
  Download,
  Share,
  Eye,
  EyeOff,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  FileText,
  Calendar,
  User,
  BarChart3,
  AlertTriangle,
  Plus,
  Minus,
  Equal,
  ArrowRight,
  Copy,
  ExternalLink
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { Progress } from '@/components/ui/Progress'
import { RiskIndicator } from '@/components/ui/RiskGauge'
import { cn, getRiskColor } from '@/lib/utils'
import { useVirtualizer } from '@tanstack/react-virtual'

interface DocumentVersion {
  id: string
  name: string
  version: string
  uploadDate: string
  uploadedBy: string
  analysisId: string
  riskScore: number
  findingsCount: number
  size: number
}

interface DiffChunk {
  type: 'added' | 'removed' | 'modified' | 'unchanged'
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  content: string[]
  context?: string
}

interface ComparisonResult {
  similarity: number
  totalChanges: number
  additions: number
  deletions: number
  modifications: number
  chunks: DiffChunk[]
  riskScoreChange: number
  findingsChange: number
  significantChanges: Array<{
    type: 'risk_increase' | 'risk_decrease' | 'new_finding' | 'resolved_finding'
    description: string
    impact: 'high' | 'medium' | 'low'
    section: string
  }>
}

export interface DocumentComparisonProps {
  leftDocument: DocumentVersion
  rightDocument: DocumentVersion
  comparisonResult?: ComparisonResult
  isLoading?: boolean
  onExport?: (format: 'pdf' | 'html' | 'json') => void
  onShare?: () => void
  className?: string
}

export const DocumentComparison: React.FC<DocumentComparisonProps> = ({
  leftDocument,
  rightDocument,
  comparisonResult,
  isLoading = false,
  onExport,
  onShare,
  className,
}) => {
  const [showLineNumbers, setShowLineNumbers] = React.useState(true)
  const [showWhitespace, setShowWhitespace] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState('')
  const [filterType, setFilterType] = React.useState<'all' | 'added' | 'removed' | 'modified'>('all')
  const [currentChunk, setCurrentChunk] = React.useState(0)
  const [fontSize, setFontSize] = React.useState(14)

  const parentRef = React.useRef<HTMLDivElement>(null)

  // Filter chunks based on search and filter type
  const filteredChunks = React.useMemo(() => {
    if (!comparisonResult) return []
    
    let chunks = comparisonResult.chunks
    
    // Apply type filter
    if (filterType !== 'all') {
      chunks = chunks.filter(chunk => chunk.type === filterType)
    }
    
    // Apply search filter
    if (searchQuery) {
      chunks = chunks.filter(chunk =>
        chunk.content.some(line =>
          line.toLowerCase().includes(searchQuery.toLowerCase())
        )
      )
    }
    
    return chunks
  }, [comparisonResult, filterType, searchQuery])

  // Virtualization for performance with large diffs
  const rowVirtualizer = useVirtualizer({
    count: filteredChunks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100,
    overscan: 5,
  })

  const getChangeTypeIcon = (type: DiffChunk['type']) => {
    switch (type) {
      case 'added': return <Plus className="w-3 h-3 text-sage-600" />
      case 'removed': return <Minus className="w-3 h-3 text-danger-600" />
      case 'modified': return <ArrowRight className="w-3 h-3 text-alert-600" />
      default: return <Equal className="w-3 h-3 text-neutral-400" />
    }
  }

  const getChangeTypeColor = (type: DiffChunk['type']) => {
    switch (type) {
      case 'added': return 'bg-sage-50 border-l-4 border-l-sage-500 dark:bg-sage-950'
      case 'removed': return 'bg-danger-50 border-l-4 border-l-danger-500 dark:bg-danger-950'
      case 'modified': return 'bg-alert-50 border-l-4 border-l-alert-500 dark:bg-alert-950'
      default: return 'bg-neutral-50 dark:bg-neutral-900'
    }
  }

  const renderDiffLine = (line: string, lineNumber: number, type: DiffChunk['type']) => {
    const highlightedLine = searchQuery
      ? line.replace(
          new RegExp(`(${searchQuery})`, 'gi'),
          '<mark class="bg-yellow-200 dark:bg-yellow-800">$1</mark>'
        )
      : line

    return (
      <div
        key={lineNumber}
        className={cn('flex items-start gap-2 px-3 py-1 text-sm font-mono', {
          'bg-sage-100 dark:bg-sage-900': type === 'added',
          'bg-danger-100 dark:bg-danger-900': type === 'removed',
          'bg-alert-100 dark:bg-alert-900': type === 'modified',
        })}
        style={{ fontSize: `${fontSize}px` }}
      >
        {showLineNumbers && (
          <div className="w-12 text-xs text-muted-foreground text-right select-none">
            {lineNumber}
          </div>
        )}
        <div className="w-4 flex-shrink-0 flex items-center justify-center">
          {getChangeTypeIcon(type)}
        </div>
        <div
          className="flex-1 whitespace-pre-wrap break-words"
          dangerouslySetInnerHTML={{ __html: highlightedLine }}
        />
      </div>
    )
  }

  const navigateToChunk = (direction: 'prev' | 'next') => {
    if (direction === 'prev' && currentChunk > 0) {
      setCurrentChunk(currentChunk - 1)
    } else if (direction === 'next' && currentChunk < filteredChunks.length - 1) {
      setCurrentChunk(currentChunk + 1)
    }
  }

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-96" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <Skeleton className="flex-1 h-64" />
            <Skeleton className="flex-1 h-64" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Comparison Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <GitCompare className="w-5 h-5" />
                Document Comparison
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Comparing changes between document versions
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onShare}
                leftIcon={<Share className="w-3 h-3" />}
              >
                Share
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onExport?.('pdf')}
                leftIcon={<Download className="w-3 h-3" />}
              >
                Export
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          {/* Document Info */}
          <div className="grid grid-cols-2 gap-6 mb-6">
            <div className="space-y-3">
              <h3 className="font-medium text-sm text-muted-foreground">Original Version</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">{leftDocument.name}</span>
                  <Badge variant="outline" size="sm">v{leftDocument.version}</Badge>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(leftDocument.uploadDate).toLocaleDateString()}
                  </div>
                  <div className="flex items-center gap-1">
                    <User className="w-3 h-3" />
                    {leftDocument.uploadedBy}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <RiskIndicator score={leftDocument.riskScore} size="sm" />
                  <span className="text-sm">{leftDocument.findingsCount} findings</span>
                </div>
              </div>
            </div>
            
            <div className="space-y-3">
              <h3 className="font-medium text-sm text-muted-foreground">New Version</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">{rightDocument.name}</span>
                  <Badge variant="outline" size="sm">v{rightDocument.version}</Badge>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(rightDocument.uploadDate).toLocaleDateString()}
                  </div>
                  <div className="flex items-center gap-1">
                    <User className="w-3 h-3" />
                    {rightDocument.uploadedBy}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <RiskIndicator score={rightDocument.riskScore} size="sm" />
                  <span className="text-sm">{rightDocument.findingsCount} findings</span>
                </div>
              </div>
            </div>
          </div>

          {/* Comparison Summary */}
          {comparisonResult && (
            <div className="grid grid-cols-4 gap-4 p-4 bg-neutral-50 dark:bg-neutral-900 rounded-lg">
              <div className="text-center">
                <div className="text-lg font-bold text-guardian-600">
                  {comparisonResult.similarity.toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground">Similarity</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-alert-600">
                  {comparisonResult.totalChanges}
                </div>
                <div className="text-xs text-muted-foreground">Total Changes</div>
              </div>
              <div className="text-center">
                <div className={cn(
                  'text-lg font-bold',
                  comparisonResult.riskScoreChange > 0 ? 'text-danger-600' : 'text-sage-600'
                )}>
                  {comparisonResult.riskScoreChange > 0 ? '+' : ''}{comparisonResult.riskScoreChange}
                </div>
                <div className="text-xs text-muted-foreground">Risk Change</div>
              </div>
              <div className="text-center">
                <div className={cn(
                  'text-lg font-bold',
                  comparisonResult.findingsChange > 0 ? 'text-danger-600' : 'text-sage-600'
                )}>
                  {comparisonResult.findingsChange > 0 ? '+' : ''}{comparisonResult.findingsChange}
                </div>
                <div className="text-xs text-muted-foreground">Findings Change</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Comparison Controls */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            {/* Search */}
            <div className="flex-1 min-w-64">
              <Input
                placeholder="Search in changes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                leftIcon={<Search className="w-4 h-4" />}
                size="sm"
              />
            </div>
            
            {/* Filters */}
            <div className="flex items-center gap-1">
              <Button
                variant={filterType === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterType('all')}
              >
                All
              </Button>
              <Button
                variant={filterType === 'added' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterType('added')}
                leftIcon={<Plus className="w-3 h-3" />}
              >
                Added
              </Button>
              <Button
                variant={filterType === 'removed' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterType('removed')}
                leftIcon={<Minus className="w-3 h-3" />}
              >
                Removed
              </Button>
              <Button
                variant={filterType === 'modified' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterType('modified')}
                leftIcon={<ArrowRight className="w-3 h-3" />}
              >
                Modified
              </Button>
            </div>
            
            {/* View Options */}
            <div className="flex items-center gap-2 border-l pl-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowLineNumbers(!showLineNumbers)}
                leftIcon={showLineNumbers ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              >
                Line Numbers
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFontSize(Math.max(10, fontSize - 2))}
                leftIcon={<ZoomOut className="w-3 h-3" />}
              >
                A-
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFontSize(Math.min(20, fontSize + 2))}
                leftIcon={<ZoomIn className="w-3 h-3" />}
              >
                A+
              </Button>
            </div>
            
            {/* Navigation */}
            {filteredChunks.length > 0 && (
              <div className="flex items-center gap-2 border-l pl-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigateToChunk('prev')}
                  disabled={currentChunk === 0}
                  leftIcon={<ChevronLeft className="w-3 h-3" />}
                >
                  Prev
                </Button>
                <span className="text-sm text-muted-foreground">
                  {currentChunk + 1} of {filteredChunks.length}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigateToChunk('next')}
                  disabled={currentChunk === filteredChunks.length - 1}
                  rightIcon={<ChevronRight className="w-3 h-3" />}
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Significant Changes */}
      {comparisonResult?.significantChanges && comparisonResult.significantChanges.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Significant Changes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {comparisonResult.significantChanges.map((change, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={cn(
                    'p-3 rounded-lg border-l-4',
                    change.impact === 'high' && 'bg-danger-50 border-l-danger-500 dark:bg-danger-950',
                    change.impact === 'medium' && 'bg-alert-50 border-l-alert-500 dark:bg-alert-950',
                    change.impact === 'low' && 'bg-guardian-50 border-l-guardian-500 dark:bg-guardian-950'
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge
                          variant={change.impact === 'high' ? 'destructive' : 
                                  change.impact === 'medium' ? 'default' : 'secondary'}
                          size="sm"
                        >
                          {change.impact.toUpperCase()}
                        </Badge>
                        <span className="text-sm font-medium">{change.section}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {change.description}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" leftIcon={<ExternalLink className="w-3 h-3" />}>
                      View
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Diff Viewer */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Detailed Changes
            </CardTitle>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-sage-500 rounded" />
                <span>Added ({comparisonResult?.additions || 0})</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-danger-500 rounded" />
                <span>Removed ({comparisonResult?.deletions || 0})</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-alert-500 rounded" />
                <span>Modified ({comparisonResult?.modifications || 0})</span>
              </div>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-0">
          {filteredChunks.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No changes found matching your filters.</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilterType('all')
                  setSearchQuery('')
                }}
                className="mt-2"
              >
                Clear filters
              </Button>
            </div>
          ) : (
            <div
              ref={parentRef}
              className="h-96 overflow-auto border-t"
              style={{ contain: 'strict' }}
            >
              <div
                style={{
                  height: `${rowVirtualizer.getTotalSize()}px`,
                  width: '100%',
                  position: 'relative',
                }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                  const chunk = filteredChunks[virtualItem.index]
                  return (
                    <div
                      key={virtualItem.key}
                      className={cn(
                        'absolute top-0 left-0 w-full',
                        getChangeTypeColor(chunk.type)
                      )}
                      style={{
                        height: `${virtualItem.size}px`,
                        transform: `translateY(${virtualItem.start}px)`,
                      }}
                    >
                      <div className="p-2">
                        <div className="flex items-center gap-2 mb-2 text-xs font-medium text-muted-foreground">
                          {getChangeTypeIcon(chunk.type)}
                          <span className="capitalize">{chunk.type} content</span>
                          {chunk.context && (
                            <>
                              <span>in</span>
                              <Badge variant="outline" size="sm">{chunk.context}</Badge>
                            </>
                          )}
                        </div>
                        <div className="space-y-0">
                          {chunk.content.map((line, lineIndex) =>
                            renderDiffLine(
                              line,
                              chunk.type === 'removed' ? chunk.oldStart + lineIndex : chunk.newStart + lineIndex,
                              chunk.type
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// Document Version Selector Component
export interface DocumentVersionSelectorProps {
  documents: DocumentVersion[]
  selectedId?: string
  onSelect: (document: DocumentVersion) => void
  label: string
  className?: string
}

export const DocumentVersionSelector: React.FC<DocumentVersionSelectorProps> = ({
  documents,
  selectedId,
  onSelect,
  label,
  className,
}) => {
  const [isOpen, setIsOpen] = React.useState(false)
  const selectedDocument = documents.find(doc => doc.id === selectedId)

  return (
    <div className={cn('relative', className)}>
      <label className="block text-sm font-medium text-muted-foreground mb-2">
        {label}
      </label>
      
      <Button
        variant="outline"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full justify-between"
        rightIcon={<ChevronRight className={cn('w-4 h-4 transition-transform', isOpen && 'rotate-90')} />}
      >
        {selectedDocument ? (
          <div className="flex items-center gap-2 text-left">
            <FileText className="w-4 h-4" />
            <div>
              <div className="font-medium">{selectedDocument.name}</div>
              <div className="text-xs text-muted-foreground">
                v{selectedDocument.version} • {new Date(selectedDocument.uploadDate).toLocaleDateString()}
              </div>
            </div>
          </div>
        ) : (
          'Select a document version'
        )}
      </Button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-full left-0 right-0 z-50 mt-1 bg-white dark:bg-neutral-800 rounded-lg border shadow-lg max-h-64 overflow-y-auto"
          >
            {documents.map((document) => (
              <button
                key={document.id}
                onClick={() => {
                  onSelect(document)
                  setIsOpen(false)
                }}
                className={cn(
                  'w-full p-3 text-left hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors',
                  'first:rounded-t-lg last:rounded-b-lg',
                  selectedId === document.id && 'bg-guardian-50 dark:bg-guardian-950'
                )}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <div className="font-medium text-sm">{document.name}</div>
                      <div className="text-xs text-muted-foreground">
                        v{document.version} • {new Date(document.uploadDate).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <RiskIndicator score={document.riskScore} size="xs" />
                    <span className="text-xs text-muted-foreground">
                      {document.findingsCount} findings
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}