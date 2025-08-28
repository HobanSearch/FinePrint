import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Download,
  FileText,
  Table,
  Code,
  Image,
  Mail,
  Share,
  Calendar,
  Settings,
  Eye,
  Edit,
  Copy,
  Check,
  X,
  Filter,
  Search,
  ChevronDown,
  ChevronRight,
  Zap,
  Clock,
  User,
  Building,
  Globe,
  Shield,
  AlertTriangle,
  Target,
  Bookmark,
  Tag,
  Palette,
  Layout,
  Type,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Italic,
  Underline,
  List,
  Hash,
  BarChart3,
  PieChart,
  LineChart,
  Archive,
  Cloud,
  HardDrive,
  ExternalLink,
  Printer,
  Smartphone,
  Monitor,
  Tablet
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Progress } from '@/components/ui/Progress'
import { cn } from '@/lib/utils'
import type { DocumentAnalysisResponse, Finding } from '@/types/analysis'

interface ExportTemplate {
  id: string
  name: string
  description: string
  format: 'pdf' | 'docx' | 'html' | 'csv' | 'json' | 'xlsx'
  category: 'report' | 'summary' | 'data' | 'presentation' | 'compliance'
  features: string[]
  customizable: boolean
  premium: boolean
  previewUrl?: string
  estimatedSize: string
  supportedData: ('findings' | 'analysis' | 'comparison' | 'actions' | 'metrics')[]
}

interface ExportJob {
  id: string
  templateId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  createdAt: string
  completedAt?: string
  downloadUrl?: string
  fileSize?: number
  error?: string
  metadata: {
    documentName: string
    format: string
    template: string
    dataTypes: string[]
  }
}

interface ExportConfig {
  template: ExportTemplate
  includeFindings: boolean
  includeAnalysis: boolean
  includeComparison: boolean
  includeActions: boolean
  includeCharts: boolean
  filterBySeverity: string[]
  filterByCategory: string[]
  customizations: {
    brandingEnabled: boolean
    logoUrl?: string
    companyName?: string
    headerColor?: string
    accentColor?: string
    fontFamily?: string
    fontSize?: number
    includePageNumbers: boolean
    includeTableOfContents: boolean
    includeExecutiveSummary: boolean
    includeAppendix: boolean
    watermark?: string
  }
  delivery: {
    method: 'download' | 'email' | 'cloud'
    emailRecipients?: string[]
    cloudProvider?: 'gdrive' | 'dropbox' | 'onedrive'
    scheduledDelivery?: string
  }
}

