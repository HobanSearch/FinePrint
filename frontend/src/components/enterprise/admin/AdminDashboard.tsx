import React, { useState, useEffect } from 'react'
import { Card } from '../../ui/Card'
import { Badge } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { LoadingPage } from '../../ui/LoadingPage'
import { useStore } from '../../../stores'
import { 
  UsageMetrics, 
  SecurityEvent, 
  OrganizationUser,
  GeneratedReport,
  OrganizationRole
} from '../../../types/enterprise'
import { 
  Users, 
  Shield, 
  Activity, 
  AlertTriangle, 
  TrendingUp, 
  Database, 
  Server, 
  Clock, 
  CheckCircle, 
  XCircle,
  Eye,
  Settings,
  RefreshCw,
  Download,
  Bell,
  BarChart3,
  PieChart,
  LineChart,
  Globe,
  Lock,
  Zap,
  FileText,
  Mail,
  Smartphone,
  Wifi,
  HardDrive,
  Cpu,
  MemoryStick,
  Network
} from 'lucide-react'

interface SystemHealth {
  cpu: number
  memory: number
  disk: number
  network: number
  uptime: number
  activeConnections: number
}

interface RealtimeMetrics {
  activeUsers: number
  requestsPerMinute: number
  errorRate: number
  averageResponseTime: number
  queueLength: number
}

