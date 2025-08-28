import React, { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '../../ui/Button'
import { Input } from '../../ui/Input'
import { Card } from '../../ui/Card'
import { Badge } from '../../ui/Badge'
import { LoadingPage } from '../../ui/LoadingPage'
import { useStore } from '../../../stores'
import { 
  DataExportRequest, 
  DataDeletionRequest, 
  AuditLog, 
  ComplianceSettings 
} from '../../../types/enterprise'
import { 
  Shield, 
  Download, 
  Trash2, 
  Eye, 
  FileText, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Search, 
  Filter, 
  Calendar, 
  User, 
  Activity, 
  Lock, 
  Globe, 
  Scale, 
  Zap,
  Settings,
  Database,
  History,
  Export,
  UserX
} from 'lucide-react'
import { EvidenceManager } from '../soc2/EvidenceManager'
import { RealTimeMonitoringDashboard } from '../monitoring/RealTimeMonitoringDashboard'

const dataExportSchema = z.object({
  type: z.enum(['gdpr', 'ccpa', 'general']),
  includeDocuments: z.boolean(),
  includeAnalyses: z.boolean(),
  includeAuditLogs: z.boolean(),
  format: z.enum(['json', 'csv', 'pdf']),
  reason: z.string().min(1, 'Reason is required')
})

const dataDeletionSchema = z.object({
  reason: z.string().min(1, 'Reason is required'),
  deletionScope: z.object({
    userData: z.boolean(),
    documents: z.boolean(),
    analyses: z.boolean(),
    auditLogs: z.boolean()
  }),
  verificationCode: z.string().optional()
})

const auditFiltersSchema = z.object({
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  userId: z.string().optional(),
  action: z.string().optional(),
  resource: z.string().optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional()
})

type DataExportForm = z.infer<typeof dataExportSchema>
type DataDeletionForm = z.infer<typeof dataDeletionSchema>
type AuditFiltersForm = z.infer<typeof auditFiltersSchema>

export const ComplianceCenter: React.FC = () => {
  const { enterprise } = useStore()
  const [activeTab, setActiveTab] = useState<'overview' | 'soc2' | 'monitoring' | 'export' | 'deletion' | 'audit'>('overview')
  const [selectedRequest, setSelectedRequest] = useState<DataExportRequest | DataDeletionRequest | null>(null)
  const [auditPage, setAuditPage] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  
  // SOC2 specific state
  const [soc2Data, setSoc2Data] = useState<any>(null)
  const [soc2Loading, setSoc2Loading] = useState(false)
  const [selectedControl, setSelectedControl] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<any>(null)

  const {
    register: registerExport,
    handleSubmit: handleSubmitExport,
    formState: { errors: exportErrors },
    reset: resetExport
  } = useForm<DataExportForm>({
    resolver: zodResolver(dataExportSchema),
    defaultValues: {
      type: 'general',
      includeDocuments: true,
      includeAnalyses: true,
      includeAuditLogs: false,
      format: 'json'
    }
  })

  const {
    register: registerDeletion,
    handleSubmit: handleSubmitDeletion,
    formState: { errors: deletionErrors },
    reset: resetDeletion,
    watch: watchDeletion
  } = useForm<DataDeletionForm>({
    resolver: zodResolver(dataDeletionSchema),
    defaultValues: {
      deletionScope: {
        userData: true,
        documents: true,
        analyses: true,
        auditLogs: false
      }
    }
  })

  const {
    register: registerFilters,
    handleSubmit: handleSubmitFilters,
    setValue: setFilterValue,
    reset: resetFilters
  } = useForm<AuditFiltersForm>({
    resolver: zodResolver(auditFiltersSchema)
  })

  useEffect(() => {
    enterprise.fetchDataRequests()
    enterprise.fetchAuditLogs()
    if (activeTab === 'soc2') {
      fetchSOC2Data()
    }
  }, [activeTab])

  const fetchSOC2Data = async () => {
    setSoc2Loading(true)
    try {
      const response = await fetch('/api/soc2/overview', {
        headers: {
          'Authorization': `Bearer ${enterprise.user?.token}`,
        },
      })
      if (response.ok) {
        const data = await response.json()
        setSoc2Data(data.data)
      }
    } catch (error) {
      console.error('Failed to fetch SOC2 data:', error)
    } finally {
      setSoc2Loading(false)
    }
  }

  const runSOC2Tests = async (controlIds?: string[]) => {
    setSoc2Loading(true)
    try {
      const response = await fetch('/api/soc2/tests/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${enterprise.user?.token}`,
        },
        body: JSON.stringify({ control_ids: controlIds }),
      })
      if (response.ok) {
        const data = await response.json()
        setTestResults(data.data)
        // Refresh overview data after tests
        await fetchSOC2Data()
      }
    } catch (error) {
      console.error('Failed to run SOC2 tests:', error)
    } finally {
      setSoc2Loading(false)
    }
  }

  const generateSOC2Report = async () => {
    setSoc2Loading(true)
    try {
      const response = await fetch('/api/soc2/reports', {
        headers: {
          'Authorization': `Bearer ${enterprise.user?.token}`,
        },
      })
      if (response.ok) {
        const data = await response.json()
        // Create download link for the report
        const reportData = JSON.stringify(data.data, null, 2)
        const blob = new Blob([reportData], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `soc2-compliance-report-${new Date().toISOString().split('T')[0]}.json`
        link.click()
        URL.revokeObjectURL(url)
      }
    } catch (error) {
      console.error('Failed to generate SOC2 report:', error)
    } finally {
      setSoc2Loading(false)
    }
  }

  const requestDataExport = async (data: DataExportForm) => {
    setIsLoading(true)
    try {
      await enterprise.requestDataExport(data.type, {
        includeDocuments: data.includeDocuments,
        includeAnalyses: data.includeAnalyses,
        includeAuditLogs: data.includeAuditLogs,
        format: data.format,
        reason: data.reason
      })
      resetExport()
      setActiveTab('overview')
    } catch (error) {
      console.error('Failed to request data export:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const requestDataDeletion = async (data: DataDeletionForm) => {
    if (!confirm('This action cannot be undone. Are you sure you want to delete your data?')) {
      return
    }

    setIsLoading(true)
    try {
      await enterprise.requestDataDeletion({
        reason: data.reason,
        deletionScope: data.deletionScope
      })
      resetDeletion()
      setActiveTab('overview')
    } catch (error) {
      console.error('Failed to request data deletion:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const verifyDeletion = async (requestId: string, code: string) => {
    setIsLoading(true)
    try {
      await enterprise.verifyDataDeletion(requestId, code)
      await enterprise.fetchDataRequests()
    } catch (error) {
      console.error('Failed to verify deletion:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const filterAuditLogs = async (data: AuditFiltersForm) => {
    setIsLoading(true)
    try {
      await enterprise.fetchAuditLogs(data)
      setAuditPage(1)
    } catch (error) {
      console.error('Failed to filter audit logs:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const exportAuditLogs = async (format: 'csv' | 'json') => {
    setIsLoading(true)
    try {
      const downloadUrl = await enterprise.exportAuditLogs(format, enterprise.auditFilters)
      // Create download link
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = `audit-logs-${new Date().toISOString().split('T')[0]}.${format}`
      link.click()
    } catch (error) {
      console.error('Failed to export audit logs:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />
      case 'processing':
        return <Clock className="h-5 w-5 text-yellow-500 animate-spin" />
      default:
        return <Clock className="h-5 w-5 text-gray-500" />
    }
  }

  const getActionIcon = (action: string) => {
    if (action.includes('login')) return <User className="h-4 w-4" />
    if (action.includes('document')) return <FileText className="h-4 w-4" />
    if (action.includes('analysis')) return <Activity className="h-4 w-4" />
    if (action.includes('user')) return <User className="h-4 w-4" />
    if (action.includes('system')) return <Settings className="h-4 w-4" />
    return <Shield className="h-4 w-4" />
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-600 bg-red-100'
      case 'high': return 'text-orange-600 bg-orange-100'
      case 'medium': return 'text-yellow-600 bg-yellow-100'
      case 'low': return 'text-green-600 bg-green-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  if (enterprise.isLoading && enterprise.auditLogs.length === 0) {
    return <LoadingPage message="Loading compliance center..." />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Shield className="h-6 w-6 text-blue-500" />
          <h2 className="text-2xl font-bold text-gray-900">
            Compliance Center
          </h2>
        </div>
        <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'overview'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('soc2')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'soc2'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            SOC2
          </button>
          <button
            onClick={() => setActiveTab('monitoring')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'monitoring'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Monitoring
          </button>
          <button
            onClick={() => setActiveTab('export')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'export'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Data Export
          </button>
          <button
            onClick={() => setActiveTab('deletion')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'deletion'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Data Deletion
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'audit'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Audit Trail
          </button>
        </div>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Compliance Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            <Card className="p-6">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-blue-100 text-blue-600">
                  <Globe className="h-6 w-6" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">GDPR Status</p>
                  <p className="text-2xl font-bold text-green-600">Compliant</p>
                </div>
              </div>
            </Card>
            <Card className="p-6">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-purple-100 text-purple-600">
                  <Scale className="h-6 w-6" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">CCPA Status</p>
                  <p className="text-2xl font-bold text-green-600">Compliant</p>
                </div>
              </div>
            </Card>
            <Card className="p-6">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-green-100 text-green-600">
                  <Lock className="h-6 w-6" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Data Encrypted</p>
                  <p className="text-2xl font-bold text-green-600">100%</p>
                </div>
              </div>
            </Card>
            <Card className="p-6">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-orange-100 text-orange-600">
                  <History className="h-6 w-6" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Audit Logs</p>
                  <p className="text-2xl font-bold text-gray-900">{enterprise.auditLogs.length}</p>
                </div>
              </div>
            </Card>
            <Card className="p-6">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-red-100 text-red-600">
                  <Shield className="h-6 w-6" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">SOC2 Status</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {soc2Data ? `${soc2Data.compliance_percentage}%` : '—'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {soc2Data ? `${soc2Data.implemented_controls}/${soc2Data.total_controls} controls` : 'Loading...'}
                  </p>
                </div>
              </div>
            </Card>
          </div>

          {/* Recent Requests */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Recent Data Requests</h3>
              <div className="flex space-x-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setActiveTab('export')}
                >
                  <Export className="h-4 w-4 mr-2" />
                  Export Data
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setActiveTab('deletion')}
                  className="text-red-600 hover:text-red-700"
                >
                  <UserX className="h-4 w-4 mr-2" />
                  Delete Data
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              {/* Export Requests */}
              {enterprise.dataExportRequests.slice(0, 5).map((request) => (
                <div key={request.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-4">
                    {getStatusIcon(request.status)}
                    <div>
                      <p className="font-medium text-gray-900">
                        Data Export ({request.type.toUpperCase()})
                      </p>
                      <p className="text-sm text-gray-500">
                        Requested on {new Date(request.requestedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant={
                      request.status === 'completed' ? 'success' :
                      request.status === 'failed' ? 'destructive' : 'secondary'
                    }>
                      {request.status}
                    </Badge>
                    {request.status === 'completed' && request.downloadUrl && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => enterprise.downloadDataExport(request.id)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              {/* Deletion Requests */}
              {enterprise.dataDeletionRequests.slice(0, 5).map((request) => (
                <div key={request.id} className="flex items-center justify-between p-4 bg-red-50 rounded-lg">
                  <div className="flex items-center space-x-4">
                    {getStatusIcon(request.status)}
                    <div>
                      <p className="font-medium text-gray-900">
                        Data Deletion Request
                      </p>
                      <p className="text-sm text-gray-500">
                        Requested on {new Date(request.requestedAt).toLocaleDateString()}
                        {request.scheduledFor && (
                          <span> • Scheduled for {new Date(request.scheduledFor).toLocaleDateString()}</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant={
                      request.status === 'completed' ? 'success' :
                      request.status === 'failed' ? 'destructive' : 'secondary'
                    }>
                      {request.status}
                    </Badge>
                    {request.verification.required && !request.verification.verifiedAt && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedRequest(request)}
                      >
                        Verify
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              {enterprise.dataExportRequests.length === 0 && enterprise.dataDeletionRequests.length === 0 && (
                <div className="text-center py-8">
                  <Database className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No data requests found</p>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* SOC2 Compliance Tab */}
      {activeTab === 'soc2' && (
        <div className="space-y-6">
          {soc2Loading && !soc2Data ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading SOC2 compliance data...</p>
              </div>
            </div>
          ) : (
            <>
              {/* SOC2 Overview Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card className="p-6">
                  <div className="flex items-center">
                    <div className="p-3 rounded-full bg-blue-100 text-blue-600">
                      <Shield className="h-6 w-6" />
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-600">Compliance Score</p>
                      <p className="text-2xl font-bold text-blue-600">
                        {soc2Data?.compliance_percentage || 0}%
                      </p>
                    </div>
                  </div>
                </Card>
                <Card className="p-6">
                  <div className="flex items-center">
                    <div className="p-3 rounded-full bg-green-100 text-green-600">
                      <CheckCircle className="h-6 w-6" />
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-600">Implemented Controls</p>
                      <p className="text-2xl font-bold text-green-600">
                        {soc2Data?.implemented_controls || 0}/{soc2Data?.total_controls || 0}
                      </p>
                    </div>
                  </div>
                </Card>
                <Card className="p-6">
                  <div className="flex items-center">
                    <div className="p-3 rounded-full bg-yellow-100 text-yellow-600">
                      <Clock className="h-6 w-6" />
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-600">Overdue Tests</p>
                      <p className="text-2xl font-bold text-yellow-600">
                        {soc2Data?.overdue_tests || 0}
                      </p>
                    </div>
                  </div>
                </Card>
                <Card className="p-6">
                  <div className="flex items-center">
                    <div className="p-3 rounded-full bg-red-100 text-red-600">
                      <AlertTriangle className="h-6 w-6" />
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-600">Open Incidents</p>
                      <p className="text-2xl font-bold text-red-600">
                        {soc2Data?.open_incidents || 0}
                      </p>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Risk Distribution */}
              {soc2Data?.risk_distribution && (
                <Card className="p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Risk Distribution</h3>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {Object.entries(soc2Data.risk_distribution).map(([level, count]) => (
                      <div key={level} className="text-center">
                        <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold ${
                          level === 'critical' ? 'bg-red-100 text-red-600' :
                          level === 'high' ? 'bg-orange-100 text-orange-600' :
                          level === 'medium' ? 'bg-yellow-100 text-yellow-600' :
                          'bg-green-100 text-green-600'
                        }`}>
                          {count}
                        </div>
                        <p className="mt-2 text-sm font-medium text-gray-900 capitalize">{level}</p>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Actions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Automated Testing</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Run automated tests for all SOC2 controls to verify compliance status and identify any issues.
                  </p>
                  <div className="flex space-x-3">
                    <Button
                      onClick={() => runSOC2Tests()}
                      disabled={soc2Loading}
                      className="flex-1"
                    >
                      {soc2Loading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Running Tests...
                        </>
                      ) : (
                        <>
                          <Zap className="h-4 w-4 mr-2" />
                          Run All Tests
                        </>
                      )}
                    </Button>
                  </div>
                  {testResults && (
                    <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-700">
                        Last test: {testResults.tested} controls tested, 
                        <span className="text-green-600 font-medium"> {testResults.passed} passed</span>, 
                        <span className="text-red-600 font-medium"> {testResults.failed} failed</span>
                      </p>
                    </div>
                  )}
                </Card>

                <Card className="p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Compliance Report</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Generate a comprehensive SOC2 compliance report including all controls, audit results, and evidence.
                  </p>
                  <Button
                    onClick={generateSOC2Report}
                    disabled={soc2Loading}
                    variant="outline"
                    className="w-full"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Generate Report
                  </Button>
                </Card>
              </div>

              {/* Assessment Schedule */}
              <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Assessment Schedule</h3>
                  <Badge variant="secondary">
                    Next Assessment: {soc2Data?.next_assessment_due ? 
                      new Date(soc2Data.next_assessment_due).toLocaleDateString() : 
                      'Not scheduled'
                    }
                  </Badge>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">Last Assessment</p>
                      <p className="text-sm text-gray-600">
                        {soc2Data?.last_assessment_date ? 
                          new Date(soc2Data.last_assessment_date).toLocaleDateString() : 
                          'No previous assessment'
                        }
                      </p>
                    </div>
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  </div>
                  <div className="flex items-center justify-between p-3 border border-blue-200 bg-blue-50 rounded-lg">
                    <div>
                      <p className="font-medium text-blue-900">Continuous Monitoring</p>
                      <p className="text-sm text-blue-600">Real-time compliance tracking active</p>
                    </div>
                    <Activity className="h-5 w-5 text-blue-500" />
                  </div>
                </div>
              </Card>

              {/* Evidence Management Section */}
              <div className="mt-8">
                <EvidenceManager token={enterprise.user?.token || ''} />
              </div>
            </>
          )}
        </div>
      )}

      {/* Real-Time Monitoring Tab */}
      {activeTab === 'monitoring' && (
        <RealTimeMonitoringDashboard 
          token={enterprise.user?.token || ''} 
          companyDomain={enterprise.user?.organization || 'default.com'} 
        />
      )}

      {/* Data Export Tab */}
      {activeTab === 'export' && (
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">
              Request Data Export
            </h3>
            <form onSubmit={handleSubmitExport(requestDataExport)} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Request Type *
                </label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <label className="flex items-center p-4 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      value="gdpr"
                      {...registerExport('type')}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                    />
                    <div className="ml-3">
                      <p className="font-medium text-gray-900">GDPR Request</p>
                      <p className="text-sm text-gray-500">Right to data portability</p>
                    </div>
                  </label>
                  <label className="flex items-center p-4 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      value="ccpa"
                      {...registerExport('type')}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                    />
                    <div className="ml-3">
                      <p className="font-medium text-gray-900">CCPA Request</p>
                      <p className="text-sm text-gray-500">Right to know</p>
                    </div>
                  </label>
                  <label className="flex items-center p-4 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      value="general"
                      {...registerExport('type')}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                    />
                    <div className="ml-3">
                      <p className="font-medium text-gray-900">General Export</p>
                      <p className="text-sm text-gray-500">Standard data export</p>
                    </div>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Data to Include
                </label>
                <div className="space-y-3">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      {...registerExport('includeDocuments')}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="ml-2 text-sm text-gray-700">Documents and metadata</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      {...registerExport('includeAnalyses')}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="ml-2 text-sm text-gray-700">Analysis results and findings</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      {...registerExport('includeAuditLogs')}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="ml-2 text-sm text-gray-700">Audit logs and activity history</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Export Format *
                </label>
                <select
                  {...registerExport('format')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="json">JSON (Machine Readable)</option>
                  <option value="csv">CSV (Spreadsheet)</option>
                  <option value="pdf">PDF (Human Readable)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reason for Request *
                </label>
                <textarea
                  {...registerExport('reason')}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Please provide a reason for this data export request..."
                />
                {exportErrors.reason && (
                  <p className="mt-1 text-sm text-red-600">{exportErrors.reason.message}</p>
                )}
              </div>

              <div className="flex justify-end space-x-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => resetExport()}
                >
                  Reset
                </Button>
                <Button
                  type="submit"
                  disabled={isLoading}
                >
                  {isLoading ? 'Submitting...' : 'Submit Request'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Data Deletion Tab */}
      {activeTab === 'deletion' && (
        <div className="space-y-6">
          <Card className="p-6 border-red-200">
            <div className="flex items-center space-x-3 mb-6">
              <AlertTriangle className="h-6 w-6 text-red-500" />
              <h3 className="text-lg font-semibold text-red-800">
                Request Data Deletion
              </h3>
            </div>
            
            <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
              <p className="text-sm text-red-700">
                <strong>Warning:</strong> This action cannot be undone. Once your data is deleted, 
                it cannot be recovered. Please ensure you have exported any data you may need before proceeding.
              </p>
            </div>

            <form onSubmit={handleSubmitDeletion(requestDataDeletion)} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Data to Delete
                </label>
                <div className="space-y-3">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      {...registerDeletion('deletionScope.userData')}
                      className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
                    />
                    <span className="ml-2 text-sm text-gray-700">Personal information and profile data</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      {...registerDeletion('deletionScope.documents')}
                      className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
                    />
                    <span className="ml-2 text-sm text-gray-700">Uploaded documents and metadata</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      {...registerDeletion('deletionScope.analyses')}
                      className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
                    />
                    <span className="ml-2 text-gray-700">Analysis results and findings</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      {...registerDeletion('deletionScope.auditLogs')}
                      className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
                    />
                    <span className="ml-2 text-sm text-gray-700">Audit logs (may be retained for legal compliance)</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reason for Deletion *
                </label>
                <textarea
                  {...registerDeletion('reason')}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  placeholder="Please provide a reason for this data deletion request..."
                />
                {deletionErrors.reason && (
                  <p className="mt-1 text-sm text-red-600">{deletionErrors.reason.message}</p>
                )}
              </div>

              <div className="flex justify-end space-x-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => resetDeletion()}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={isLoading}
                >
                  {isLoading ? 'Submitting...' : 'Submit Deletion Request'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Audit Trail Tab */}
      {activeTab === 'audit' && (
        <div className="space-y-6">
          {/* Filters */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Audit Log Filters
            </h3>
            <form onSubmit={handleSubmitFilters(filterAuditLogs)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Start Date
                  </label>
                  <Input
                    type="date"
                    {...registerFilters('startDate', { valueAsDate: true })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    End Date
                  </label>
                  <Input
                    type="date"
                    {...registerFilters('endDate', { valueAsDate: true })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Action
                  </label>
                  <Input
                    {...registerFilters('action')}
                    placeholder="e.g., login, document.upload"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Severity
                  </label>
                  <select
                    {...registerFilters('severity')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">All Severities</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-between">
                <div className="flex space-x-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => exportAuditLogs('csv')}
                    disabled={isLoading}
                  >
                    Export CSV
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => exportAuditLogs('json')}
                    disabled={isLoading}
                  >
                    Export JSON
                  </Button>
                </div>
                <div className="flex space-x-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => resetFilters()}
                  >
                    Clear Filters
                  </Button>
                  <Button
                    type="submit"
                    disabled={isLoading}
                  >
                    <Search className="h-4 w-4 mr-2" />
                    Search
                  </Button>
                </div>
              </div>
            </form>
          </Card>

          {/* Audit Logs */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Audit Logs
            </h3>
            <div className="space-y-4">
              {enterprise.auditLogs.map((log) => (
                <div key={log.id} className="flex items-start space-x-4 p-4 bg-gray-50 rounded-lg">
                  <div className="flex-shrink-0">
                    <div className="p-2 bg-white rounded-lg border">
                      {getActionIcon(log.action)}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900">
                        {log.action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </p>
                      <div className="flex items-center space-x-2">
                        <Badge
                          className={getSeverityColor(log.severity)}
                        >
                          {log.severity}
                        </Badge>
                        <span className="text-xs text-gray-500">
                          {new Date(log.timestamp).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      Resource: {log.resource}
                      {log.resourceId && ` (${log.resourceId})`}
                    </p>
                    <div className="flex items-center text-xs text-gray-500 mt-2">
                      <span>{log.ipAddress}</span>
                      <span className="mx-2">•</span>
                      <span>{log.userAgent?.split(' ')[0] || 'Unknown Browser'}</span>
                      {log.userId && (
                        <>
                          <span className="mx-2">•</span>
                          <span>User: {log.userId}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {enterprise.auditLogs.length === 0 && (
                <div className="text-center py-12">
                  <History className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No audit logs found</p>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Verification Modal */}
      {selectedRequest && 'verification' in selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Verify Data Deletion
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Enter the verification code sent to your email to confirm the data deletion request.
            </p>
            <div className="space-y-4">
              <Input
                placeholder="Verification code"
                onChange={(e) => setFilterValue('verificationCode', e.target.value)}
              />
              <div className="flex space-x-3">
                <Button
                  variant="outline"
                  onClick={() => setSelectedRequest(null)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    const code = (document.querySelector('input[placeholder="Verification code"]') as HTMLInputElement)?.value
                    if (code && selectedRequest) {
                      verifyDeletion(selectedRequest.id, code)
                      setSelectedRequest(null)
                    }
                  }}
                  disabled={isLoading}
                  className="flex-1"
                >
                  Verify
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}