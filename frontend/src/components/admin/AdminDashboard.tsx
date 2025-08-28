import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Settings,
  Users,
  Activity,
  Server,
  Database,
  Shield,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  Clock,
  Cpu,
  HardDrive,
  Network,
  Zap,
  Eye,
  Edit,
  Trash2,
  UserPlus,
  Download,
  Upload,
  RefreshCw,
  Bell,
  Search,
  Filter,
  Calendar,
  BarChart3,
  PieChart,
  LineChart,
  Globe,
  Lock,
  Unlock,
  Ban,
  Mail,
  Phone,
  MapPin,
  CreditCard,
  Package,
  FileText,
  MessageSquare,
  Star,
  Flag,
  ExternalLink,
  MoreHorizontal,
  Play,
  Pause,
  Square,
  ChevronDown,
  ChevronRight,
  Info,
  Warning,
  Flask,
  Brain,
  Trophy
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Progress } from '@/components/ui/Progress'
import { cn } from '@/lib/utils'
import {
  LineChart as RechartsLineChart,
  AreaChart,
  BarChart as RechartsBarChart,
  PieChart as RechartsPieChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Line,
  Area,
  Bar,
  Pie,
  Cell,
} from 'recharts'

// Import new A/B testing components
import { ExperimentsDashboard } from './experiments/ExperimentsDashboard'
import { ModelPerformance } from './models/ModelPerformance'
import { BusinessMetrics } from './metrics/BusinessMetrics'
import { ImprovementHistory } from './history/ImprovementHistory'
import { useActiveExperiments } from './hooks/useExperiments'

// Mock data interfaces
interface SystemMetrics {
  timestamp: string
  cpu: number
  memory: number
  disk: number
  network: number
  activeUsers: number
  queueLength: number
  responseTime: number
  errorRate: number
}

interface User {
  id: string
  name: string
  email: string
  role: 'admin' | 'user' | 'viewer'
  status: 'active' | 'inactive' | 'suspended'
  lastLogin: string
  createdAt: string
  usage: {
    documentsAnalyzed: number
    actionsCompleted: number
    storageUsed: number
  }
  subscription: {
    plan: 'free' | 'pro' | 'enterprise'
    status: 'active' | 'canceled' | 'expired'
    renewalDate?: string
  }
}

interface SystemAlert {
  id: string
  type: 'error' | 'warning' | 'info'
  message: string
  timestamp: string
  resolved: boolean
  severity: 'low' | 'medium' | 'high' | 'critical'
  component: string
}

interface QueueStatus {
  pending: number
  processing: number
  completed: number
  failed: number
  avgProcessingTime: number
  throughput: number
}

// Color scheme for charts
const CHART_COLORS = {
  primary: '#3b82f6',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#06b6d4',
  neutral: '#6b7280',
}

