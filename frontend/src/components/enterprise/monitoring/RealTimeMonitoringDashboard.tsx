import React, { useState, useEffect } from 'react'
import { Card } from '../../ui/Card'
import { Badge } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { 
  Shield, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  XCircle,
  Eye,
  EyeOff,
  Zap,
  Activity,
  Settings,
  Bell,
  BellOff,
  RefreshCw,
  Calendar,
  Users,
  BarChart3,
  LineChart,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Filter,
  Download
} from 'lucide-react'

interface ComplianceMetrics {
  overall_score: number
  score_trend_24h: number
  score_trend_7d: number
  score_trend_30d: number
  control_scores: Record<string, number>
  failed_controls: string[]
  overdue_evidence: number
  upcoming_deadlines: number
  critical_alerts: number
  high_alerts: number
  medium_alerts: number
  low_alerts: number
  last_updated: string
}

interface ComplianceAlert {
  id: string
  alert_type: 'score_decline' | 'control_failure' | 'evidence_overdue' | 'assessment_due' | 'critical_gap' | 'security_incident'
  severity: 'low' | 'medium' | 'high' | 'critical'
  title: string
  description: string
  company_domain: string
  control_id?: string
  regulation_name?: string
  threshold_breached?: number
  current_value?: number
  recommendations: string[]
  triggered_at: string
  acknowledged: boolean
  acknowledged_by?: string
  acknowledged_at?: string
  resolved: boolean
  resolved_at?: string
}

interface RealTimeMonitoringDashboardProps {
  token: string
  companyDomain: string
}