const EXPORT_TEMPLATES: ExportTemplate[] = [
  {
    id: 'executive-report',
    name: 'Executive Report',
    description: 'Comprehensive analysis report for executives and stakeholders',
    format: 'pdf',
    category: 'report',
    features: [
      'Executive Summary',
      'Risk Assessment',
      'Key Findings',
      'Action Recommendations',
      'Charts & Visualizations',
      'Professional Formatting'
    ],
    customizable: true,
    premium: false,
    estimatedSize: '2-5 MB',
    supportedData: ['findings', 'analysis', 'actions', 'metrics']
  },
  {
    id: 'technical-analysis',
    name: 'Technical Analysis Report',
    description: 'Detailed technical report with full findings and compliance data',
    format: 'pdf',
    category: 'report',
    features: [
      'Complete Findings List',
      'Clause-by-Clause Analysis',
      'Compliance Mapping',
      'Technical Appendix',
      'Data Tables',
      'Source References'
    ],
    customizable: true,
    premium: false,
    estimatedSize: '5-15 MB',
    supportedData: ['findings', 'analysis', 'comparison', 'metrics']
  },
  {
    id: 'compliance-checklist',
    name: 'Compliance Checklist',
    description: 'Interactive checklist for compliance teams',
    format: 'xlsx',
    category: 'compliance',
    features: [
      'Sortable Data Tables',
      'Status Tracking',
      'Priority Indicators',
      'Action Items',
      'Progress Tracking',
      'Comments Section'
    ],
    customizable: false,
    premium: false,
    estimatedSize: '1-3 MB',
    supportedData: ['findings', 'actions']
  },
  {
    id: 'findings-data',
    name: 'Findings Dataset',
    description: 'Raw findings data in structured format for analysis',
    format: 'csv',
    category: 'data',
    features: [
      'Structured Data Export',
      'Machine Readable',
      'Import Ready',
      'Metadata Included',
      'Timestamp Data',
      'Category Mapping'
    ],
    customizable: false,
    premium: false,
    estimatedSize: '<1 MB',
    supportedData: ['findings', 'analysis', 'metrics']
  },
  {
    id: 'presentation-slides',
    name: 'Presentation Slides',
    description: 'Professional presentation slides for meetings and reviews',
    format: 'pdf',
    category: 'presentation',
    features: [
      'Executive Summary Slides',
      'Key Risk Highlights',
      'Visual Charts',
      'Action Plan Slides',
      'Speaker Notes',
      'Brand Customization'
    ],
    customizable: true,
    premium: true,
    estimatedSize: '3-8 MB',
    supportedData: ['findings', 'analysis', 'actions', 'metrics']
  },
  {
    id: 'legal-brief',
    name: 'Legal Brief',
    description: 'Formatted legal brief with citations and recommendations',
    format: 'docx',
    category: 'compliance',
    features: [
      'Legal Formatting',
      'Citation Standards',
      'Risk Analysis',
      'Precedent References',
      'Recommendation Summary',
      'Editable Format'
    ],
    customizable: true,
    premium: true,
    estimatedSize: '2-6 MB',
    supportedData: ['findings', 'analysis', 'actions']
  },
  {
    id: 'comparison-report',
    name: 'Document Comparison Report',
    description: 'Side-by-side comparison analysis with change tracking',
    format: 'pdf',
    category: 'report',
    features: [
      'Change Visualization',
      'Risk Delta Analysis',
      'Version Comparison',
      'Impact Assessment',
      'Timeline Analysis',
      'Recommendations'
    ],
    customizable: true,
    premium: false,
    estimatedSize: '4-10 MB',
    supportedData: ['comparison', 'analysis', 'metrics']
  },
  {
    id: 'json-api',
    name: 'API Data Export',
    description: 'Complete analysis data in JSON format for API integration',
    format: 'json',
    category: 'data',
    features: [
      'Full Data Structure',
      'API Compatible',
      'Metadata Included',
      'Schema Validated',
      'Nested Objects',
      'Array Support'
    ],
    customizable: false,
    premium: false,
    estimatedSize: '<1 MB',
    supportedData: ['findings', 'analysis', 'comparison', 'actions', 'metrics']
  }
]

export interface ExportCenterProps {
  analysis?: DocumentAnalysisResponse
  comparison?: any
  actions?: any[]
  className?: string
}

