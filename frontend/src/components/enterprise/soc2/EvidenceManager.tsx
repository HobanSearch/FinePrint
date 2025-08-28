import React, { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '../../ui/Button'
import { Input } from '../../ui/Input'
import { Card } from '../../ui/Card'
import { Badge } from '../../ui/Badge'
import { 
  Upload, 
  FileText, 
  Calendar, 
  User, 
  Tag, 
  Download, 
  Edit3, 
  Trash2, 
  CheckCircle, 
  Clock, 
  AlertTriangle,
  Filter,
  Search,
  Plus,
  FolderOpen,
  Shield
} from 'lucide-react'

const evidenceUploadSchema = z.object({
  control_id: z.string().min(1, 'Control ID is required'),
  evidence_type: z.enum(['policy', 'procedure', 'screenshot', 'log_file', 'report', 'certificate', 'other']),
  evidence_name: z.string().min(1, 'Evidence name is required'),
  description: z.string().optional(),
  tags: z.string().optional(),
  file: z.any().optional()
})

const evidenceFilterSchema = z.object({
  control_id: z.string().optional(),
  evidence_type: z.string().optional(),
  search: z.string().optional()
})

type EvidenceUploadForm = z.infer<typeof evidenceUploadSchema>
type EvidenceFilterForm = z.infer<typeof evidenceFilterSchema>

interface Evidence {
  evidence_id: string
  control_id: string
  evidence_type: string
  evidence_name: string
  description: string
  file_path?: string
  collected_at: string
  collected_by: string
  retention_period: number
  tags: string[]
}

interface WorkflowStatus {
  control_id: string
  control_name: string
  evidence_requirements: string[]
  collected_evidence: Evidence[]
  missing_evidence: string[]
  workflow_status: 'not_started' | 'in_progress' | 'complete'
  completion_percentage: number
}

interface EvidenceManagerProps {
  token: string
}

export const EvidenceManager: React.FC<EvidenceManagerProps> = ({ token }) => {
  const [activeView, setActiveView] = useState<'overview' | 'upload' | 'manage'>('overview')
  const [evidence, setEvidence] = useState<Evidence[]>([])
  const [workflowStatuses, setWorkflowStatuses] = useState<WorkflowStatus[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedControl, setSelectedControl] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)

  const {
    register: registerUpload,
    handleSubmit: handleSubmitUpload,
    formState: { errors: uploadErrors },
    reset: resetUpload,
    setValue: setUploadValue
  } = useForm<EvidenceUploadForm>({
    resolver: zodResolver(evidenceUploadSchema)
  })

  const {
    register: registerFilter,
    handleSubmit: handleSubmitFilter,
    reset: resetFilter
  } = useForm<EvidenceFilterForm>({
    resolver: zodResolver(evidenceFilterSchema)
  })

  useEffect(() => {
    fetchEvidence()
    fetchWorkflowStatuses()
  }, [])

  const fetchEvidence = async (filters?: EvidenceFilterForm) => {
    setIsLoading(true)
    try {
      const queryParams = new URLSearchParams()
      if (filters?.control_id) queryParams.append('control_id', filters.control_id)
      if (filters?.evidence_type) queryParams.append('evidence_type', filters.evidence_type)
      
      const response = await fetch(`/api/soc2/evidence?${queryParams}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (response.ok) {
        const data = await response.json()
        setEvidence(data.data.evidence)
      }
    } catch (error) {
      console.error('Failed to fetch evidence:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchWorkflowStatuses = async () => {
    try {
      // Get all controls first
      const controlsResponse = await fetch('/api/soc2/controls', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (controlsResponse.ok) {
        const controlsData = await controlsResponse.json()
        const controls = controlsData.data
        
        // Fetch workflow status for each control
        const statuses = await Promise.all(
          controls.map(async (control: any) => {
            try {
              const response = await fetch(`/api/soc2/evidence/workflow/${control.control_id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
              })
              if (response.ok) {
                const data = await response.json()
                return data.data
              }
              return null
            } catch (error) {
              console.error(`Failed to fetch workflow for ${control.control_id}:`, error)
              return null
            }
          })
        )
        
        setWorkflowStatuses(statuses.filter(Boolean))
      }
    } catch (error) {
      console.error('Failed to fetch workflow statuses:', error)
    }
  }

  const uploadEvidence = async (data: EvidenceUploadForm) => {
    setIsLoading(true)
    try {
      const formData = new FormData()
      
      // Add form fields
      formData.append('control_id', data.control_id)
      formData.append('evidence_type', data.evidence_type)
      formData.append('evidence_name', data.evidence_name)
      if (data.description) formData.append('description', data.description)
      if (data.tags) formData.append('tags', data.tags)
      
      // Add file if present
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      if (fileInput?.files?.[0]) {
        formData.append('file', fileInput.files[0])
      }

      const response = await fetch('/api/soc2/evidence/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      })

      if (response.ok) {
        resetUpload()
        await fetchEvidence()
        await fetchWorkflowStatuses()
        setActiveView('overview')
      } else {
        const error = await response.json()
        console.error('Upload failed:', error)
      }
    } catch (error) {
      console.error('Failed to upload evidence:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const deleteEvidence = async (evidenceId: string) => {
    if (!confirm('Are you sure you want to delete this evidence? This action cannot be undone.')) {
      return
    }

    try {
      const response = await fetch(`/api/soc2/evidence/${evidenceId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (response.ok) {
        await fetchEvidence()
        await fetchWorkflowStatuses()
      } else {
        const error = await response.json()
        alert(error.error || 'Failed to delete evidence')
      }
    } catch (error) {
      console.error('Failed to delete evidence:', error)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'complete': return 'bg-green-100 text-green-800'
      case 'in_progress': return 'bg-yellow-100 text-yellow-800'
      case 'not_started': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'complete': return <CheckCircle className="h-4 w-4" />
      case 'in_progress': return <Clock className="h-4 w-4" />
      case 'not_started': return <AlertTriangle className="h-4 w-4" />
      default: return <Clock className="h-4 w-4" />
    }
  }

  const getEvidenceTypeIcon = (type: string) => {
    switch (type) {
      case 'policy': return <Shield className="h-4 w-4" />
      case 'procedure': return <FileText className="h-4 w-4" />
      case 'screenshot': return <Download className="h-4 w-4" />
      case 'log_file': return <FileText className="h-4 w-4" />
      case 'report': return <FileText className="h-4 w-4" />
      case 'certificate': return <Shield className="h-4 w-4" />
      default: return <FolderOpen className="h-4 w-4" />
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <FolderOpen className="h-6 w-6 text-blue-500" />
          <h3 className="text-xl font-bold text-gray-900">Evidence Management</h3>
        </div>
        <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setActiveView('overview')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeView === 'overview'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveView('upload')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeView === 'upload'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Upload
          </button>
          <button
            onClick={() => setActiveView('manage')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeView === 'manage'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Manage
          </button>
        </div>
      </div>

      {/* Overview Tab */}
      {activeView === 'overview' && (
        <div className="space-y-6">
          {/* Workflow Status Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="p-6">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-green-100 text-green-600">
                  <CheckCircle className="h-6 w-6" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Complete</p>
                  <p className="text-2xl font-bold text-green-600">
                    {workflowStatuses.filter(ws => ws.workflow_status === 'complete').length}
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
                  <p className="text-sm font-medium text-gray-600">In Progress</p>
                  <p className="text-2xl font-bold text-yellow-600">
                    {workflowStatuses.filter(ws => ws.workflow_status === 'in_progress').length}
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
                  <p className="text-sm font-medium text-gray-600">Not Started</p>
                  <p className="text-2xl font-bold text-red-600">
                    {workflowStatuses.filter(ws => ws.workflow_status === 'not_started').length}
                  </p>
                </div>
              </div>
            </Card>
          </div>

          {/* Controls Evidence Status */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h4 className="text-lg font-semibold text-gray-900">Evidence Collection Status</h4>
              <Button
                size="sm"
                onClick={() => setActiveView('upload')}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Evidence
              </Button>
            </div>
            
            <div className="space-y-4">
              {workflowStatuses.map((workflow) => (
                <div key={workflow.control_id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <Badge className={getStatusColor(workflow.workflow_status)}>
                        <div className="flex items-center space-x-1">
                          {getStatusIcon(workflow.workflow_status)}
                          <span className="capitalize">{workflow.workflow_status.replace('_', ' ')}</span>
                        </div>
                      </Badge>
                      <h5 className="font-medium text-gray-900">
                        {workflow.control_id}: {workflow.control_name}
                      </h5>
                    </div>
                    <div className="text-sm text-gray-500">
                      {workflow.completion_percentage}% complete
                    </div>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                    <div 
                      className={`h-2 rounded-full ${
                        workflow.completion_percentage === 100 ? 'bg-green-500' :
                        workflow.completion_percentage >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${workflow.completion_percentage}%` }}
                    ></div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="font-medium text-gray-700 mb-2">Required Evidence:</p>
                      <ul className="space-y-1">
                        {workflow.evidence_requirements.map((req, index) => (
                          <li key={index} className="text-gray-600">• {req}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="font-medium text-gray-700 mb-2">
                        Collected Evidence ({workflow.collected_evidence.length}):
                      </p>
                      <ul className="space-y-1">
                        {workflow.collected_evidence.slice(0, 3).map((evidence, index) => (
                          <li key={index} className="flex items-center space-x-2 text-gray-600">
                            {getEvidenceTypeIcon(evidence.evidence_type)}
                            <span>{evidence.evidence_name}</span>
                          </li>
                        ))}
                        {workflow.collected_evidence.length > 3 && (
                          <li className="text-gray-500 text-xs">
                            +{workflow.collected_evidence.length - 3} more
                          </li>
                        )}
                      </ul>
                    </div>
                  </div>

                  {workflow.missing_evidence.length > 0 && (
                    <div className="mt-3 p-2 bg-red-50 rounded border border-red-200">
                      <p className="text-sm font-medium text-red-800 mb-1">Missing Evidence:</p>
                      <p className="text-sm text-red-600">
                        {workflow.missing_evidence.join(', ')}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Upload Tab */}
      {activeView === 'upload' && (
        <Card className="p-6">
          <h4 className="text-lg font-semibold text-gray-900 mb-6">Upload Evidence</h4>
          <form onSubmit={handleSubmitUpload(uploadEvidence)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Control ID *
                </label>
                <select
                  {...registerUpload('control_id')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select a control...</option>
                  {workflowStatuses.map(ws => (
                    <option key={ws.control_id} value={ws.control_id}>
                      {ws.control_id}: {ws.control_name}
                    </option>
                  ))}
                </select>
                {uploadErrors.control_id && (
                  <p className="mt-1 text-sm text-red-600">{uploadErrors.control_id.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Evidence Type *
                </label>
                <select
                  {...registerUpload('evidence_type')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select type...</option>
                  <option value="policy">Policy</option>
                  <option value="procedure">Procedure</option>
                  <option value="screenshot">Screenshot</option>
                  <option value="log_file">Log File</option>
                  <option value="report">Report</option>
                  <option value="certificate">Certificate</option>
                  <option value="other">Other</option>
                </select>
                {uploadErrors.evidence_type && (
                  <p className="mt-1 text-sm text-red-600">{uploadErrors.evidence_type.message}</p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Evidence Name *
              </label>
              <Input
                {...registerUpload('evidence_name')}
                placeholder="Enter evidence name..."
              />
              {uploadErrors.evidence_name && (
                <p className="mt-1 text-sm text-red-600">{uploadErrors.evidence_name.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                {...registerUpload('description')}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Optional description..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tags
              </label>
              <Input
                {...registerUpload('tags')}
                placeholder="Enter tags separated by commas..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                File Upload
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <Upload className="h-8 w-8 text-gray-400 mx-auto mb-4" />
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.gif,.json,.csv,.zip"
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                <p className="text-sm text-gray-500 mt-2">
                  Supported formats: PDF, DOC, DOCX, TXT, PNG, JPG, GIF, JSON, CSV, ZIP
                </p>
              </div>
            </div>

            <div className="flex justify-end space-x-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => resetUpload()}
              >
                Reset
              </Button>
              <Button
                type="submit"
                disabled={isLoading}
              >
                {isLoading ? 'Uploading...' : 'Upload Evidence'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Manage Tab */}
      {activeView === 'manage' && (
        <div className="space-y-6">
          {/* Filters */}
          <Card className="p-6">
            <h4 className="text-lg font-semibold text-gray-900 mb-4">Filter Evidence</h4>
            <form onSubmit={handleSubmitFilter(fetchEvidence)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Control ID
                  </label>
                  <select
                    {...registerFilter('control_id')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">All controls</option>
                    {workflowStatuses.map(ws => (
                      <option key={ws.control_id} value={ws.control_id}>
                        {ws.control_id}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Evidence Type
                  </label>
                  <select
                    {...registerFilter('evidence_type')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">All types</option>
                    <option value="policy">Policy</option>
                    <option value="procedure">Procedure</option>
                    <option value="screenshot">Screenshot</option>
                    <option value="log_file">Log File</option>
                    <option value="report">Report</option>
                    <option value="certificate">Certificate</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Search
                  </label>
                  <Input
                    {...registerFilter('search')}
                    placeholder="Search evidence..."
                  />
                </div>
              </div>
              <div className="flex space-x-2">
                <Button type="submit" disabled={isLoading}>
                  <Search className="h-4 w-4 mr-2" />
                  Search
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    resetFilter()
                    fetchEvidence()
                  }}
                >
                  Clear
                </Button>
              </div>
            </form>
          </Card>

          {/* Evidence List */}
          <Card className="p-6">
            <h4 className="text-lg font-semibold text-gray-900 mb-4">
              Evidence Collection ({evidence.length})
            </h4>
            
            {isLoading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading evidence...</p>
              </div>
            ) : evidence.length === 0 ? (
              <div className="text-center py-12">
                <FolderOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No evidence found</p>
              </div>
            ) : (
              <div className="space-y-4">
                {evidence.map((item) => (
                  <div key={item.evidence_id} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          {getEvidenceTypeIcon(item.evidence_type)}
                          <h5 className="font-medium text-gray-900">{item.evidence_name}</h5>
                          <Badge variant="secondary">{item.control_id}</Badge>
                          <Badge variant="outline" className="capitalize">
                            {item.evidence_type.replace('_', ' ')}
                          </Badge>
                        </div>
                        
                        {item.description && (
                          <p className="text-sm text-gray-600 mb-2">{item.description}</p>
                        )}
                        
                        <div className="flex items-center space-x-4 text-xs text-gray-500">
                          <span className="flex items-center space-x-1">
                            <Calendar className="h-3 w-3" />
                            <span>{new Date(item.collected_at).toLocaleDateString()}</span>
                          </span>
                          <span className="flex items-center space-x-1">
                            <User className="h-3 w-3" />
                            <span>{item.collected_by}</span>
                          </span>
                          {item.tags.length > 0 && (
                            <span className="flex items-center space-x-1">
                              <Tag className="h-3 w-3" />
                              <span>{item.tags.join(', ')}</span>
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {/* TODO: Implement edit */}}
                        >
                          <Edit3 className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => deleteEvidence(item.evidence_id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}