export interface AdminDashboardProps {
  className?: string
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ className }) => {
  const [activeTab, setActiveTab] = React.useState<'overview' | 'experiments' | 'models' | 'metrics' | 'users' | 'system' | 'analytics' | 'settings'>('overview')
  const [selectedTimeRange, setSelectedTimeRange] = React.useState<'1h' | '24h' | '7d' | '30d'>('24h')
  const [refreshing, setRefreshing] = React.useState(false)

  // Fetch active experiments for overview
  const { data: activeExperiments } = useActiveExperiments()

  // Mock system metrics data
  const [systemMetrics] = React.useState<SystemMetrics[]>(() => {
    const now = new Date()
    return Array.from({ length: 24 }, (_, i) => ({
      timestamp: new Date(now.getTime() - (23 - i) * 60 * 60 * 1000).toISOString(),
      cpu: Math.random() * 100,
      memory: Math.random() * 100,
      disk: Math.random() * 100,
      network: Math.random() * 1000,
      activeUsers: Math.floor(Math.random() * 500) + 100,
      queueLength: Math.floor(Math.random() * 50),
      responseTime: Math.random() * 1000 + 200,
      errorRate: Math.random() * 5,
    }))
  })

  const [users] = React.useState<User[]>(() => [
    {
      id: '1',
      name: 'John Doe',
      email: 'john@example.com',
      role: 'admin',
      status: 'active',
      lastLogin: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      usage: { documentsAnalyzed: 45, actionsCompleted: 23, storageUsed: 1200 },
      subscription: { plan: 'enterprise', status: 'active', renewalDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() }
    },
    {
      id: '2',
      name: 'Jane Smith',
      email: 'jane@example.com',
      role: 'user',
      status: 'active',
      lastLogin: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      usage: { documentsAnalyzed: 23, actionsCompleted: 12, storageUsed: 800 },
      subscription: { plan: 'pro', status: 'active', renewalDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString() }
    },
    // Add more mock users...
  ])

  const [systemAlerts] = React.useState<SystemAlert[]>(() => [
    {
      id: '1',
      type: 'warning',
      message: 'High CPU usage detected on analysis workers',
      timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      resolved: false,
      severity: 'medium',
      component: 'Analysis Service'
    },
    {
      id: '2',
      type: 'info',
      message: 'Database backup completed successfully',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      resolved: true,
      severity: 'low',
      component: 'Database'
    },
    {
      id: '3',
      type: 'error',
      message: 'Failed to send notification emails',
      timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      resolved: false,
      severity: 'high',
      component: 'Notification Service'
    }
  ])

  const [queueStatus] = React.useState<QueueStatus>({
    pending: 23,
    processing: 8,
    completed: 1456,
    failed: 12,
    avgProcessingTime: 145,
    throughput: 12.5
  })

  const handleRefresh = async () => {
    setRefreshing(true)
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000))
    setRefreshing(false)
  }

  const stats = React.useMemo(() => {
    const latest = systemMetrics[systemMetrics.length - 1]
    const previous = systemMetrics[systemMetrics.length - 2]
    
    return {
      totalUsers: users.length,
      activeUsers: latest?.activeUsers || 0,
      systemHealth: latest ? (100 - Math.max(latest.cpu, latest.memory, latest.disk)) : 0,
      errorRate: latest?.errorRate || 0,
      responseTime: latest?.responseTime || 0,
      queueLength: latest?.queueLength || 0,
      cpuChange: latest && previous ? latest.cpu - previous.cpu : 0,
      memoryChange: latest && previous ? latest.memory - previous.memory : 0,
      activeUsersChange: latest && previous ? latest.activeUsers - previous.activeUsers : 0,
    }
  }, [systemMetrics, users])

  const getHealthColor = (value: number) => {
    if (value >= 90) return 'sage'
    if (value >= 70) return 'alert'
    return 'danger'
  }

  const getChangeIcon = (change: number) => {
    if (change > 0) return <TrendingUp className="w-3 h-3 text-sage-500" />
    if (change < 0) return <TrendingDown className="w-3 h-3 text-danger-500" />
    return null
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <Settings className="w-8 h-8 text-guardian-500" />
            Admin Dashboard
          </h1>
          <p className="text-muted-foreground text-lg">
            System monitoring and management center
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
            {['1h', '24h', '7d', '30d'].map(range => (
              <button
                key={range}
                onClick={() => setSelectedTimeRange(range as any)}
                className={cn(
                  'px-3 py-1 text-sm font-medium rounded-md transition-all',
                  selectedTimeRange === range
                    ? 'bg-white dark:bg-neutral-700 text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {range}
              </button>
            ))}
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            leftIcon={<RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />}
            disabled={refreshing}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* System Health Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="relative overflow-hidden">
          <CardContent className="p-6">
            <div className="absolute inset-0 bg-gradient-to-br from-guardian-500/10 to-transparent" />
            <div className="relative">
              <div className="flex items-center justify-between mb-2">
                <div className="text-2xl font-bold text-guardian-600">{stats.totalUsers}</div>
                <Users className="w-6 h-6 text-guardian-500" />
              </div>
              <div className="text-sm text-muted-foreground">Total Users</div>
              <div className="flex items-center gap-1 mt-1 text-xs">
                {getChangeIcon(stats.activeUsersChange)}
                <span className={cn(
                  stats.activeUsersChange > 0 ? 'text-sage-600' : 'text-danger-600'
                )}>
                  {Math.abs(stats.activeUsersChange)} active now
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <CardContent className="p-6">
            <div className="absolute inset-0 bg-gradient-to-br from-sage-500/10 to-transparent" />
            <div className="relative">
              <div className="flex items-center justify-between mb-2">
                <div className="text-2xl font-bold text-sage-600">{stats.systemHealth.toFixed(0)}%</div>
                <Activity className="w-6 h-6 text-sage-500" />
              </div>
              <div className="text-sm text-muted-foreground">System Health</div>
              <Progress 
                value={stats.systemHealth} 
                className="h-1 mt-2"
                indicatorClassName={cn(
                  stats.systemHealth >= 90 ? 'bg-sage-500' :
                  stats.systemHealth >= 70 ? 'bg-alert-500' : 'bg-danger-500'
                )}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <CardContent className="p-6">
            <div className="absolute inset-0 bg-gradient-to-br from-alert-500/10 to-transparent" />
            <div className="relative">
              <div className="flex items-center justify-between mb-2">
                <div className="text-2xl font-bold text-alert-600">{stats.responseTime.toFixed(0)}ms</div>
                <Clock className="w-6 h-6 text-alert-500" />
              </div>
              <div className="text-sm text-muted-foreground">Avg Response Time</div>
              <div className="text-xs text-muted-foreground mt-1">
                Target: &lt; 200ms
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <CardContent className="p-6">
            <div className="absolute inset-0 bg-gradient-to-br from-danger-500/10 to-transparent" />
            <div className="relative">
              <div className="flex items-center justify-between mb-2">
                <div className="text-2xl font-bold text-danger-600">{stats.errorRate.toFixed(1)}%</div>
                <AlertTriangle className="w-6 h-6 text-danger-500" />
              </div>
              <div className="text-sm text-muted-foreground">Error Rate</div>
              <div className="text-xs text-muted-foreground mt-1">
                Target: &lt; 1%
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* System Alerts */}
      {systemAlerts.filter(alert => !alert.resolved).length > 0 && (
        <Card className="border-l-4 border-l-alert-500 bg-alert-50 dark:bg-alert-950">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-alert-700 dark:text-alert-300">
              <Bell className="w-5 h-5" />
              Active System Alerts ({systemAlerts.filter(alert => !alert.resolved).length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {systemAlerts
                .filter(alert => !alert.resolved)
                .slice(0, 3)
                .map(alert => (
                  <div key={alert.id} className="flex items-center justify-between p-2 bg-white dark:bg-neutral-800 rounded border">
                    <div className="flex items-center gap-3">
                      {alert.type === 'error' && <AlertTriangle className="w-4 h-4 text-danger-500" />}
                      {alert.type === 'warning' && <Warning className="w-4 h-4 text-alert-500" />}
                      {alert.type === 'info' && <Info className="w-4 h-4 text-guardian-500" />}
                      <div>
                        <div className="text-sm font-medium">{alert.message}</div>
                        <div className="text-xs text-muted-foreground">
                          {alert.component} • {new Date(alert.timestamp).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant={
                          alert.severity === 'critical' ? 'destructive' :
                          alert.severity === 'high' ? 'default' :
                          alert.severity === 'medium' ? 'secondary' : 'outline'
                        }
                        size="sm"
                      >
                        {alert.severity}
                      </Badge>
                      <Button variant="ghost" size="sm">
                        Resolve
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 p-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg w-fit flex-wrap">
        {[
          { id: 'overview', label: 'Overview', icon: BarChart3 },
          { id: 'experiments', label: 'Experiments', icon: Flask },
          { id: 'models', label: 'Models', icon: Brain },
          { id: 'metrics', label: 'Metrics', icon: TrendingUp },
          { id: 'users', label: 'Users', icon: Users },
          { id: 'system', label: 'System', icon: Server },
          { id: 'analytics', label: 'Analytics', icon: PieChart },
          { id: 'settings', label: 'Settings', icon: Settings },
        ].map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200',
                activeTab === tab.id
                  ? 'bg-white dark:bg-neutral-700 text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* A/B Testing Summary */}
          {activeExperiments && activeExperiments.length > 0 && (
            <Card className="border-l-4 border-l-guardian-500 bg-guardian-50 dark:bg-guardian-950">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-guardian-700 dark:text-guardian-300">
                  <Flask className="w-5 h-5" />
                  Active A/B Tests ({activeExperiments.filter(e => e.status === 'running').length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {activeExperiments.slice(0, 3).map(experiment => (
                    <div key={experiment.id} className="p-3 bg-white dark:bg-neutral-800 rounded border">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm">{experiment.name}</span>
                        <Badge variant="sage" size="sm">{experiment.status}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {experiment.variants.length} variants • {experiment.confidence.toFixed(0)}% confidence
                      </div>
                    </div>
                  ))}
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="mt-3"
                  onClick={() => setActiveTab('experiments')}
                >
                  View All Experiments
                </Button>
              </CardContent>
            </Card>
          )}

          {/* System Metrics Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SystemMetricsChart 
              data={systemMetrics}
              title="Resource Usage"
              metrics={['cpu', 'memory', 'disk']}
            />
            <SystemMetricsChart 
              data={systemMetrics}
              title="Performance Metrics"
              metrics={['responseTime', 'errorRate']}
            />
          </div>

          {/* Queue Status and Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <QueueStatusCard queueStatus={queueStatus} />
            <RecentActivityCard />
          </div>
        </div>
      )}

      {activeTab === 'experiments' && (
        <ExperimentsDashboard />
      )}

      {activeTab === 'models' && (
        <ModelPerformance />
      )}

      {activeTab === 'metrics' && (
        <div className="space-y-6">
          <BusinessMetrics />
          <ImprovementHistory />
        </div>
      )}

      {activeTab === 'users' && (
        <UserManagementPanel users={users} />
      )}

      {activeTab === 'system' && (
        <SystemMonitoringPanel 
          metrics={systemMetrics}
          alerts={systemAlerts}
          queueStatus={queueStatus}
        />
      )}

      {activeTab === 'analytics' && (
        <AnalyticsPanel metrics={systemMetrics} users={users} />
      )}

      {activeTab === 'settings' && (
        <SystemSettingsPanel />
      )}
    </div>
  )
}

// System Metrics Chart Component
interface SystemMetricsChartProps {
  data: SystemMetrics[]
  title: string
  metrics: string[]
}

const SystemMetricsChart: React.FC<SystemMetricsChartProps> = ({ data, title, metrics }) => {
  const chartData = data.map(item => ({
    time: new Date(item.timestamp).toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    }),
    ...metrics.reduce((acc, metric) => ({
      ...acc,
      [metric]: item[metric as keyof SystemMetrics]
    }), {})
  }))

  const getMetricColor = (metric: string) => {
    const colors = {
      cpu: CHART_COLORS.danger,
      memory: CHART_COLORS.warning,
      disk: CHART_COLORS.info,
      responseTime: CHART_COLORS.primary,
      errorRate: CHART_COLORS.danger,
      activeUsers: CHART_COLORS.success,
    }
    return colors[metric as keyof typeof colors] || CHART_COLORS.neutral
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LineChart className="w-5 h-5" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={250}>
          <RechartsLineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="time" fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px'
              }}
            />
            <Legend />
            {metrics.map(metric => (
              <Line
                key={metric}
                type="monotone"
                dataKey={metric}
                stroke={getMetricColor(metric)}
                strokeWidth={2}
                dot={false}
                name={metric.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
              />
            ))}
          </RechartsLineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

// Queue Status Card Component
interface QueueStatusCardProps {
  queueStatus: QueueStatus
}

const QueueStatusCard: React.FC<QueueStatusCardProps> = ({ queueStatus }) => {
  const total = queueStatus.pending + queueStatus.processing + queueStatus.completed + queueStatus.failed

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Queue Status
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-3 bg-guardian-50 dark:bg-guardian-950 rounded-lg">
              <div className="text-2xl font-bold text-guardian-600">{queueStatus.pending}</div>
              <div className="text-sm text-muted-foreground">Pending</div>
            </div>
            <div className="text-center p-3 bg-alert-50 dark:bg-alert-950 rounded-lg">
              <div className="text-2xl font-bold text-alert-600">{queueStatus.processing}</div>
              <div className="text-sm text-muted-foreground">Processing</div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-3 bg-sage-50 dark:bg-sage-950 rounded-lg">
              <div className="text-2xl font-bold text-sage-600">{queueStatus.completed}</div>
              <div className="text-sm text-muted-foreground">Completed</div>
            </div>
            <div className="text-center p-3 bg-danger-50 dark:bg-danger-950 rounded-lg">
              <div className="text-2xl font-bold text-danger-600">{queueStatus.failed}</div>
              <div className="text-sm text-muted-foreground">Failed</div>
            </div>
          </div>
          
          <div className="pt-4 border-t space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Avg Processing Time</span>
              <span className="font-medium">{queueStatus.avgProcessingTime}s</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Throughput</span>
              <span className="font-medium">{queueStatus.throughput}/min</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// Recent Activity Card Component
const RecentActivityCard: React.FC = () => {
  const activities = [
    { type: 'user_login', user: 'john@example.com', timestamp: new Date(Date.now() - 5 * 60 * 1000) },
    { type: 'analysis_complete', document: 'privacy-policy.pdf', timestamp: new Date(Date.now() - 10 * 60 * 1000) },
    { type: 'user_signup', user: 'jane@example.com', timestamp: new Date(Date.now() - 15 * 60 * 1000) },
    { type: 'system_alert', message: 'High CPU usage', timestamp: new Date(Date.now() - 30 * 60 * 1000) },
  ]

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'user_login': return <Users className="w-4 h-4 text-guardian-500" />
      case 'analysis_complete': return <CheckCircle className="w-4 h-4 text-sage-500" />
      case 'user_signup': return <UserPlus className="w-4 h-4 text-guardian-500" />
      case 'system_alert': return <AlertTriangle className="w-4 h-4 text-alert-500" />
      default: return <Activity className="w-4 h-4 text-muted-foreground" />
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="w-5 h-5" />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {activities.map((activity, index) => (
            <div key={index} className="flex items-center gap-3 p-2 rounded hover:bg-neutral-50 dark:hover:bg-neutral-900">
              {getActivityIcon(activity.type)}
              <div className="flex-1 min-w-0">
                <div className="text-sm">
                  {activity.type === 'user_login' && `User logged in: ${activity.user}`}
                  {activity.type === 'analysis_complete' && `Analysis completed: ${activity.document}`}
                  {activity.type === 'user_signup' && `New user registered: ${activity.user}`}
                  {activity.type === 'system_alert' && `System alert: ${activity.message}`}
                </div>
                <div className="text-xs text-muted-foreground">
                  {activity.timestamp.toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// User Management Panel Component
interface UserManagementPanelProps {
  users: User[]
}

const UserManagementPanel: React.FC<UserManagementPanelProps> = ({ users }) => {
  const [searchQuery, setSearchQuery] = React.useState('')
  const [selectedRole, setSelectedRole] = React.useState<string>('all')
  const [selectedStatus, setSelectedStatus] = React.useState<string>('all')
  const [selectedUser, setSelectedUser] = React.useState<User | null>(null)

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesRole = selectedRole === 'all' || user.role === selectedRole
    const matchesStatus = selectedStatus === 'all' || user.status === selectedStatus
    
    return matchesSearch && matchesRole && matchesStatus
  })

  const getRoleColor = (role: User['role']) => {
    switch (role) {
      case 'admin': return 'destructive'
      case 'user': return 'default'
      case 'viewer': return 'secondary'
      default: return 'outline'
    }
  }

  const getStatusColor = (status: User['status']) => {
    switch (status) {
      case 'active': return 'sage'
      case 'inactive': return 'secondary'
      case 'suspended': return 'destructive'
      default: return 'outline'
    }
  }

  const getPlanColor = (plan: User['subscription']['plan']) => {
    switch (plan) {
      case 'enterprise': return 'default'
      case 'pro': return 'secondary'
      case 'free': return 'outline'
      default: return 'outline'
    }
  }

  return (
    <div className="space-y-6">
      {/* User Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-guardian-600">{users.length}</div>
            <div className="text-sm text-muted-foreground">Total Users</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-sage-600">
              {users.filter(u => u.status === 'active').length}
            </div>
            <div className="text-sm text-muted-foreground">Active Users</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-alert-600">
              {users.filter(u => u.subscription.plan === 'pro' || u.subscription.plan === 'enterprise').length}
            </div>
            <div className="text-sm text-muted-foreground">Paid Users</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-guardian-600">
              {users.filter(u => u.role === 'admin').length}
            </div>
            <div className="text-sm text-muted-foreground">Administrators</div>
          </CardContent>
        </Card>
      </div>

      {/* User Controls */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <Input
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              leftIcon={<Search className="w-4 h-4" />}
              className="flex-1 min-w-64"
            />
            
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="px-3 py-2 text-sm border rounded-md bg-background"
            >
              <option value="all">All Roles</option>
              <option value="admin">Admin</option>
              <option value="user">User</option>
              <option value="viewer">Viewer</option>
            </select>
            
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-3 py-2 text-sm border rounded-md bg-background"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
            </select>
            
            <Button leftIcon={<UserPlus className="w-4 h-4" />}>
              Add User
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b bg-neutral-50 dark:bg-neutral-900">
                <tr>
                  <th className="text-left p-4 font-medium text-sm">User</th>
                  <th className="text-left p-4 font-medium text-sm">Role</th>
                  <th className="text-left p-4 font-medium text-sm">Status</th>
                  <th className="text-left p-4 font-medium text-sm">Plan</th>
                  <th className="text-left p-4 font-medium text-sm">Usage</th>
                  <th className="text-left p-4 font-medium text-sm">Last Login</th>
                  <th className="text-right p-4 font-medium text-sm">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(user => (
                  <tr key={user.id} className="border-b hover:bg-neutral-50 dark:hover:bg-neutral-900">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-guardian-100 dark:bg-guardian-900 rounded-full flex items-center justify-center">
                          <span className="text-sm font-medium">
                            {user.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <div className="font-medium">{user.name}</div>
                          <div className="text-sm text-muted-foreground">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <Badge variant={getRoleColor(user.role)} size="sm">
                        {user.role}
                      </Badge>
                    </td>
                    <td className="p-4">
                      <Badge variant={getStatusColor(user.status)} size="sm">
                        {user.status}
                      </Badge>
                    </td>
                    <td className="p-4">
                      <Badge variant={getPlanColor(user.subscription.plan)} size="sm">
                        {user.subscription.plan}
                      </Badge>
                    </td>
                    <td className="p-4">
                      <div className="text-sm">
                        <div>{user.usage.documentsAnalyzed} docs</div>
                        <div className="text-muted-foreground">{user.usage.storageUsed}MB</div>
                      </div>
                    </td>
                    <td className="p-4 text-sm text-muted-foreground">
                      {new Date(user.lastLogin).toLocaleDateString()}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2 justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedUser(user)}
                          leftIcon={<Eye className="w-3 h-3" />}
                        >
                          View
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          leftIcon={<Edit className="w-3 h-3" />}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          leftIcon={<MoreHorizontal className="w-3 h-3" />}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* User Detail Modal */}
      <AnimatePresence>
        {selectedUser && (
          <UserDetailModal
            user={selectedUser}
            onClose={() => setSelectedUser(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// User Detail Modal Component
interface UserDetailModalProps {
  user: User
  onClose: () => void
}

const UserDetailModal: React.FC<UserDetailModalProps> = ({ user, onClose }) => {
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
        className="bg-white dark:bg-neutral-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">User Details</h2>
            <Button variant="ghost" size="sm" onClick={onClose}>×</Button>
          </div>
        </div>
        
        <div className="p-6 space-y-6">
          {/* User Info */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-guardian-100 dark:bg-guardian-900 rounded-full flex items-center justify-center">
              <span className="text-xl font-bold">
                {user.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <h3 className="text-lg font-semibold">{user.name}</h3>
              <p className="text-muted-foreground">{user.email}</p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={getRoleColor(user.role) as any} size="sm">
                  {user.role}
                </Badge>
                <Badge variant={getStatusColor(user.status) as any} size="sm">
                  {user.status}
                </Badge>
              </div>
            </div>
          </div>
          
          {/* Account Details */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium mb-3">Account Information</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created:</span>
                  <span>{new Date(user.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last Login:</span>
                  <span>{new Date(user.lastLogin).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <Badge variant={getStatusColor(user.status) as any} size="sm">
                    {user.status}
                  </Badge>
                </div>
              </div>
            </div>
            
            <div>
              <h4 className="font-medium mb-3">Subscription</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Plan:</span>
                  <Badge variant={getPlanColor(user.subscription.plan) as any} size="sm">
                    {user.subscription.plan}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <span className="capitalize">{user.subscription.status}</span>
                </div>
                {user.subscription.renewalDate && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Renewal:</span>
                    <span>{new Date(user.subscription.renewalDate).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Usage Stats */}
          <div>
            <h4 className="font-medium mb-3">Usage Statistics</h4>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 bg-neutral-50 dark:bg-neutral-900 rounded">
                <div className="text-lg font-bold text-guardian-600">
                  {user.usage.documentsAnalyzed}
                </div>
                <div className="text-xs text-muted-foreground">Documents</div>
              </div>
              <div className="text-center p-3 bg-neutral-50 dark:bg-neutral-900 rounded">
                <div className="text-lg font-bold text-sage-600">
                  {user.usage.actionsCompleted}
                </div>
                <div className="text-xs text-muted-foreground">Actions</div>
              </div>
              <div className="text-center p-3 bg-neutral-50 dark:bg-neutral-900 rounded">
                <div className="text-lg font-bold text-alert-600">
                  {user.usage.storageUsed}MB
                </div>
                <div className="text-xs text-muted-foreground">Storage</div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="p-6 border-t flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button leftIcon={<Edit className="w-4 h-4" />}>
            Edit User
          </Button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// System Monitoring Panel Component
interface SystemMonitoringPanelProps {
  metrics: SystemMetrics[]
  alerts: SystemAlert[]
  queueStatus: QueueStatus
}

const SystemMonitoringPanel: React.FC<SystemMonitoringPanelProps> = ({ 
  metrics, 
  alerts, 
  queueStatus 
}) => {
  const [selectedService, setSelectedService] = React.useState<string>('all')

  const services = [
    { id: 'api', name: 'API Gateway', status: 'healthy', uptime: 99.9 },
    { id: 'analysis', name: 'Analysis Service', status: 'warning', uptime: 98.5 },
    { id: 'database', name: 'Database', status: 'healthy', uptime: 99.8 },
    { id: 'queue', name: 'Queue System', status: 'healthy', uptime: 99.7 },
    { id: 'auth', name: 'Authentication', status: 'healthy', uptime: 99.9 },
    { id: 'notification', name: 'Notifications', status: 'error', uptime: 95.2 },
  ]

  const getServiceStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'sage'
      case 'warning': return 'alert'
      case 'error': return 'danger'
      default: return 'neutral'
    }
  }

  return (
    <div className="space-y-6">
      {/* Service Status Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {services.map(service => (
          <Card key={service.id} className="relative">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium">{service.name}</h3>
                <Badge variant={getServiceStatusColor(service.status) as any} size="sm">
                  {service.status}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                Uptime: {service.uptime}%
              </div>
              <Progress 
                value={service.uptime} 
                className="h-1 mt-2"
                indicatorClassName={cn(
                  service.uptime >= 99 ? 'bg-sage-500' :
                  service.uptime >= 95 ? 'bg-alert-500' : 'bg-danger-500'
                )}
              />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Detailed System Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cpu className="w-5 h-5" />
              CPU & Memory Usage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={metrics.slice(-12)}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis 
                  dataKey="timestamp" 
                  tickFormatter={(value) => new Date(value).toLocaleTimeString('en-US', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                  fontSize={12}
                />
                <YAxis fontSize={12} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="cpu"
                  stackId="1"
                  stroke={CHART_COLORS.danger}
                  fill={CHART_COLORS.danger}
                  fillOpacity={0.3}
                  name="CPU %"
                />
                <Area
                  type="monotone"
                  dataKey="memory"
                  stackId="1"
                  stroke={CHART_COLORS.warning}
                  fill={CHART_COLORS.warning}
                  fillOpacity={0.3}
                  name="Memory %"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Network className="w-5 h-5" />
              Network & Response Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <RechartsLineChart data={metrics.slice(-12)}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis 
                  dataKey="timestamp" 
                  tickFormatter={(value) => new Date(value).toLocaleTimeString('en-US', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                  fontSize={12}
                />
                <YAxis fontSize={12} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="network"
                  stroke={CHART_COLORS.info}
                  strokeWidth={2}
                  name="Network KB/s"
                />
                <Line
                  type="monotone"
                  dataKey="responseTime"
                  stroke={CHART_COLORS.primary}
                  strokeWidth={2}
                  name="Response Time ms"
                />
              </RechartsLineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* System Alerts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            System Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {alerts.map(alert => (
              <div 
                key={alert.id} 
                className={cn(
                  'flex items-center justify-between p-3 rounded-lg border',
                  alert.resolved ? 'opacity-50' : '',
                  alert.type === 'error' && 'bg-danger-50 dark:bg-danger-950 border-danger-200',
                  alert.type === 'warning' && 'bg-alert-50 dark:bg-alert-950 border-alert-200',
                  alert.type === 'info' && 'bg-guardian-50 dark:bg-guardian-950 border-guardian-200'
                )}
              >
                <div className="flex items-center gap-3">
                  {alert.type === 'error' && <AlertTriangle className="w-4 h-4 text-danger-500" />}
                  {alert.type === 'warning' && <Warning className="w-4 h-4 text-alert-500" />}
                  {alert.type === 'info' && <Info className="w-4 h-4 text-guardian-500" />}
                  <div>
                    <div className="font-medium">{alert.message}</div>
                    <div className="text-sm text-muted-foreground">
                      {alert.component} • {new Date(alert.timestamp).toLocaleString()}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge 
                    variant={
                      alert.severity === 'critical' ? 'destructive' :
                      alert.severity === 'high' ? 'default' :
                      alert.severity === 'medium' ? 'secondary' : 'outline'
                    }
                    size="sm"
                  >
                    {alert.severity}
                  </Badge>
                  {!alert.resolved && (
                    <Button variant="outline" size="sm">
                      Resolve
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// Analytics Panel Component
interface AnalyticsPanelProps {
  metrics: SystemMetrics[]
  users: User[]
}

const AnalyticsPanel: React.FC<AnalyticsPanelProps> = ({ metrics, users }) => {
  const analytics = React.useMemo(() => {
    // User distribution by plan
    const planDistribution = users.reduce((acc, user) => {
      acc[user.subscription.plan] = (acc[user.subscription.plan] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    // User growth over time (mock data)
    const userGrowth = Array.from({ length: 30 }, (_, i) => ({
      date: new Date(Date.now() - (29 - i) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      users: Math.floor(Math.random() * 20) + users.length - 15 + i,
    }))

    // Usage statistics
    const totalDocuments = users.reduce((sum, user) => sum + user.usage.documentsAnalyzed, 0)
    const totalActions = users.reduce((sum, user) => sum + user.usage.actionsCompleted, 0)
    const totalStorage = users.reduce((sum, user) => sum + user.usage.storageUsed, 0)

    return {
      planDistribution,
      userGrowth,
      totalDocuments,
      totalActions,
      totalStorage,
    }
  }, [users])

  const planData = Object.entries(analytics.planDistribution).map(([plan, count]) => ({
    name: plan,
    value: count,
    color: plan === 'enterprise' ? CHART_COLORS.primary :
           plan === 'pro' ? CHART_COLORS.success :
           CHART_COLORS.neutral
  }))

  return (
    <div className="space-y-6">
      {/* Analytics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6 text-center">
            <div className="text-3xl font-bold text-guardian-600 mb-1">
              {analytics.totalDocuments}
            </div>
            <div className="text-sm text-muted-foreground">Documents Analyzed</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 text-center">
            <div className="text-3xl font-bold text-sage-600 mb-1">
              {analytics.totalActions}
            </div>
            <div className="text-sm text-muted-foreground">Actions Completed</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 text-center">
            <div className="text-3xl font-bold text-alert-600 mb-1">
              {(analytics.totalStorage / 1024).toFixed(1)}GB
            </div>
            <div className="text-sm text-muted-foreground">Storage Used</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 text-center">
            <div className="text-3xl font-bold text-guardian-600 mb-1">
              {users.filter(u => u.subscription.plan !== 'free').length}
            </div>
            <div className="text-sm text-muted-foreground">Paid Subscriptions</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>User Growth</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={analytics.userGrowth}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric' 
                  })}
                  fontSize={12}
                />
                <YAxis fontSize={12} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="users"
                  stroke={CHART_COLORS.primary}
                  fill={CHART_COLORS.primary}
                  fillOpacity={0.3}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Subscription Plans</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <RechartsPieChart>
                <Pie
                  data={planData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {planData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </RechartsPieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// System Settings Panel Component
const SystemSettingsPanel: React.FC = () => {
  const [settings, setSettings] = React.useState({
    maintenanceMode: false,
    registrationEnabled: true,
    emailNotifications: true,
    autoBackup: true,
    rateLimitEnabled: true,
    debugMode: false,
    maxFileSize: 10,
    sessionTimeout: 30,
    passwordMinLength: 8,
  })

  const handleSettingChange = (key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>System Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Maintenance Mode</div>
                <div className="text-sm text-muted-foreground">
                  Temporarily disable user access
                </div>
              </div>
              <Button
                variant={settings.maintenanceMode ? 'destructive' : 'outline'}
                size="sm"
                onClick={() => handleSettingChange('maintenanceMode', !settings.maintenanceMode)}
              >
                {settings.maintenanceMode ? 'Enabled' : 'Disabled'}
              </Button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">User Registration</div>
                <div className="text-sm text-muted-foreground">
                  Allow new user signups
                </div>
              </div>
              <Button
                variant={settings.registrationEnabled ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleSettingChange('registrationEnabled', !settings.registrationEnabled)}
              >
                {settings.registrationEnabled ? 'Enabled' : 'Disabled'}
              </Button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Email Notifications</div>
                <div className="text-sm text-muted-foreground">
                  Send system notification emails
                </div>
              </div>
              <Button
                variant={settings.emailNotifications ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleSettingChange('emailNotifications', !settings.emailNotifications)}
              >
                {settings.emailNotifications ? 'Enabled' : 'Disabled'}
              </Button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Auto Backup</div>
                <div className="text-sm text-muted-foreground">
                  Automatic database backups
                </div>
              </div>
              <Button
                variant={settings.autoBackup ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleSettingChange('autoBackup', !settings.autoBackup)}
              >
                {settings.autoBackup ? 'Enabled' : 'Disabled'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Security Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Max File Size (MB)
              </label>
              <Input
                type="number"
                value={settings.maxFileSize}
                onChange={(e) => handleSettingChange('maxFileSize', parseInt(e.target.value))}
                min="1"
                max="100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Session Timeout (minutes)
              </label>
              <Input
                type="number"
                value={settings.sessionTimeout}
                onChange={(e) => handleSettingChange('sessionTimeout', parseInt(e.target.value))}
                min="5"
                max="120"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Minimum Password Length
              </label>
              <Input
                type="number"
                value={settings.passwordMinLength}
                onChange={(e) => handleSettingChange('passwordMinLength', parseInt(e.target.value))}
                min="6"
                max="20"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Rate Limiting</div>
                <div className="text-sm text-muted-foreground">
                  Enable API rate limiting
                </div>
              </div>
              <Button
                variant={settings.rateLimitEnabled ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleSettingChange('rateLimitEnabled', !settings.rateLimitEnabled)}
              >
                {settings.rateLimitEnabled ? 'Enabled' : 'Disabled'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Backup & Maintenance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button leftIcon={<Download className="w-4 h-4" />}>
              Create Backup
            </Button>
            <Button leftIcon={<Upload className="w-4 h-4" />} variant="outline">
              Restore Backup
            </Button>
            <Button leftIcon={<RefreshCw className="w-4 h-4" />} variant="outline">
              Clear Cache
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// Add getRoleColor, getStatusColor, getPlanColor functions if they're not imported
const getRoleColor = (role: User['role']) => {
  switch (role) {
    case 'admin': return 'destructive'
    case 'user': return 'default'
    case 'viewer': return 'secondary'
    default: return 'outline'
  }
}

const getStatusColor = (status: User['status']) => {
  switch (status) {
    case 'active': return 'sage'
    case 'inactive': return 'secondary'
    case 'suspended': return 'destructive'
    default: return 'outline'
  }
}

const getPlanColor = (plan: User['subscription']['plan']) => {
  switch (plan) {
    case 'enterprise': return 'default'
    case 'pro': return 'secondary'
    case 'free': return 'outline'
    default: return 'outline'
  }
}

export default AdminDashboard