export const ExportCenter: React.FC<ExportCenterProps> = ({
  analysis,
  comparison,
  actions,
  className,
}) => {
  const [selectedTemplate, setSelectedTemplate] = React.useState<ExportTemplate | null>(null)
  const [exportConfig, setExportConfig] = React.useState<Partial<ExportConfig>>({})
  const [showCustomization, setShowCustomization] = React.useState(false)
  const [exportJobs, setExportJobs] = React.useState<ExportJob[]>([])
  const [searchQuery, setSearchQuery] = React.useState('')
  const [selectedCategory, setSelectedCategory] = React.useState<string>('all')
  const [showPreview, setShowPreview] = React.useState(false)
  const [isExporting, setIsExporting] = React.useState(false)

  const filteredTemplates = React.useMemo(() => {
    return EXPORT_TEMPLATES.filter(template => {
      const matchesSearch = template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           template.description.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesCategory = selectedCategory === 'all' || template.category === selectedCategory
      
      return matchesSearch && matchesCategory
    })
  }, [searchQuery, selectedCategory])

  const getFormatIcon = (format: ExportTemplate['format']) => {
    switch (format) {
      case 'pdf': return <FileText className="w-4 h-4 text-danger-500" />
      case 'docx': return <FileText className="w-4 h-4 text-guardian-500" />
      case 'html': return <Code className="w-4 h-4 text-alert-500" />
      case 'csv': return <Table className="w-4 h-4 text-sage-500" />
      case 'json': return <Code className="w-4 h-4 text-guardian-500" />
      case 'xlsx': return <Table className="w-4 h-4 text-sage-500" />
      default: return <FileText className="w-4 h-4" />
    }
  }

  const getCategoryIcon = (category: ExportTemplate['category']) => {
    switch (category) {
      case 'report': return <FileText className="w-4 h-4" />
      case 'summary': return <BarChart3 className="w-4 h-4" />
      case 'data': return <Table className="w-4 h-4" />
      case 'presentation': return <Monitor className="w-4 h-4" />
      case 'compliance': return <Shield className="w-4 h-4" />
      default: return <FileText className="w-4 h-4" />
    }
  }

  const startExport = async (template: ExportTemplate, config: Partial<ExportConfig>) => {
    setIsExporting(true)
    
    const job: ExportJob = {
      id: `export-${Date.now()}`,
      templateId: template.id,
      status: 'pending',
      progress: 0,
      createdAt: new Date().toISOString(),
      metadata: {
        documentName: analysis?.documentName || 'Document Analysis',
        format: template.format,
        template: template.name,
        dataTypes: template.supportedData
      }
    }

    setExportJobs(prev => [job, ...prev])

    // Simulate export progress
    const progressInterval = setInterval(() => {
      setExportJobs(prev => prev.map(j => {
        if (j.id === job.id && j.status === 'processing') {
          const newProgress = Math.min(j.progress + Math.random() * 20, 100)
          if (newProgress >= 100) {
            clearInterval(progressInterval)
            return {
              ...j,
              status: 'completed',
              progress: 100,
              completedAt: new Date().toISOString(),
              downloadUrl: `/api/exports/${j.id}/download`,
              fileSize: Math.floor(Math.random() * 5000000) + 1000000 // 1-5MB
            }
          }
          return { ...j, progress: newProgress }
        }
        return j
      }))
    }, 500)

    // Start processing after a delay
    setTimeout(() => {
      setExportJobs(prev => prev.map(j => 
        j.id === job.id ? { ...j, status: 'processing' } : j
      ))
    }, 1000)

    setIsExporting(false)
    setSelectedTemplate(null)
    setShowCustomization(false)
  }

  const downloadExport = (job: ExportJob) => {
    // In a real implementation, this would trigger the actual download
    console.log('Downloading export:', job)
    
    // Create a temporary download link
    const link = document.createElement('a')
    link.href = job.downloadUrl || '#'
    link.download = `${job.metadata.documentName}-${job.metadata.template}.${job.metadata.format}`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Download className="w-6 h-6 text-guardian-500" />
            Export Center
          </h2>
          <p className="text-muted-foreground">
            Export your analysis in multiple formats with professional templates
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <Archive className="w-3 h-3" />
            {exportJobs.length} exports
          </Badge>
        </div>
      </div>

      {/* Export Queue */}
      {exportJobs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4" />
              Recent Exports
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {exportJobs.slice(0, 3).map(job => (
                <div key={job.id} className="flex items-center gap-4 p-3 bg-neutral-50 dark:bg-neutral-900 rounded-lg">
                  <div className="flex-shrink-0">
                    {getFormatIcon(job.metadata.format as any)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <div className="font-medium text-sm">{job.metadata.template}</div>
                      <Badge 
                        variant={
                          job.status === 'completed' ? 'sage' :
                          job.status === 'failed' ? 'destructive' :
                          job.status === 'processing' ? 'default' : 'secondary'
                        }
                        size="sm"
                      >
                        {job.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mb-2">
                      {job.metadata.documentName} • {new Date(job.createdAt).toLocaleString()}
                    </div>
                    {job.status === 'processing' && (
                      <Progress value={job.progress} className="h-1" />
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {job.status === 'completed' && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => downloadExport(job)}
                          leftIcon={<Download className="w-3 h-3" />}
                        >
                          Download
                        </Button>
                        {job.fileSize && (
                          <span className="text-xs text-muted-foreground">
                            {(job.fileSize / 1024 / 1024).toFixed(1)}MB
                          </span>
                        )}
                      </>
                    )}
                    {job.status === 'failed' && (
                      <Button variant="outline" size="sm">
                        Retry
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Template Selection */}
      <div className="space-y-4">
        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              <Input
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                leftIcon={<Search className="w-4 h-4" />}
                className="flex-1 min-w-64"
              />
              
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-3 py-2 text-sm border rounded-md bg-background"
              >
                <option value="all">All Categories</option>
                <option value="report">Reports</option>
                <option value="summary">Summaries</option>
                <option value="data">Data Export</option>
                <option value="presentation">Presentations</option>
                <option value="compliance">Compliance</option>
              </select>
            </div>
          </CardContent>
        </Card>

        {/* Template Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTemplates.map((template, index) => (
            <motion.div
              key={template.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <TemplateCard
                template={template}
                onSelect={setSelectedTemplate}
                onPreview={() => {
                  setSelectedTemplate(template)
                  setShowPreview(true)
                }}
              />
            </motion.div>
          ))}
        </div>
      </div>

      {/* Template Selection Modal */}
      <AnimatePresence>
        {selectedTemplate && !showPreview && (
          <ExportConfigModal
            template={selectedTemplate}
            analysis={analysis}
            onExport={(config) => startExport(selectedTemplate, config)}
            onClose={() => {
              setSelectedTemplate(null)
              setShowCustomization(false)
            }}
          />
        )}
      </AnimatePresence>

      {/* Template Preview Modal */}
      <AnimatePresence>
        {showPreview && selectedTemplate && (
          <TemplatePreviewModal
            template={selectedTemplate}
            onClose={() => {
              setShowPreview(false)
              setSelectedTemplate(null)
            }}
            onSelect={() => {
              setShowPreview(false)
              // Keep template selected for configuration
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// Template Card Component
interface TemplateCardProps {
  template: ExportTemplate
  onSelect: (template: ExportTemplate) => void
  onPreview: () => void
}

const TemplateCard: React.FC<TemplateCardProps> = ({ template, onSelect, onPreview }) => {
  const [expanded, setExpanded] = React.useState(false)

  return (
    <Card className="h-full hover:shadow-lg transition-all duration-200 group">
      <CardContent className="p-6 h-full flex flex-col">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            {getFormatIcon(template.format)}
            <h3 className="font-semibold group-hover:text-guardian-600 transition-colors">
              {template.name}
            </h3>
          </div>
          
          <div className="flex items-center gap-2">
            <Badge variant="outline" size="sm" className="gap-1">
              {getCategoryIcon(template.category)}
              {template.category}
            </Badge>
            {template.premium && (
              <Badge variant="default" size="sm">
                Premium
              </Badge>
            )}
          </div>
        </div>
        
        <p className="text-muted-foreground text-sm mb-4 flex-1">
          {template.description}
        </p>
        
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Format:</span>
            <span className="font-medium uppercase">{template.format}</span>
          </div>
          
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Size:</span>
            <span className="font-medium">{template.estimatedSize}</span>
          </div>
          
          {template.customizable && (
            <div className="flex items-center gap-1 text-sm">
              <Palette className="w-3 h-3 text-guardian-500" />
              <span className="text-guardian-600">Customizable</span>
            </div>
          )}
          
          <div className="space-y-2">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              Features ({template.features.length})
            </button>
            
            <AnimatePresence>
              {expanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-1"
                >
                  {template.features.map((feature, index) => (
                    <div key={index} className="flex items-center gap-2 text-xs">
                      <Check className="w-3 h-3 text-sage-500 flex-shrink-0" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
          <div className="flex items-center gap-2 pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={onPreview}
              leftIcon={<Eye className="w-3 h-3" />}
              className="flex-1"
            >
              Preview
            </Button>
            <Button
              size="sm"
              onClick={() => onSelect(template)}
              leftIcon={<Download className="w-3 h-3" />}
              className="flex-1"
            >
              Export
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// Export Configuration Modal
interface ExportConfigModalProps {
  template: ExportTemplate
  analysis?: DocumentAnalysisResponse
  onExport: (config: Partial<ExportConfig>) => void
  onClose: () => void
}

const ExportConfigModal: React.FC<ExportConfigModalProps> = ({
  template,
  analysis,
  onExport,
  onClose,
}) => {
  const [config, setConfig] = React.useState<Partial<ExportConfig>>({
    template,
    includeFindings: true,
    includeAnalysis: true,
    includeComparison: false,
    includeActions: true,
    includeCharts: true,
    filterBySeverity: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
    filterByCategory: [],
    customizations: {
      brandingEnabled: false,
      includePageNumbers: true,
      includeTableOfContents: true,
      includeExecutiveSummary: true,
      includeAppendix: false,
    },
    delivery: {
      method: 'download'
    }
  })

  const [activeTab, setActiveTab] = React.useState<'content' | 'customization' | 'delivery'>('content')

  const handleConfigChange = (key: string, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }))
  }

  const handleCustomizationChange = (key: string, value: any) => {
    setConfig(prev => ({
      ...prev,
      customizations: { ...prev.customizations, [key]: value }
    }))
  }

  const handleExport = () => {
    onExport(config)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white dark:bg-neutral-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                {getFormatIcon(template.format)}
                Export Configuration
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {template.name} • {template.format.toUpperCase()}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>×</Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          {[
            { id: 'content', label: 'Content', icon: FileText },
            { id: 'customization', label: 'Style', icon: Palette },
            { id: 'delivery', label: 'Delivery', icon: Share }
          ].map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  'flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors flex-1',
                  activeTab === tab.id
                    ? 'bg-guardian-50 dark:bg-guardian-950 text-guardian-600 border-b-2 border-guardian-500'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'content' && (
            <div className="space-y-6">
              <div>
                <h3 className="font-medium mb-3">Include Data</h3>
                <div className="space-y-3">
                  {template.supportedData.includes('findings') && (
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={config.includeFindings}
                        onChange={(e) => handleConfigChange('includeFindings', e.target.checked)}
                        className="rounded"
                      />
                      <span>Analysis Findings ({analysis?.findings?.length || 0})</span>
                    </label>
                  )}
                  
                  {template.supportedData.includes('analysis') && (
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={config.includeAnalysis}
                        onChange={(e) => handleConfigChange('includeAnalysis', e.target.checked)}
                        className="rounded"
                      />
                      <span>Analysis Summary</span>
                    </label>
                  )}
                  
                  {template.supportedData.includes('actions') && (
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={config.includeActions}
                        onChange={(e) => handleConfigChange('includeActions', e.target.checked)}
                        className="rounded"
                      />
                      <span>Action Recommendations</span>
                    </label>
                  )}
                  
                  {template.supportedData.includes('metrics') && (
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={config.includeCharts}
                        onChange={(e) => handleConfigChange('includeCharts', e.target.checked)}
                        className="rounded"
                      />
                      <span>Charts & Visualizations</span>
                    </label>
                  )}
                </div>
              </div>

              <div>
                <h3 className="font-medium mb-3">Filter by Severity</h3>
                <div className="flex flex-wrap gap-2">
                  {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(severity => (
                    <label key={severity} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={config.filterBySeverity?.includes(severity)}
                        onChange={(e) => {
                          const current = config.filterBySeverity || []
                          const updated = e.target.checked
                            ? [...current, severity]
                            : current.filter(s => s !== severity)
                          handleConfigChange('filterBySeverity', updated)
                        }}
                        className="rounded"
                      />
                      <Badge 
                        variant={
                          severity === 'CRITICAL' ? 'destructive' :
                          severity === 'HIGH' ? 'default' :
                          severity === 'MEDIUM' ? 'secondary' : 'outline'
                        }
                        size="sm"
                      >
                        {severity}
                      </Badge>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'customization' && template.customizable && (
            <div className="space-y-6">
              <div>
                <h3 className="font-medium mb-3">Branding</h3>
                <div className="space-y-3">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.customizations?.brandingEnabled}
                      onChange={(e) => handleCustomizationChange('brandingEnabled', e.target.checked)}
                      className="rounded"
                    />
                    <span>Enable custom branding</span>
                  </label>
                  
                  {config.customizations?.brandingEnabled && (
                    <div className="ml-6 space-y-3">
                      <Input
                        label="Company Name"
                        placeholder="Your Company Name"
                        value={config.customizations?.companyName || ''}
                        onChange={(e) => handleCustomizationChange('companyName', e.target.value)}
                      />
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium mb-1">Header Color</label>
                          <input
                            type="color"
                            value={config.customizations?.headerColor || '#3b82f6'}
                            onChange={(e) => handleCustomizationChange('headerColor', e.target.value)}
                            className="w-full h-10 rounded border"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">Accent Color</label>
                          <input
                            type="color"
                            value={config.customizations?.accentColor || '#10b981'}
                            onChange={(e) => handleCustomizationChange('accentColor', e.target.value)}
                            className="w-full h-10 rounded border"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="font-medium mb-3">Document Options</h3>
                <div className="space-y-3">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.customizations?.includePageNumbers}
                      onChange={(e) => handleCustomizationChange('includePageNumbers', e.target.checked)}
                      className="rounded"
                    />
                    <span>Include page numbers</span>
                  </label>
                  
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.customizations?.includeTableOfContents}
                      onChange={(e) => handleCustomizationChange('includeTableOfContents', e.target.checked)}
                      className="rounded"
                    />
                    <span>Include table of contents</span>
                  </label>
                  
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.customizations?.includeExecutiveSummary}
                      onChange={(e) => handleCustomizationChange('includeExecutiveSummary', e.target.checked)}
                      className="rounded"
                    />
                    <span>Include executive summary</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'delivery' && (
            <div className="space-y-6">
              <div>
                <h3 className="font-medium mb-3">Delivery Method</h3>
                <div className="space-y-3">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="delivery"
                      checked={config.delivery?.method === 'download'}
                      onChange={() => setConfig(prev => ({
                        ...prev,
                        delivery: { ...prev.delivery, method: 'download' }
                      }))}
                    />
                    <Download className="w-4 h-4" />
                    <span>Direct Download</span>
                  </label>
                  
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="delivery"
                      checked={config.delivery?.method === 'email'}
                      onChange={() => setConfig(prev => ({
                        ...prev,
                        delivery: { ...prev.delivery, method: 'email' }
                      }))}
                    />
                    <Mail className="w-4 h-4" />
                    <span>Email Delivery</span>
                  </label>
                  
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="delivery"
                      checked={config.delivery?.method === 'cloud'}
                      onChange={() => setConfig(prev => ({
                        ...prev,
                        delivery: { ...prev.delivery, method: 'cloud' }
                      }))}
                    />
                    <Cloud className="w-4 h-4" />
                    <span>Cloud Storage</span>
                  </label>
                </div>
              </div>

              {config.delivery?.method === 'email' && (
                <div>
                  <label className="block text-sm font-medium mb-2">Email Recipients</label>
                  <Input
                    placeholder="email1@example.com, email2@example.com"
                    value={config.delivery?.emailRecipients?.join(', ') || ''}
                    onChange={(e) => setConfig(prev => ({
                      ...prev,
                      delivery: {
                        ...prev.delivery,
                        emailRecipients: e.target.value.split(',').map(email => email.trim()).filter(Boolean)
                      }
                    }))}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Estimated size: {template.estimatedSize}
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleExport} leftIcon={<Download className="w-4 h-4" />}>
              Export {template.format.toUpperCase()}
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

// Template Preview Modal
interface TemplatePreviewModalProps {
  template: ExportTemplate
  onClose: () => void
  onSelect: () => void
}

const TemplatePreviewModal: React.FC<TemplatePreviewModalProps> = ({
  template,
  onClose,
  onSelect,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white dark:bg-neutral-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Eye className="w-5 h-5" />
                Template Preview
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {template.name} • {template.format.toUpperCase()}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>×</Button>
          </div>
        </div>

        {/* Preview Content */}
        <div className="flex-1 overflow-y-auto bg-neutral-50 dark:bg-neutral-900 p-6">
          <div className="max-w-2xl mx-auto bg-white dark:bg-neutral-800 shadow-lg rounded-lg overflow-hidden">
            {/* Mock preview content */}
            <div className="p-8 space-y-6">
              <div className="text-center border-b pb-6">
                <h1 className="text-2xl font-bold mb-2">Document Analysis Report</h1>
                <p className="text-muted-foreground">Executive Summary</p>
                <div className="text-sm text-muted-foreground mt-2">
                  Generated on {new Date().toLocaleDateString()}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold mb-2">Risk Assessment</h2>
                  <div className="bg-danger-50 dark:bg-danger-950 p-4 rounded-lg border border-danger-200">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-4 h-4 text-danger-500" />
                      <span className="font-medium text-danger-700 dark:text-danger-300">High Risk Detected</span>
                    </div>
                    <p className="text-sm text-danger-600 dark:text-danger-400">
                      Several critical issues were identified that require immediate attention.
                    </p>
                  </div>
                </div>

                <div>
                  <h2 className="text-lg font-semibold mb-2">Key Findings</h2>
                  <div className="space-y-2">
                    {[
                      { severity: 'CRITICAL', title: 'Broad arbitration clause found' },
                      { severity: 'HIGH', title: 'Automatic renewal without notice' },
                      { severity: 'MEDIUM', title: 'Unclear data retention policy' }
                    ].map((finding, index) => (
                      <div key={index} className="flex items-center gap-3 p-3 bg-neutral-50 dark:bg-neutral-900 rounded">
                        <Badge 
                          variant={
                            finding.severity === 'CRITICAL' ? 'destructive' :
                            finding.severity === 'HIGH' ? 'default' : 'secondary'
                          }
                          size="sm"
                        >
                          {finding.severity}
                        </Badge>
                        <span className="text-sm">{finding.title}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {template.features.includes('Charts & Visualizations') && (
                  <div>
                    <h2 className="text-lg font-semibold mb-2">Risk Distribution</h2>
                    <div className="bg-neutral-100 dark:bg-neutral-800 h-32 rounded-lg flex items-center justify-center">
                      <div className="text-center text-muted-foreground">
                        <BarChart3 className="w-8 h-8 mx-auto mb-2" />
                        <div className="text-sm">Chart Preview</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            This is a preview of the {template.name} template structure
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={onClose}>
              Close Preview
            </Button>
            <Button onClick={onSelect} leftIcon={<Download className="w-4 h-4" />}>
              Use This Template
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

export default ExportCenter