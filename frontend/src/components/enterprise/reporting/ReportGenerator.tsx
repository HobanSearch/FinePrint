import React, { useState, useEffect } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '../../ui/Button'
import { Input } from '../../ui/Input'
import { Card } from '../../ui/Card'
import { Badge } from '../../ui/Badge'
import { LoadingPage } from '../../ui/LoadingPage'
import { useStore } from '../../../stores'
import { 
  ReportTemplate, 
  GeneratedReport, 
  ReportFilters, 
  ReportSchedule 
} from '../../../types/enterprise'
import { 
  FileText, 
  Download, 
  Calendar, 
  Filter, 
  Plus, 
  Trash2, 
  Edit, 
  Eye, 
  Clock, 
  Users, 
  BarChart3,
  PieChart,
  TrendingUp,
  Shield,
  AlertTriangle,
  CheckCircle,
  Settings,
  Share2,
  Copy,
  Mail,
  Webhook
} from 'lucide-react'

const reportTemplateSchema = z.object({
  name: z.string().min(1, 'Report name is required'),
  description: z.string().optional(),
  type: z.enum(['analysis', 'compliance', 'usage', 'security']),
  format: z.enum(['pdf', 'csv', 'xlsx', 'json']),
  branding: z.boolean(),
  watermark: z.boolean(),
  filters: z.object({
    dateRange: z.object({
      start: z.date().optional(),
      end: z.date().optional()
    }).optional(),
    users: z.array(z.string()).optional(),
    departments: z.array(z.string()).optional(),
    documentTypes: z.array(z.string()).optional(),
    riskLevels: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional()
  }),
  schedule: z.object({
    enabled: z.boolean(),
    frequency: z.enum(['daily', 'weekly', 'monthly', 'quarterly']).optional(),
    dayOfWeek: z.number().min(0).max(6).optional(),
    dayOfMonth: z.number().min(1).max(31).optional(),
    time: z.string().optional(),
    timezone: z.string().optional(),
    recipients: z.array(z.string()).optional(),
    deliveryMethod: z.enum(['email', 'webhook', 'download']).optional(),
    retainFor: z.number().min(1).max(365).optional()
  }).optional()
})

type ReportTemplateForm = z.infer<typeof reportTemplateSchema>

interface ReportGeneratorProps {
  template?: ReportTemplate
  onSave?: (template: ReportTemplate) => void
  onGenerate?: (templateId: string, filters?: any) => void
}