export const AdminDashboard: React.FC = () => {
  const { enterprise, auth } = useStore()
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d' | '30d'>('24h')
  const [systemHealth, setSystemHealth] = useState<SystemHealth>({
    cpu: 45,
    memory: 62,
    disk: 33,
    network: 78,
    uptime: 99.9,
    activeConnections: 1247
  })
  const [realtimeMetrics, setRealtimeMetrics] = useState<RealtimeMetrics>({
    activeUsers: 156,
    requestsPerMinute: 342,
    errorRate: 0.2,
    averageResponseTime: 145,
    queueLength: 12
  })
  const [isRefreshing, setIsRefreshing] = useState(false)

  useEffect(() => {
    // Load initial data
    enterprise.fetchUsageMetrics()
    enterprise.fetchSecurityEvents()
    enterprise.fetchOrganizationUsers(enterprise.currentOrganization?.id || '')
    enterprise.fetchGeneratedReports()

    // Set up real-time updates
    const interval = setInterval(() => {
      updateRealtimeMetrics()
    }, 30000) // Update every 30 seconds

    return () => clearInterval(interval)
  }, [timeRange])

  const updateRealtimeMetrics = () => {
    // Simulate real-time data updates
    setRealtimeMetrics(prev => ({
      activeUsers: prev.activeUsers + Math.floor(Math.random() * 10 - 5),
      requestsPerMinute: prev.requestsPerMinute + Math.floor(Math.random() * 50 - 25),
      errorRate: Math.max(0, prev.errorRate + (Math.random() - 0.5) * 0.1),
      averageResponseTime: prev.averageResponseTime + Math.floor(Math.random() * 20 - 10),
      queueLength: Math.max(0, prev.queueLength + Math.floor(Math.random() * 6 - 3))
    }))

    setSystemHealth(prev => ({
      ...prev,
      cpu: Math.max(0, Math.min(100, prev.cpu + Math.floor(Math.random() * 10 - 5))),
      memory: Math.max(0, Math.min(100, prev.memory + Math.floor(Math.random() * 8 - 4))),
      network: Math.max(0, Math.min(100, prev.network + Math.floor(Math.random() * 15 - 7)))
    }))
  }

  const refreshAllData = async () => {
    setIsRefreshing(true)
    try {
      await Promise.all([
        enterprise.fetchUsageMetrics(),
        enterprise.fetchSecurityEvents(),
        enterprise.fetchOrganizationUsers(enterprise.currentOrganization?.id || ''),
        enterprise.fetchGeneratedReports()
      ])
      updateRealtimeMetrics()
    } catch (error) {
      console.error('Failed to refresh data:', error)
    } finally {
      setIsRefreshing(false)
    }
  }

  const getHealthColor = (value: number) => {
    if (value < 50) return 'text-green-600 bg-green-100'
    if (value < 80) return 'text-yellow-600 bg-yellow-100'
    return 'text-red-600 bg-red-100'
  }

  const getHealthStatus = (value: number) => {
    if (value < 50) return 'Good'
    if (value < 80) return 'Warning'
    return 'Critical'
  }

  const formatUptime = (uptime: number) => {
    const days = Math.floor(uptime)
    const hours = Math.floor((uptime - days) * 24)
    return `${days}d ${hours}h`
  }

  const criticalSecurityEvents = enterprise.securityEvents.filter(
    event => event.severity === 'critical' && event.status === 'new'
  )

  const highPriorityEvents = enterprise.securityEvents.filter(
    event => (event.severity === 'high' || event.severity === 'critical') && event.status === 'new'
  )

  if (enterprise.isLoading && !enterprise.usageMetrics) {
    return <LoadingPage message="Loading admin dashboard..." />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Shield className="h-6 w-6 text-blue-500" />
          <h2 className="text-2xl font-bold text-gray-900">
            Enterprise Dashboard
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
            onClick={refreshAllData}
            disabled={isRefreshing}
            className="flex items-center space-x-2"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Critical Alerts */}
      {criticalSecurityEvents.length > 0 && (
        <Card className="p-4 border-red-200 bg-red-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <div>
                <p className="font-medium text-red-800">
                  {criticalSecurityEvents.length} Critical Security Alert{criticalSecurityEvents.length > 1 ? 's' : ''}
                </p>
                <p className="text-sm text-red-600">
                  Immediate attention required
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="text-red-700 border-red-300 hover:bg-red-100"
              onClick={() => {/* Navigate to security events */}}
            >
              View Details
            </Button>
          </div>
        </Card>
      )}

      {/* Real-time Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active Users</p>
              <p className="text-2xl font-bold text-gray-900">{realtimeMetrics.activeUsers}</p>
            </div>
            <div className="p-3 rounded-full bg-blue-100 text-blue-600">
              <Users className="h-6 w-6" />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm">
            <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
            <span className="text-green-600">+12% from yesterday</span>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Requests/Min</p>
              <p className="text-2xl font-bold text-gray-900">{realtimeMetrics.requestsPerMinute}</p>
            </div>
            <div className="p-3 rounded-full bg-green-100 text-green-600">
              <Activity className="h-6 w-6" />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm">
            <span className="text-gray-500">Avg response: {realtimeMetrics.averageResponseTime}ms</span>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Error Rate</p>
              <p className="text-2xl font-bold text-gray-900">{realtimeMetrics.errorRate.toFixed(2)}%</p>
            </div>
            <div className="p-3 rounded-full bg-yellow-100 text-yellow-600">
              <AlertTriangle className="h-6 w-6" />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm">
            <span className={`${realtimeMetrics.errorRate < 1 ? 'text-green-600' : 'text-red-600'}`}>
              {realtimeMetrics.errorRate < 1 ? 'Within normal range' : 'Above threshold'}
            </span>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Queue Length</p>
              <p className="text-2xl font-bold text-gray-900">{realtimeMetrics.queueLength}</p>
            </div>
            <div className="p-3 rounded-full bg-purple-100 text-purple-600">
              <Clock className="h-6 w-6" />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm">
            <span className={`${realtimeMetrics.queueLength < 20 ? 'text-green-600' : 'text-yellow-600'}`}>
              {realtimeMetrics.queueLength < 20 ? 'Processing normally' : 'Higher than usual'}
            </span>
          </div>
        </Card>
      </div>

      {/* System Health */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">System Health</h3>
          <Badge variant="success" className="flex items-center space-x-1">
            <CheckCircle className="h-3 w-3" />
            <span>All Systems Operational</span>
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="text-center">
            <div className="relative w-16 h-16 mx-auto mb-2">
              <div className="absolute inset-0 rounded-full bg-gray-200"></div>
              <div 
                className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-500 to-blue-600"
                style={{
                  background: `conic-gradient(from 0deg, #3B82F6 ${systemHealth.cpu * 3.6}deg, #E5E7EB 0deg)`
                }}
              ></div>
              <div className="absolute inset-2 rounded-full bg-white flex items-center justify-center">
                <Cpu className="h-6 w-6 text-gray-600" />
              </div>
            </div>
            <p className="text-sm font-medium text-gray-900">CPU Usage</p>
            <p className="text-lg font-bold text-gray-700">{systemHealth.cpu}%</p>
            <Badge className={getHealthColor(systemHealth.cpu)}>
              {getHealthStatus(systemHealth.cpu)}
            </Badge>
          </div>

          <div className="text-center">
            <div className="relative w-16 h-16 mx-auto mb-2">
              <div className="absolute inset-0 rounded-full bg-gray-200"></div>
              <div 
                className="absolute inset-0 rounded-full"
                style={{
                  background: `conic-gradient(from 0deg, #10B981 ${systemHealth.memory * 3.6}deg, #E5E7EB 0deg)`
                }}
              ></div>
              <div className="absolute inset-2 rounded-full bg-white flex items-center justify-center">
                <MemoryStick className="h-6 w-6 text-gray-600" />
              </div>
            </div>
            <p className="text-sm font-medium text-gray-900">Memory Usage</p>
            <p className="text-lg font-bold text-gray-700">{systemHealth.memory}%</p>
            <Badge className={getHealthColor(systemHealth.memory)}>
              {getHealthStatus(systemHealth.memory)}
            </Badge>
          </div>

          <div className="text-center">
            <div className="relative w-16 h-16 mx-auto mb-2">
              <div className="absolute inset-0 rounded-full bg-gray-200"></div>
              <div 
                className="absolute inset-0 rounded-full"
                style={{
                  background: `conic-gradient(from 0deg, #F59E0B ${systemHealth.disk * 3.6}deg, #E5E7EB 0deg)`
                }}
              ></div>
              <div className="absolute inset-2 rounded-full bg-white flex items-center justify-center">
                <HardDrive className="h-6 w-6 text-gray-600" />
              </div>
            </div>
            <p className="text-sm font-medium text-gray-900">Disk Usage</p>
            <p className="text-lg font-bold text-gray-700">{systemHealth.disk}%</p>
            <Badge className={getHealthColor(systemHealth.disk)}>
              {getHealthStatus(systemHealth.disk)}
            </Badge>
          </div>

          <div className="text-center">
            <div className="relative w-16 h-16 mx-auto mb-2">
              <div className="absolute inset-0 rounded-full bg-gray-200"></div>
              <div 
                className="absolute inset-0 rounded-full"
                style={{
                  background: `conic-gradient(from 0deg, #8B5CF6 ${systemHealth.network * 3.6}deg, #E5E7EB 0deg)`
                }}
              ></div>
              <div className="absolute inset-2 rounded-full bg-white flex items-center justify-center">
                <Network className="h-6 w-6 text-gray-600" />
              </div>
            </div>
            <p className="text-sm font-medium text-gray-900">Network I/O</p>
            <p className="text-lg font-bold text-gray-700">{systemHealth.network}%</p>
            <Badge className={getHealthColor(systemHealth.network)}>
              {getHealthStatus(systemHealth.network)}
            </Badge>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-sm text-gray-600">System Uptime</p>
            <p className="text-lg font-semibold text-green-600">{systemHealth.uptime}%</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Active Connections</p>
            <p className="text-lg font-semibold text-gray-900">{systemHealth.activeConnections.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Load Average</p>
            <p className="text-lg font-semibold text-gray-900">2.45</p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Usage Overview */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Usage Overview</h3>
          {enterprise.usageMetrics ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Users className="h-5 w-5 text-blue-500" />
                  <div>
                    <p className="font-medium text-gray-900">Total Users</p>
                    <p className="text-sm text-gray-500">
                      {enterprise.usageMetrics.users.active} active of {enterprise.usageMetrics.users.total}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-gray-900">{enterprise.usageMetrics.users.total}</p>
                  <p className="text-sm text-green-600">+{enterprise.usageMetrics.users.new} new</p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <FileText className="h-5 w-5 text-green-500" />
                  <div>
                    <p className="font-medium text-gray-900">Documents</p>
                    <p className="text-sm text-gray-500">
                      {enterprise.usageMetrics.documents.analyzed} analyzed
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-gray-900">{enterprise.usageMetrics.documents.uploaded}</p>
                  <p className="text-sm text-gray-500">
                    {(enterprise.usageMetrics.documents.totalSize / 1024 / 1024).toFixed(1)} MB
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <BarChart3 className="h-5 w-5 text-purple-500" />
                  <div>
                    <p className="font-medium text-gray-900">Analyses</p>
                    <p className="text-sm text-gray-500">
                      {enterprise.usageMetrics.analyses.successful} successful
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-gray-900">{enterprise.usageMetrics.analyses.total}</p>
                  <p className="text-sm text-gray-500">
                    {enterprise.usageMetrics.analyses.averageProcessingTime}ms avg
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Database className="h-5 w-5 text-orange-500" />
                  <div>
                    <p className="font-medium text-gray-900">Storage</p>
                    <p className="text-sm text-gray-500">
                      {enterprise.usageMetrics.storage.percentage}% used
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-gray-900">
                    {(enterprise.usageMetrics.storage.used / 1024 / 1024 / 1024).toFixed(1)} GB
                  </p>
                  <p className="text-sm text-gray-500">
                    of {(enterprise.usageMetrics.storage.limit / 1024 / 1024 / 1024).toFixed(0)} GB
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">Loading usage metrics...</p>
            </div>
          )}
        </Card>

        {/* Security Events */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900">Recent Security Events</h3>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {/* Navigate to security events */}}
            >
              View All
            </Button>
          </div>

          <div className="space-y-4">
            {enterprise.securityEvents.slice(0, 5).map((event) => (
              <div key={event.id} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                <div className={`p-1 rounded ${
                  event.severity === 'critical' ? 'bg-red-100 text-red-600' :
                  event.severity === 'high' ? 'bg-orange-100 text-orange-600' :
                  event.severity === 'medium' ? 'bg-yellow-100 text-yellow-600' :
                  'bg-green-100 text-green-600'
                }`}>
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{event.description}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(event.detectedAt).toLocaleString()} • {event.source}
                  </p>
                </div>
                <Badge
                  variant={
                    event.status === 'resolved' ? 'success' :
                    event.status === 'investigating' ? 'secondary' : 'destructive'
                  }
                >
                  {event.status}
                </Badge>
              </div>
            ))}

            {enterprise.securityEvents.length === 0 && (
              <div className="text-center py-8">
                <Shield className="h-12 w-12 text-green-400 mx-auto mb-4" />
                <p className="text-green-600">No security events detected</p>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* User Activity & Reports */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent User Activity */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Recent User Activity</h3>
          <div className="space-y-4">
            {enterprise.organizationUsers.slice(0, 8).map((user) => (
              <div key={user.id} className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                    <User className="h-4 w-4 text-gray-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{user.user.displayName}</p>
                    <p className="text-xs text-gray-500">{user.user.email}</p>
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant="secondary">{user.role.replace(/_/g, ' ')}</Badge>
                  <p className="text-xs text-gray-500 mt-1">
                    {user.lastActiveAt ? 
                      `Active ${new Date(user.lastActiveAt).toLocaleDateString()}` : 
                      'Never logged in'
                    }
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Recent Reports */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Recent Reports</h3>
          <div className="space-y-4">
            {enterprise.generatedReports.slice(0, 6).map((report) => (
              <div key={report.id} className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{report.name}</p>
                    <p className="text-xs text-gray-500">
                      Generated {new Date(report.generatedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge
                    variant={
                      report.status === 'completed' ? 'success' :
                      report.status === 'failed' ? 'destructive' : 'secondary'
                    }
                  >
                    {report.status}
                  </Badge>
                  {report.status === 'completed' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => enterprise.downloadReport(report.id)}
                    >
                      <Download className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}

            {enterprise.generatedReports.length === 0 && (
              <div className="text-center py-8">
                <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No reports generated yet</p>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-6">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Button
            variant="outline"
            className="flex items-center justify-center space-x-2 py-4"
            onClick={() => {/* Navigate to user management */}}
          >
            <Users className="h-5 w-5" />
            <span>Manage Users</span>
          </Button>
          <Button
            variant="outline"
            className="flex items-center justify-center space-x-2 py-4"
            onClick={() => {/* Navigate to security settings */}}
          >
            <Shield className="h-5 w-5" />
            <span>Security Settings</span>
          </Button>
          <Button
            variant="outline"
            className="flex items-center justify-center space-x-2 py-4"
            onClick={() => {/* Navigate to reports */}}
          >
            <BarChart3 className="h-5 w-5" />
            <span>Generate Report</span>
          </Button>
          <Button
            variant="outline"
            className="flex items-center justify-center space-x-2 py-4"
            onClick={() => {/* Navigate to system settings */}}
          >
            <Settings className="h-5 w-5" />
            <span>System Settings</span>
          </Button>
        </div>
      </Card>
    </div>
  )
}