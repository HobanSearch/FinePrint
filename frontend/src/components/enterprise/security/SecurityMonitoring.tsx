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
  SecurityEvent, 
  SecurityAlert, 
  SecurityEventType, 
  AlertChannel 
} from '../../../types/enterprise'
import { 
  Shield, 
  AlertTriangle, 
  Activity, 
  TrendingUp, 
  Eye, 
  Bell, 
  Settings, 
  Filter, 
  Download, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Target, 
  Lock, 
  Unlock, 
  Globe, 
  Server, 
  Database, 
  Wifi, 
  Smartphone, 
  Monitor, 
  Users, 
  FileText, 
  Zap,
  BarChart3,
  PieChart,
  LineChart,
  Map,
  Calendar,
  Search,
  X,
  Plus,
  Trash2,
  Edit,
  Save
} from 'lucide-react'

const alertRuleSchema = z.object({
  name: z.string().min(1, 'Rule name is required'),
  description: z.string().optional(),
  eventTypes: z.array(z.nativeEnum(SecurityEventType)),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  threshold: z.number().min(1),
  timeWindow: z.number().min(1), // minutes
  channels: z.array(z.nativeEnum(AlertChannel)),
  recipients: z.array(z.string().email()),
  enabled: z.boolean()
})

type AlertRuleForm = z.infer<typeof alertRuleSchema>

interface SecurityMetrics {
  totalEvents: number
  criticalEvents: number
  resolvedEvents: number
  averageResponseTime: number
  topThreats: Array<{ type: string; count: number }>
  eventsByTime: Array<{ time: string; count: number }>
  eventsBySeverity: Array<{ severity: string; count: number }>
  eventsBySource: Array<{ source: string; count: number }>
  geographicData: Array<{ country: string; count: number }>
}