export const ReportGenerator: React.FC<ReportGeneratorProps> = ({
  template,
  onSave,
  onGenerate
}) => {
  const { enterprise } = useStore()
  const [isLoading, setIsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'templates' | 'generated' | 'create'>('templates')
  const [selectedTemplate, setSelectedTemplate] = useState<ReportTemplate | null>(null)
  const [previewData, setPreviewData] = useState<any>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    setValue,
    watch,
    reset,
    control
  } = useForm<ReportTemplateForm>({
    resolver: zodResolver(reportTemplateSchema),
    defaultValues: {
      type: 'analysis',
      format: 'pdf',
      branding: true,
      watermark: false,
      filters: {},
      schedule: {
        enabled: false,
        frequency: 'weekly',
        time: '09:00',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        deliveryMethod: 'email',
        retainFor: 30
      }
    }
  })

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'filters.tags'
  })

  useEffect(() => {
    enterprise.fetchReportTemplates()
    enterprise.fetchGeneratedReports()
  }, [])

  useEffect(() => {
    if (template) {
      reset({
        name: template.name,
        description: template.description,
        type: template.type,
        format: template.format,
        branding: template.branding,
        watermark: template.watermark,
        filters: template.filters,
        schedule: template.schedule
      })
    }
  }, [template, reset])

  const onSubmit = async (data: ReportTemplateForm) => {
    if (!enterprise.currentOrganization) return

    setIsLoading(true)
    try {
      const templateData: Partial<ReportTemplate> = {
        ...data,
        organizationId: enterprise.currentOrganization.id,
        template: {
          sections: getTemplateSections(data.type),
          styling: data.branding ? getBrandedStyling() : getDefaultStyling(),
          charts: getChartConfiguration(data.type)
        }
      }

      if (template) {
        await enterprise.updateReportTemplate(template.id, templateData)
      } else {
        await enterprise.createReportTemplate(templateData)
      }

      setActiveTab('templates')
      reset()
    } catch (error) {
      console.error('Failed to save report template:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const generateReport = async (templateId: string, customFilters?: any) => {
    setIsLoading(true)
    try {
      const report = await enterprise.generateReport(templateId, customFilters)
      setActiveTab('generated')
      
      // Show success notification
      enterprise.clearError()
    } catch (error) {
      console.error('Failed to generate report:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const scheduleReport = async (templateId: string, schedule: ReportSchedule) => {
    setIsLoading(true)
    try {
      await enterprise.scheduleReport(templateId, schedule)
      await enterprise.fetchReportTemplates()
    } catch (error) {
      console.error('Failed to schedule report:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const duplicateTemplate = async (template: ReportTemplate) => {
    setIsLoading(true)
    try {
      await enterprise.createReportTemplate({
        ...template,
        id: undefined,
        name: `${template.name} (Copy)`,
        createdAt: undefined,
        updatedAt: undefined
      })
    } catch (error) {
      console.error('Failed to duplicate template:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const deleteTemplate = async (templateId: string) => {
    if (confirm('Are you sure you want to delete this report template?')) {
      setIsLoading(true)
      try {
        await enterprise.deleteReportTemplate(templateId)
      } catch (error) {
        console.error('Failed to delete template:', error)
      } finally {
        setIsLoading(false)
      }
    }
  }

  const getTemplateSections = (type: string) => {
    const baseSections = [
      { id: 'header', title: 'Report Header', required: true },
      { id: 'summary', title: 'Executive Summary', required: true },
      { id: 'data', title: 'Data Analysis', required: true },
      { id: 'footer', title: 'Report Footer', required: false }
    ]

    switch (type) {
      case 'analysis':
        return [
          ...baseSections,
          { id: 'findings', title: 'Key Findings', required: true },
          { id: 'recommendations', title: 'Recommendations', required: true },
          { id: 'risk_assessment', title: 'Risk Assessment', required: true }
        ]
      case 'compliance':
        return [
          ...baseSections,
          { id: 'compliance_status', title: 'Compliance Status', required: true },
          { id: 'violations', title: 'Violations', required: true },
          { id: 'remediation', title: 'Remediation Steps', required: true }
        ]
      case 'usage':
        return [
          ...baseSections,
          { id: 'metrics', title: 'Usage Metrics', required: true },
          { id: 'trends', title: 'Trend Analysis', required: true },
          { id: 'performance', title: 'Performance Indicators', required: true }
        ]
      case 'security':
        return [
          ...baseSections,
          { id: 'threats', title: 'Threat Analysis', required: true },
          { id: 'incidents', title: 'Security Incidents', required: true },
          { id: 'recommendations', title: 'Security Recommendations', required: true }
        ]
      default:
        return baseSections
    }
  }

  const getBrandedStyling = () => {
    const org = enterprise.currentOrganization
    return {
      primaryColor: org?.branding?.primaryColor || '#3B82F6',
      secondaryColor: org?.branding?.secondaryColor || '#64748B',
      logoUrl: org?.branding?.logoUrl,
      companyName: org?.branding?.companyName || org?.name,
      customCSS: org?.branding?.customCSS
    }
  }

  const getDefaultStyling = () => {
    return {
      primaryColor: '#3B82F6',
      secondaryColor: '#64748B',
      logoUrl: null,
      companyName: 'Fine Print AI',
      customCSS: null
    }
  }

  const getChartConfiguration = (type: string) => {
    switch (type) {
      case 'analysis':
        return [
          { type: 'bar', title: 'Risk Distribution', dataKey: 'riskLevels' },
          { type: 'pie', title: 'Document Types', dataKey: 'documentTypes' },
          { type: 'line', title: 'Analysis Trends', dataKey: 'analysisOverTime' }
        ]
      case 'compliance':
        return [
          { type: 'gauge', title: 'Compliance Score', dataKey: 'complianceScore' },
          { type: 'bar', title: 'Violations by Category', dataKey: 'violationCategories' }
        ]
      case 'usage':
        return [
          { type: 'line', title: 'Usage Over Time', dataKey: 'usageOverTime' },
          { type: 'bar', title: 'User Activity', dataKey: 'userActivity' },
          { type: 'pie', title: 'Feature Usage', dataKey: 'featureUsage' }
        ]
      case 'security':
        return [
          { type: 'bar', title: 'Security Events', dataKey: 'securityEvents' },
          { type: 'line', title: 'Threat Trends', dataKey: 'threatTrends' }
        ]
      default:
        return []
    }
  }

  const getReportIcon = (type: string) => {
    switch (type) {
      case 'analysis': return <BarChart3 className="h-5 w-5" />
      case 'compliance': return <Shield className="h-5 w-5" />
      case 'usage': return <TrendingUp className="h-5 w-5" />
      case 'security': return <AlertTriangle className="h-5 w-5" />
      default: return <FileText className="h-5 w-5" />
    }
  }

  const getFormatIcon = (format: string) => {
    switch (format) {
      case 'pdf': return '📄'
      case 'csv': return '📊'
      case 'xlsx': return '📈'
      case 'json': return '🔧'
      default: return '📄'
    }
  }

  if (enterprise.isLoading && enterprise.reportTemplates.length === 0) {
    return <LoadingPage message="Loading report templates..." />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <FileText className="h-6 w-6 text-blue-500" />
          <h2 className="text-2xl font-bold text-gray-900">
            Advanced Reporting
          </h2>
        </div>
        <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setActiveTab('templates')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'templates'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Templates
          </button>
          <button
            onClick={() => setActiveTab('generated')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'generated'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Generated Reports
          </button>
          <button
            onClick={() => setActiveTab('create')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'create'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Create Template
          </button>
        </div>
      </div>

      {/* Templates Tab */}
      {activeTab === 'templates' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Report Templates</h3>
            <Button
              onClick={() => setActiveTab('create')}
              className="flex items-center space-x-2"
            >
              <Plus className="h-4 w-4" />
              <span>New Template</span>
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {enterprise.reportTemplates.map((template) => (
              <Card key={template.id} className="p-6 hover:shadow-lg transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                      {getReportIcon(template.type)}
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900">{template.name}</h4>
                      <p className="text-sm text-gray-500 capitalize">{template.type} Report</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-1">
                    <span className="text-lg">{getFormatIcon(template.format)}</span>
                    {template.schedule?.enabled && (
                      <Clock className="h-4 w-4 text-green-500" />
                    )}
                  </div>
                </div>

                {template.description && (
                  <p className="text-sm text-gray-600 mb-4">{template.description}</p>
                )}

                <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
                  <span>Created {new Date(template.createdAt).toLocaleDateString()}</span>
                  <span>by {template.createdBy}</span>
                </div>

                <div className="flex space-x-2">
                  <Button
                    size="sm"
                    onClick={() => generateReport(template.id)}
                    disabled={isLoading}
                    className="flex-1"
                  >
                    Generate
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelectedTemplate(template)
                      setActiveTab('create')
                    }}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => duplicateTemplate(template)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => deleteTemplate(template.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>

          {enterprise.reportTemplates.length === 0 && (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-4">No report templates found</p>
              <Button onClick={() => setActiveTab('create')}>
                Create Your First Template
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Generated Reports Tab */}
      {activeTab === 'generated' && (
        <div className="space-y-6">
          <h3 className="text-lg font-semibold">Generated Reports</h3>

          <div className="bg-white shadow-sm rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Report
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Template
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Generated
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Size
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Downloads
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {enterprise.generatedReports.map((report) => (
                  <tr key={report.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="text-sm font-medium text-gray-900">
                          {report.name}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {enterprise.reportTemplates.find(t => t.id === report.templateId)?.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(report.generatedAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge 
                        variant={
                          report.status === 'completed' ? 'success' :
                          report.status === 'failed' ? 'destructive' : 'secondary'
                        }
                      >
                        {report.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {report.fileSizeBytes ? 
                        `${(report.fileSizeBytes / 1024 / 1024).toFixed(1)} MB` : 
                        '-'
                      }
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {report.downloadCount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-2">
                        {report.status === 'completed' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => enterprise.downloadReport(report.id)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {/* Open report details */}}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {enterprise.generatedReports.length === 0 && (
            <div className="text-center py-12">
              <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No reports generated yet</p>
            </div>
          )}
        </div>
      )}

      {/* Create Template Tab */}
      {activeTab === 'create' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">
              {selectedTemplate ? 'Edit Template' : 'Create Report Template'}
            </h3>
            <Button
              variant="outline"
              onClick={() => {
                setActiveTab('templates')
                setSelectedTemplate(null)
                reset()
              }}
            >
              Cancel
            </Button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Basic Information */}
            <Card className="p-6">
              <h4 className="text-lg font-semibold mb-4">Basic Information</h4>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Template Name *
                  </label>
                  <Input
                    {...register('name')}
                    placeholder="Monthly Analysis Report"
                    error={errors.name?.message}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    {...register('description')}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Detailed monthly analysis of legal document findings and recommendations"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Report Type *
                    </label>
                    <select
                      {...register('type')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="analysis">Analysis Report</option>
                      <option value="compliance">Compliance Report</option>
                      <option value="usage">Usage Report</option>
                      <option value="security">Security Report</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Output Format *
                    </label>
                    <select
                      {...register('format')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="pdf">PDF Document</option>
                      <option value="csv">CSV Spreadsheet</option>
                      <option value="xlsx">Excel Workbook</option>
                      <option value="json">JSON Data</option>
                    </select>
                  </div>
                </div>
              </div>
            </Card>

            {/* Filters */}
            <Card className="p-6">
              <h4 className="text-lg font-semibold mb-4">Data Filters</h4>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Start Date
                    </label>
                    <Input
                      type="date"
                      {...register('filters.dateRange.start', { valueAsDate: true })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      End Date
                    </label>
                    <Input
                      type="date"
                      {...register('filters.dateRange.end', { valueAsDate: true })}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Document Types
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {['Terms of Service', 'Privacy Policy', 'EULA', 'Cookie Policy'].map(type => (
                      <label key={type} className="flex items-center">
                        <input
                          type="checkbox"
                          value={type}
                          {...register('filters.documentTypes')}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="ml-2 text-sm text-gray-700">{type}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Risk Levels
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {['Low', 'Medium', 'High', 'Critical'].map(level => (
                      <label key={level} className="flex items-center">
                        <input
                          type="checkbox"
                          value={level}
                          {...register('filters.riskLevels')}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="ml-2 text-sm text-gray-700">{level}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            {/* Styling */}
            <Card className="p-6">
              <h4 className="text-lg font-semibold mb-4">Report Styling</h4>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      Apply Organization Branding
                    </label>
                    <p className="text-sm text-gray-500">
                      Use your organization's colors, logo, and styling
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    {...register('branding')}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      Add Watermark
                    </label>
                    <p className="text-sm text-gray-500">
                      Add a watermark to prevent unauthorized distribution
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    {...register('watermark')}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                </div>
              </div>
            </Card>

            {/* Scheduling */}
            <Card className="p-6">
              <h4 className="text-lg font-semibold mb-4">Scheduling (Optional)</h4>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      Enable Automatic Generation
                    </label>
                    <p className="text-sm text-gray-500">
                      Generate this report automatically on a schedule
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    {...register('schedule.enabled')}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                </div>

                {watch('schedule.enabled') && (
                  <div className="space-y-4 pt-4 border-t">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Frequency
                        </label>
                        <select
                          {...register('schedule.frequency')}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                          <option value="monthly">Monthly</option>
                          <option value="quarterly">Quarterly</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Time
                        </label>
                        <Input
                          type="time"
                          {...register('schedule.time')}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Delivery Method
                        </label>
                        <select
                          {...register('schedule.deliveryMethod')}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="email">Email</option>
                          <option value="webhook">Webhook</option>
                          <option value="download">Download Link</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Recipients (one per line)
                      </label>
                      <textarea
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="user@example.com&#10;admin@example.com"
                        onChange={(e) => {
                          const recipients = e.target.value.split('\n').filter(Boolean)
                          setValue('schedule.recipients', recipients)
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </Card>

            {/* Actions */}
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-500">
                {isDirty && '* You have unsaved changes'}
              </div>
              <div className="flex space-x-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => reset()}
                  disabled={isLoading || !isDirty}
                >
                  Reset
                </Button>
                <Button
                  type="submit"
                  disabled={isLoading}
                >
                  {isLoading ? 'Saving...' : selectedTemplate ? 'Update Template' : 'Create Template'}
                </Button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}