export const RealTimeMonitoringDashboard: React.FC<RealTimeMonitoringDashboardProps> = ({ 
  token, 
  companyDomain 
}) => {
  const [metrics, setMetrics] = useState<ComplianceMetrics | null>(null)
  const [alerts, setAlerts] = useState<ComplianceAlert[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [selectedSeverity, setSelectedSeverity] = useState<string>('')
  const [expandedAlert, setExpandedAlert] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  useEffect(() => {
    fetchMetrics()
    fetchAlerts()
  }, [token])

  useEffect(() => {
    let interval: NodeJS.Timeout
    if (autoRefresh) {
      interval = setInterval(() => {
        fetchMetrics()
        fetchAlerts()
        setLastRefresh(new Date())
      }, 30000) // Refresh every 30 seconds
    }
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [autoRefresh, token])

  const fetchMetrics = async () => {
    try {
      const response = await fetch('/api/monitoring/metrics', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (response.ok) {
        const data = await response.json()
        setMetrics(data.data)
      }
    } catch (error) {
      console.error('Failed to fetch metrics:', error)
    }
  }

  const fetchAlerts = async () => {
    try {
      const queryParams = new URLSearchParams()
      if (selectedSeverity) queryParams.append('severity', selectedSeverity)
      
      const response = await fetch(`/api/monitoring/alerts?${queryParams}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (response.ok) {
        const data = await response.json()
        setAlerts(data.data)
      }
    } catch (error) {
      console.error('Failed to fetch alerts:', error)
    }
  }

  const acknowledgeAlert = async (alertId: string) => {
    try {
      const response = await fetch(`/api/monitoring/alerts/${alertId}/acknowledge`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (response.ok) {
        await fetchAlerts()
      }
    } catch (error) {
      console.error('Failed to acknowledge alert:', error)
    }
  }

  const resolveAlert = async (alertId: string) => {
    try {
      const response = await fetch(`/api/monitoring/alerts/${alertId}/resolve`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (response.ok) {
        await fetchAlerts()
      }
    } catch (error) {
      console.error('Failed to resolve alert:', error)
    }
  }

  const refreshData = async () => {
    setIsLoading(true)
    try {
      await Promise.all([fetchMetrics(), fetchAlerts()])
      setLastRefresh(new Date())
    } finally {
      setIsLoading(false)
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-200'
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200'
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'low': return 'bg-blue-100 text-blue-800 border-blue-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <XCircle className="h-4 w-4" />
      case 'high': return <AlertTriangle className="h-4 w-4" />
      case 'medium': return <AlertCircle className="h-4 w-4" />
      case 'low': return <Clock className="h-4 w-4" />
      default: return <Clock className="h-4 w-4" />
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600'
    if (score >= 80) return 'text-yellow-600'
    if (score >= 70) return 'text-orange-600'
    return 'text-red-600'
  }

  const getTrendIcon = (trend: number) => {
    if (trend > 0) return <TrendingUp className="h-4 w-4 text-green-500" />
    if (trend < 0) return <TrendingDown className="h-4 w-4 text-red-500" />
    return <Activity className="h-4 w-4 text-gray-500" />
  }

  const getTotalAlerts = () => {
    if (!metrics) return 0
    return metrics.critical_alerts + metrics.high_alerts + metrics.medium_alerts + metrics.low_alerts
  }

  if (!metrics) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading monitoring data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Activity className="h-6 w-6 text-blue-500" />
          <h2 className="text-2xl font-bold text-gray-900">Real-Time Compliance Monitoring</h2>
          <Badge className={`${autoRefresh ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
            {autoRefresh ? 'Live' : 'Paused'}
          </Badge>
        </div>
        
        <div className="flex items-center space-x-3">
          <span className="text-sm text-gray-500">
            Last updated: {lastRefresh.toLocaleTimeString()}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
            {autoRefresh ? 'Pause' : 'Resume'}
          </Button>
          <Button
            size="sm"
            onClick={refreshData}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Overall Score */}
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Overall Score</p>
              <p className={`text-3xl font-bold ${getScoreColor(metrics.overall_score)}`}>
                {metrics.overall_score}%
              </p>
              <div className="flex items-center mt-2">
                {getTrendIcon(metrics.score_trend_24h)}
                <span className="text-sm text-gray-500 ml-1">
                  {metrics.score_trend_24h > 0 ? '+' : ''}{metrics.score_trend_24h} (24h)
                </span>
              </div>
            </div>
            <div className="p-3 rounded-full bg-blue-100">
              <Shield className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </Card>

        {/* Active Alerts */}
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active Alerts</p>
              <p className="text-3xl font-bold text-gray-900">{getTotalAlerts()}</p>
              <div className="flex items-center space-x-2 mt-2">
                <span className="text-xs text-red-600">{metrics.critical_alerts} Critical</span>
                <span className="text-xs text-orange-600">{metrics.high_alerts} High</span>
              </div>
            </div>
            <div className="p-3 rounded-full bg-red-100">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
          </div>
        </Card>

        {/* Failed Controls */}
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Failed Controls</p>
              <p className="text-3xl font-bold text-red-600">{metrics.failed_controls.length}</p>
              <p className="text-sm text-gray-500 mt-2">Immediate attention required</p>
            </div>
            <div className="p-3 rounded-full bg-orange-100">
              <XCircle className="h-6 w-6 text-orange-600" />
            </div>
          </div>
        </Card>

        {/* Upcoming Deadlines */}
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Upcoming Deadlines</p>
              <p className="text-3xl font-bold text-yellow-600">{metrics.upcoming_deadlines}</p>
              <p className="text-sm text-gray-500 mt-2">Next 30 days</p>
            </div>
            <div className="p-3 rounded-full bg-yellow-100">
              <Calendar className="h-6 w-6 text-yellow-600" />
            </div>
          </div>
        </Card>
      </div>

      {/* Control Scores Chart */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">Control Performance</h3>
          <div className="flex items-center space-x-2">
            <BarChart3 className="h-4 w-4 text-gray-500" />
            <span className="text-sm text-gray-500">Real-time scores</span>
          </div>
        </div>
        
        <div className="space-y-4">
          {Object.entries(metrics.control_scores).map(([controlId, score]) => (
            <div key={controlId} className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <span className="font-medium text-gray-900 w-16">{controlId}</span>
                <div className="w-64 bg-gray-200 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full ${
                      score >= 90 ? 'bg-green-500' :
                      score >= 80 ? 'bg-yellow-500' :
                      score >= 70 ? 'bg-orange-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${score}%` }}
                  ></div>
                </div>
              </div>
              <span className={`font-semibold ${getScoreColor(score)}`}>
                {score}%
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* Active Alerts */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">Active Alerts</h3>
          <div className="flex items-center space-x-2">
            <Filter className="h-4 w-4 text-gray-500" />
            <select
              value={selectedSeverity}
              onChange={(e) => {
                setSelectedSeverity(e.target.value)
                fetchAlerts()
              }}
              className="text-sm border border-gray-300 rounded-md px-2 py-1"
            >
              <option value="">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>

        {alerts.length === 0 ? (
          <div className="text-center py-8">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <p className="text-gray-600">No active alerts</p>
            <p className="text-sm text-gray-500">Your compliance monitoring is running smoothly</p>
          </div>
        ) : (
          <div className="space-y-4">
            {alerts.map((alert) => (
              <div key={alert.id} className={`border rounded-lg ${getSeverityColor(alert.severity)} border`}>
                <div className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3 flex-1">
                      <div className="flex-shrink-0 mt-1">
                        {getSeverityIcon(alert.severity)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-1">
                          <h4 className="font-medium text-gray-900">{alert.title}</h4>
                          <Badge className={getSeverityColor(alert.severity)}>
                            {alert.severity}
                          </Badge>
                          {alert.control_id && (
                            <Badge variant="outline">
                              {alert.control_id}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mb-2">{alert.description}</p>
                        <div className="flex items-center text-xs text-gray-500 space-x-4">
                          <span>Triggered: {new Date(alert.triggered_at).toLocaleString()}</span>
                          {alert.acknowledged && (
                            <span className="text-green-600">
                              ✓ Acknowledged by {alert.acknowledged_by}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2 ml-4">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setExpandedAlert(
                          expandedAlert === alert.id ? null : alert.id
                        )}
                      >
                        {expandedAlert === alert.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                      {!alert.acknowledged && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => acknowledgeAlert(alert.id)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Acknowledge
                        </Button>
                      )}
                      <Button
                        size="sm"
                        onClick={() => resolveAlert(alert.id)}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Resolve
                      </Button>
                    </div>
                  </div>

                  {expandedAlert === alert.id && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <h5 className="font-medium text-gray-900 mb-2">Recommendations:</h5>
                      <ul className="space-y-1">
                        {alert.recommendations.map((rec, index) => (
                          <li key={index} className="text-sm text-gray-600 flex items-start">
                            <span className="text-blue-500 mr-2">•</span>
                            {rec}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Trend Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">24h Trend</h3>
            {getTrendIcon(metrics.score_trend_24h)}
          </div>
          <p className={`text-2xl font-bold ${
            metrics.score_trend_24h > 0 ? 'text-green-600' : 
            metrics.score_trend_24h < 0 ? 'text-red-600' : 'text-gray-600'
          }`}>
            {metrics.score_trend_24h > 0 ? '+' : ''}{metrics.score_trend_24h} points
          </p>
          <p className="text-sm text-gray-500 mt-1">
            {metrics.score_trend_24h > 0 ? 'Improving' : 
             metrics.score_trend_24h < 0 ? 'Declining' : 'Stable'}
          </p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">7d Trend</h3>
            {getTrendIcon(metrics.score_trend_7d)}
          </div>
          <p className={`text-2xl font-bold ${
            metrics.score_trend_7d > 0 ? 'text-green-600' : 
            metrics.score_trend_7d < 0 ? 'text-red-600' : 'text-gray-600'
          }`}>
            {metrics.score_trend_7d > 0 ? '+' : ''}{metrics.score_trend_7d} points
          </p>
          <p className="text-sm text-gray-500 mt-1">Weekly average</p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">30d Trend</h3>
            {getTrendIcon(metrics.score_trend_30d)}
          </div>
          <p className={`text-2xl font-bold ${
            metrics.score_trend_30d > 0 ? 'text-green-600' : 
            metrics.score_trend_30d < 0 ? 'text-red-600' : 'text-gray-600'
          }`}>
            {metrics.score_trend_30d > 0 ? '+' : ''}{metrics.score_trend_30d} points
          </p>
          <p className="text-sm text-gray-500 mt-1">Monthly trend</p>
        </Card>
      </div>
    </div>
  )
}