export const SecurityMonitoring: React.FC = () => {
  const { enterprise } = useStore()
  const [activeTab, setActiveTab] = useState<'overview' | 'events' | 'alerts' | 'rules' | 'analytics'>('overview')
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d' | '30d'>('24h')
  const [selectedEvent, setSelectedEvent] = useState<SecurityEvent | null>(null)
  const [eventFilters, setEventFilters] = useState({
    severity: '',
    type: '',
    status: '',
    search: ''
  })
  const [isLoading, setIsLoading] = useState(false)
  const [metrics, setMetrics] = useState<SecurityMetrics>({
    totalEvents: 1247,
    criticalEvents: 23,
    resolvedEvents: 1156,
    averageResponseTime: 14.5,
    topThreats: [
      { type: 'Brute Force Attack', count: 156 },
      { type: 'Suspicious Login', count: 89 },
      { type: 'Data Exfiltration', count: 45 },
      { type: 'Privilege Escalation', count: 23 },
      { type: 'Malware Detected', count: 12 }
    ],
    eventsByTime: Array.from({ length: 24 }, (_, i) => ({
      time: `${i}:00`,
      count: Math.floor(Math.random() * 50) + 10
    })),
    eventsBySeverity: [
      { severity: 'Critical', count: 23 },
      { severity: 'High', count: 67 },
      { severity: 'Medium', count: 234 },
      { severity: 'Low', count: 923 }
    ],
    eventsBySource: [
      { source: 'Web Application', count: 456 },
      { source: 'API Gateway', count: 234 },
      { source: 'Mobile App', count: 178 },
      { source: 'Admin Panel', count: 123 },
      { source: 'Database', count: 89 }
    ],
    geographicData: [
      { country: 'United States', count: 567 },
      { country: 'China', count: 234 },
      { country: 'Russia', count: 123 },
      { country: 'Germany', count: 89 },
      { country: 'Brazil', count: 67 }
    ]
  })

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    setValue,
    watch,
    reset
  } = useForm<AlertRuleForm>({
    resolver: zodResolver(alertRuleSchema),
    defaultValues: {
      severity: 'high',
      threshold: 5,
      timeWindow: 60,
      channels: [AlertChannel.EMAIL],
      recipients: [],
      enabled: true
    }
  })

  useEffect(() => {
    enterprise.fetchSecurityEvents()
    updateMetrics()
  }, [timeRange])

  const updateMetrics = () => {
    // Simulate real-time metrics updates
    setMetrics(prev => ({
      ...prev,
      totalEvents: prev.totalEvents + Math.floor(Math.random() * 10),
      criticalEvents: Math.max(0, prev.criticalEvents + Math.floor(Math.random() * 3 - 1))
    }))
  }

  const acknowledgeEvent = async (eventId: string) => {
    setIsLoading(true)
    try {
      await enterprise.acknowledgeSecurityEvent(eventId)
    } catch (error) {
      console.error('Failed to acknowledge event:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const resolveEvent = async (eventId: string, resolution: string) => {
    setIsLoading(true)
    try {
      await enterprise.resolveSecurityEvent(eventId, resolution)
    } catch (error) {
      console.error('Failed to resolve event:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const createAlertRule = async (data: AlertRuleForm) => {
    setIsLoading(true)
    try {
      // This would typically call an API to create the alert rule
      console.log('Creating alert rule:', data)
      reset()
    } catch (error) {
      console.error('Failed to create alert rule:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const getEventIcon = (type: SecurityEventType) => {
    switch (type) {
      case SecurityEventType.SUSPICIOUS_LOGIN:
        return <Users className="h-4 w-4" />
      case SecurityEventType.BRUTE_FORCE_ATTACK:
        return <Target className="h-4 w-4" />
      case SecurityEventType.DATA_EXFILTRATION:
        return <Database className="h-4 w-4" />
      case SecurityEventType.PRIVILEGE_ESCALATION:
        return <TrendingUp className="h-4 w-4" />
      case SecurityEventType.MALWARE_DETECTED:
        return <Shield className="h-4 w-4" />
      case SecurityEventType.SYSTEM_INTRUSION:
        return <Server className="h-4 w-4" />
      default:
        return <AlertTriangle className="h-4 w-4" />
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-600 bg-red-100 border-red-200'
      case 'high': return 'text-orange-600 bg-orange-100 border-orange-200'
      case 'medium': return 'text-yellow-600 bg-yellow-100 border-yellow-200'
      case 'low': return 'text-green-600 bg-green-100 border-green-200'
      default: return 'text-gray-600 bg-gray-100 border-gray-200'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'resolved': return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'investigating': return <Clock className="h-4 w-4 text-yellow-500" />
      case 'dismissed': return <XCircle className="h-4 w-4 text-gray-500" />
      default: return <AlertTriangle className="h-4 w-4 text-red-500" />
    }
  }

  const filteredEvents = enterprise.securityEvents.filter(event => {
    const matchesSeverity = !eventFilters.severity || event.severity === eventFilters.severity
    const matchesType = !eventFilters.type || event.type.includes(eventFilters.type)
    const matchesStatus = !eventFilters.status || event.status === eventFilters.status
    const matchesSearch = !eventFilters.search || 
      event.description.toLowerCase().includes(eventFilters.search.toLowerCase()) ||
      event.source.toLowerCase().includes(eventFilters.search.toLowerCase())
    
    return matchesSeverity && matchesType && matchesStatus && matchesSearch
  })

  if (enterprise.isLoading && enterprise.securityEvents.length === 0) {
    return <LoadingPage message="Loading security monitoring..." />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Shield className="h-6 w-6 text-blue-500" />
          <h2 className="text-2xl font-bold text-gray-900">
            Security Monitoring
          </h2>
        </div>
        <div className="flex items-center space-x-3">
          <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
            {(['1h', '24h', '7d', '30d'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                  timeRange === range
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {range}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            onClick={() => {
              enterprise.fetchSecurityEvents()
              updateMetrics()
            }}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
        {[
          { id: 'overview', label: 'Overview', icon: BarChart3 },
          { id: 'events', label: 'Security Events', icon: AlertTriangle },
          { id: 'alerts', label: 'Active Alerts', icon: Bell },
          { id: 'rules', label: 'Alert Rules', icon: Settings },
          { id: 'analytics', label: 'Analytics', icon: LineChart }
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id as any)}
            className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Security Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Events</p>
                  <p className="text-2xl font-bold text-gray-900">{metrics.totalEvents.toLocaleString()}</p>
                </div>
                <div className="p-3 rounded-full bg-blue-100 text-blue-600">
                  <Activity className="h-6 w-6" />
                </div>
              </div>
              <div className="mt-4 flex items-center text-sm">
                <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
                <span className="text-green-600">+12% from last period</span>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Critical Events</p>
                  <p className="text-2xl font-bold text-red-600">{metrics.criticalEvents}</p>
                </div>
                <div className="p-3 rounded-full bg-red-100 text-red-600">
                  <AlertTriangle className="h-6 w-6" />
                </div>
              </div>
              <div className="mt-4 flex items-center text-sm">
                <span className="text-red-600">Requires immediate attention</span>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Resolved Events</p>
                  <p className="text-2xl font-bold text-green-600">{metrics.resolvedEvents.toLocaleString()}</p>
                </div>
                <div className="p-3 rounded-full bg-green-100 text-green-600">
                  <CheckCircle className="h-6 w-6" />
                </div>
              </div>
              <div className="mt-4 flex items-center text-sm">
                <span className="text-green-600">
                  {((metrics.resolvedEvents / metrics.totalEvents) * 100).toFixed(1)}% resolution rate
                </span>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Avg Response Time</p>
                  <p className="text-2xl font-bold text-gray-900">{metrics.averageResponseTime}m</p>
                </div>
                <div className="p-3 rounded-full bg-purple-100 text-purple-600">
                  <Clock className="h-6 w-6" />
                </div>
              </div>
              <div className="mt-4 flex items-center text-sm">
                <span className="text-purple-600">Within SLA target</span>
              </div>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Events Over Time</h3>
              <div className="h-64 flex items-end justify-between space-x-2">
                {metrics.eventsByTime.slice(-12).map((item, index) => (
                  <div key={index} className="flex-1 flex flex-col items-center">
                    <div
                      className="w-full bg-blue-500 rounded-t"
                      style={{ height: `${(item.count / 50) * 100}%` }}
                    />
                    <span className="text-xs text-gray-500 mt-2">{item.time}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Events by Severity</h3>
              <div className="space-y-3">
                {metrics.eventsBySeverity.map((item) => (
                  <div key={item.severity} className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`w-3 h-3 rounded-full ${
                        item.severity === 'Critical' ? 'bg-red-500' :
                        item.severity === 'High' ? 'bg-orange-500' :
                        item.severity === 'Medium' ? 'bg-yellow-500' : 'bg-green-500'
                      }`} />
                      <span className="text-sm font-medium text-gray-700">{item.severity}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-32 bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${
                            item.severity === 'Critical' ? 'bg-red-500' :
                            item.severity === 'High' ? 'bg-orange-500' :
                            item.severity === 'Medium' ? 'bg-yellow-500' : 'bg-green-500'
                          }`}
                          style={{ width: `${(item.count / metrics.totalEvents) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-gray-900">{item.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Top Threats and Sources */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Threats</h3>
              <div className="space-y-3">
                {metrics.topThreats.map((threat, index) => (
                  <div key={threat.type} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="flex items-center justify-center w-6 h-6 bg-red-100 text-red-600 rounded-full text-xs font-bold">
                        {index + 1}
                      </div>
                      <span className="text-sm font-medium text-gray-900">{threat.type}</span>
                    </div>
                    <Badge variant="destructive">{threat.count}</Badge>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Events by Source</h3>
              <div className="space-y-3">
                {metrics.eventsBySource.map((source) => (
                  <div key={source.source} className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">{source.source}</span>
                    <div className="flex items-center space-x-2">
                      <div className="w-24 bg-gray-200 rounded-full h-2">
                        <div
                          className="h-2 bg-blue-500 rounded-full"
                          style={{ width: `${(source.count / Math.max(...metrics.eventsBySource.map(s => s.count))) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-gray-900 w-8 text-right">{source.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Security Events Tab */}
      {activeTab === 'events' && (
        <div className="space-y-6">
          {/* Filters */}
          <Card className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
              <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4">
                <div className="flex items-center space-x-2">
                  <Search className="h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search events..."
                    value={eventFilters.search}
                    onChange={(e) => setEventFilters(prev => ({ ...prev, search: e.target.value }))}
                    className="w-48"
                  />
                </div>
                <select
                  value={eventFilters.severity}
                  onChange={(e) => setEventFilters(prev => ({ ...prev, severity: e.target.value }))}
                  className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">All Severities</option>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
                <select
                  value={eventFilters.status}
                  onChange={(e) => setEventFilters(prev => ({ ...prev, status: e.target.value }))}
                  className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">All Statuses</option>
                  <option value="new">New</option>
                  <option value="investigating">Investigating</option>
                  <option value="resolved">Resolved</option>
                  <option value="dismissed">Dismissed</option>
                </select>
              </div>
              <Button
                variant="outline"
                onClick={() => setEventFilters({ severity: '', type: '', status: '', search: '' })}
              >
                Clear Filters
              </Button>
            </div>
          </Card>

          {/* Events List */}
          <div className="space-y-4">
            {filteredEvents.map((event) => (
              <Card key={event.id} className={`p-6 border-l-4 ${
                event.severity === 'critical' ? 'border-red-500' :
                event.severity === 'high' ? 'border-orange-500' :
                event.severity === 'medium' ? 'border-yellow-500' : 'border-green-500'
              }`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-4">
                    <div className={`p-2 rounded-lg ${getSeverityColor(event.severity)}`}>
                      {getEventIcon(event.type)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">{event.description}</h3>
                        <Badge className={getSeverityColor(event.severity)}>
                          {event.severity}
                        </Badge>
                        <div className="flex items-center space-x-1">
                          {getStatusIcon(event.status)}
                          <span className="text-sm text-gray-600 capitalize">{event.status}</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm text-gray-600">
                        <div className="flex items-center space-x-2">
                          <Globe className="h-4 w-4" />
                          <span>{event.source}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Wifi className="h-4 w-4" />
                          <span>{event.ipAddress}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Clock className="h-4 w-4" />
                          <span>{new Date(event.detectedAt).toLocaleString()}</span>
                        </div>
                        {event.userId && (
                          <div className="flex items-center space-x-2">
                            <Users className="h-4 w-4" />
                            <span>User: {event.userId}</span>
                          </div>
                        )}
                      </div>
                      {Object.keys(event.details).length > 0 && (
                        <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                          <p className="text-sm font-medium text-gray-700 mb-2">Event Details:</p>
                          <div className="text-sm text-gray-600 space-y-1">
                            {Object.entries(event.details).map(([key, value]) => (
                              <div key={key} className="flex items-center space-x-2">
                                <span className="font-medium">{key}:</span>
                                <span>{String(value)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedEvent(event)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    {event.status === 'new' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => acknowledgeEvent(event.id)}
                        disabled={isLoading}
                      >
                        Acknowledge
                      </Button>
                    )}
                    {event.status === 'investigating' && (
                      <Button
                        size="sm"
                        onClick={() => {
                          const resolution = prompt('Enter resolution details:')
                          if (resolution) resolveEvent(event.id, resolution)
                        }}
                        disabled={isLoading}
                      >
                        Resolve
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}

            {filteredEvents.length === 0 && (
              <div className="text-center py-12">
                <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">
                  {enterprise.securityEvents.length === 0 ? 'No security events found' : 'No events match the current filters'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Alert Rules Tab */}
      {activeTab === 'rules' && (
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Create Alert Rule</h3>
            
            <form onSubmit={handleSubmit(createAlertRule)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Rule Name *
                  </label>
                  <Input
                    {...register('name')}
                    placeholder="High Severity Events Alert"
                    error={errors.name?.message}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Minimum Severity
                  </label>
                  <select
                    {...register('severity')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  {...register('description')}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Alert when multiple high severity events occur within a short time window"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Threshold (events)
                  </label>
                  <Input
                    type="number"
                    min="1"
                    {...register('threshold', { valueAsNumber: true })}
                    error={errors.threshold?.message}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Time Window (minutes)
                  </label>
                  <Input
                    type="number"
                    min="1"
                    {...register('timeWindow', { valueAsNumber: true })}
                    error={errors.timeWindow?.message}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Alert Channels
                </label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.values(AlertChannel).map(channel => (
                    <label key={channel} className="flex items-center">
                      <input
                        type="checkbox"
                        value={channel}
                        {...register('channels')}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <span className="ml-2 text-sm text-gray-700 capitalize">{channel.replace('_', ' ')}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Recipients (one email per line)
                </label>
                <textarea
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="admin@company.com&#10;security@company.com"
                  onChange={(e) => {
                    const emails = e.target.value.split('\n').filter(email => email.trim())
                    setValue('recipients', emails)
                  }}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    {...register('enabled')}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label className="ml-2 text-sm text-gray-700">
                    Enable this alert rule
                  </label>
                </div>
                <div className="flex space-x-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => reset()}
                  >
                    Reset
                  </Button>
                  <Button
                    type="submit"
                    disabled={isLoading}
                  >
                    {isLoading ? 'Creating...' : 'Create Rule'}
                  </Button>
                </div>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Event Details Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="p-6 max-w-4xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Security Event Details</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedEvent(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold text-gray-900 mb-3">Event Information</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Event ID:</span>
                      <span className="font-mono">{selectedEvent.id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Type:</span>
                      <span>{selectedEvent.type.replace(/_/g, ' ')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Severity:</span>
                      <Badge className={getSeverityColor(selectedEvent.severity)}>
                        {selectedEvent.severity}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Status:</span>
                      <div className="flex items-center space-x-1">
                        {getStatusIcon(selectedEvent.status)}
                        <span className="capitalize">{selectedEvent.status}</span>
                      </div>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Source:</span>
                      <span>{selectedEvent.source}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 mb-3">Timeline</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Detected:</span>
                      <span>{new Date(selectedEvent.detectedAt).toLocaleString()}</span>
                    </div>
                    {selectedEvent.assignedTo && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Assigned to:</span>
                        <span>{selectedEvent.assignedTo}</span>
                      </div>
                    )}
                    {selectedEvent.resolvedAt && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Resolved:</span>
                        <span>{new Date(selectedEvent.resolvedAt).toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Description</h4>
                <p className="text-gray-700 bg-gray-50 p-3 rounded-lg">
                  {selectedEvent.description}
                </p>
              </div>

              {selectedEvent.resolution && (
                <div>
                  <h4 className="font-semibold text-gray-900 mb-3">Resolution</h4>
                  <p className="text-gray-700 bg-green-50 p-3 rounded-lg border border-green-200">
                    {selectedEvent.resolution}
                  </p>
                </div>
              )}

              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Technical Details</h4>
                <div className="bg-gray-50 p-3 rounded-lg font-mono text-sm">
                  <pre>{JSON.stringify(selectedEvent.details, null, 2)}</pre>
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <Button
                variant="outline"
                onClick={() => setSelectedEvent(null)}
              >
                Close
              </Button>
              {selectedEvent.status === 'new' && (
                <Button
                  onClick={() => {
                    acknowledgeEvent(selectedEvent.id)
                    setSelectedEvent(null)
                  }}
                  disabled={isLoading}
                >
                  Acknowledge
                </Button>
              )}
              {selectedEvent.status === 'investigating' && (
                <Button
                  onClick={() => {
                    const resolution = prompt('Enter resolution details:')
                    if (resolution) {
                      resolveEvent(selectedEvent.id, resolution)
                      setSelectedEvent(null)
                    }
                  }}
                  disabled={isLoading}
                >
                  Resolve
                </Button>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}