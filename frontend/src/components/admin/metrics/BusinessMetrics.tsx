import React, { useState, useMemo } from 'react'
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Users,
  ShoppingCart,
  Target,
  Activity,
  ArrowUp,
  ArrowDown,
  BarChart3,
  PieChart,
  Calendar,
  Download,
} from 'lucide-react'
import {
  LineChart as RechartsLineChart,
  Line,
  AreaChart,
  Area,
  BarChart as RechartsBarChart,
  Bar,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Progress } from '@/components/ui/Progress'
import { cn } from '@/lib/utils'
import { FunnelVisualization } from './FunnelVisualization'
import { SEOMetrics } from './SEOMetrics'
import {
  useBusinessMetrics,
  useBusinessMetricsHistory,
  useCustomerSegments,
  useMarketingCampaigns,
  formatCurrency,
  formatPercentage,
  formatNumber,
  calculateROI,
  calculateCAC,
  calculateLTV,
} from '../hooks/useBusinessMetrics'

interface BusinessMetricsProps {
  className?: string
}

export const BusinessMetrics: React.FC<BusinessMetricsProps> = ({ className }) => {
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d' | '30d'>('24h')
  const [activeTab, setActiveTab] = useState<'overview' | 'revenue' | 'conversion' | 'segments' | 'campaigns'>('overview')

  // Fetch data
  const { data: currentMetrics, isLoading: metricsLoading } = useBusinessMetrics(timeRange)
  const { data: metricsHistory } = useBusinessMetricsHistory(30)
  const { data: segments } = useCustomerSegments()
  const { data: campaigns } = useMarketingCampaigns('active')

  // Calculate key metrics
  const kpis = useMemo(() => {
    if (!currentMetrics) return null

    const ltv = calculateLTV(150, 2.5, 24) // Example values
    const cac = currentMetrics.acquisition.cost / currentMetrics.acquisition.newUsers
    const ltvCacRatio = ltv / cac

    return {
      revenue: currentMetrics.revenue.current,
      revenueChange: currentMetrics.revenue.changePercent,
      conversionRate: currentMetrics.conversion.rate,
      conversionChange: currentMetrics.conversion.change,
      churnRate: currentMetrics.churn.rate,
      churnChange: currentMetrics.churn.change,
      newUsers: currentMetrics.acquisition.newUsers,
      dau: currentMetrics.engagement.dau,
      mau: currentMetrics.engagement.mau,
      dauMauRatio: (currentMetrics.engagement.dau / currentMetrics.engagement.mau) * 100,
      ltv,
      cac,
      ltvCacRatio,
      roi: calculateROI(currentMetrics.revenue.current, currentMetrics.acquisition.cost),
    }
  }, [currentMetrics])

  // Prepare chart data
  const revenueChartData = useMemo(() => {
    if (!metricsHistory) return []
    return metricsHistory.map(m => ({
      date: new Date(m.timestamp).toLocaleDateString(),
      revenue: m.revenue.current,
      conversions: m.conversion.total,
    }))
  }, [metricsHistory])

  const segmentChartData = useMemo(() => {
    if (!segments) return []
    return segments.map(s => ({
      name: s.name,
      value: s.value,
      size: s.size,
    }))
  }, [segments])

  const getChangeIcon = (change: number) => {
    if (change > 0) return <ArrowUp className="w-4 h-4" />
    if (change < 0) return <ArrowDown className="w-4 h-4" />
    return null
  }

  const getChangeColor = (change: number, inverse = false) => {
    const positive = inverse ? change < 0 : change > 0
    return positive ? 'text-sage-600' : 'text-danger-600'
  }

  const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

  if (metricsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-guardian-500" />
      </div>
    )
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-3">
            <BarChart3 className="w-7 h-7 text-guardian-500" />
            Business Metrics
          </h2>
          <p className="text-muted-foreground">
            Real-time KPIs and business performance tracking
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
            {(['1h', '24h', '7d', '30d'] as const).map(range => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={cn(
                  'px-3 py-1 text-sm font-medium rounded-md transition-all',
                  timeRange === range
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
            leftIcon={<Download className="w-4 h-4" />}
          >
            Export
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      {kpis && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <DollarSign className="w-5 h-5 text-sage-500" />
                <div className={cn('flex items-center gap-1 text-sm', getChangeColor(kpis.revenueChange))}>
                  {getChangeIcon(kpis.revenueChange)}
                  {formatPercentage(Math.abs(kpis.revenueChange), 1)}
                </div>
              </div>
              <div className="text-2xl font-bold">{formatCurrency(kpis.revenue)}</div>
              <div className="text-sm text-muted-foreground">Revenue</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <Target className="w-5 h-5 text-guardian-500" />
                <div className={cn('flex items-center gap-1 text-sm', getChangeColor(kpis.conversionChange))}>
                  {getChangeIcon(kpis.conversionChange)}
                  {formatPercentage(Math.abs(kpis.conversionChange), 1)}
                </div>
              </div>
              <div className="text-2xl font-bold">{formatPercentage(kpis.conversionRate)}</div>
              <div className="text-sm text-muted-foreground">Conversion Rate</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <Users className="w-5 h-5 text-alert-500" />
                <Badge variant="outline" size="sm">
                  {formatNumber(kpis.dau)} DAU
                </Badge>
              </div>
              <div className="text-2xl font-bold">{formatNumber(kpis.newUsers)}</div>
              <div className="text-sm text-muted-foreground">New Users</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <Activity className="w-5 h-5 text-danger-500" />
                <div className={cn('flex items-center gap-1 text-sm', getChangeColor(kpis.churnChange, true))}>
                  {getChangeIcon(kpis.churnChange)}
                  {formatPercentage(Math.abs(kpis.churnChange), 1)}
                </div>
              </div>
              <div className="text-2xl font-bold">{formatPercentage(kpis.churnRate)}</div>
              <div className="text-sm text-muted-foreground">Churn Rate</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 p-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg w-fit">
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'revenue', label: 'Revenue' },
          { id: 'conversion', label: 'Conversion' },
          { id: 'segments', label: 'Segments' },
          { id: 'campaigns', label: 'Campaigns' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              'px-4 py-2 rounded-md text-sm font-medium transition-all',
              activeTab === tab.id
                ? 'bg-white dark:bg-neutral-700 text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && currentMetrics && (
        <div className="space-y-6">
          {/* Revenue Trend */}
          <Card>
            <CardHeader>
              <CardTitle>Revenue & Conversions Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={revenueChartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="date" fontSize={12} />
                  <YAxis yAxisId="left" fontSize={12} />
                  <YAxis yAxisId="right" orientation="right" fontSize={12} />
                  <Tooltip />
                  <Legend />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="revenue"
                    stroke="#10b981"
                    fill="#10b981"
                    fillOpacity={0.3}
                    name="Revenue ($)"
                  />
                  <Area
                    yAxisId="right"
                    type="monotone"
                    dataKey="conversions"
                    stroke="#3b82f6"
                    fill="#3b82f6"
                    fillOpacity={0.3}
                    name="Conversions"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* LTV/CAC Analysis */}
            <Card>
              <CardHeader>
                <CardTitle>Unit Economics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm text-muted-foreground">LTV</span>
                    <span className="text-lg font-semibold">{formatCurrency(kpis?.ltv || 0)}</span>
                  </div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm text-muted-foreground">CAC</span>
                    <span className="text-lg font-semibold">{formatCurrency(kpis?.cac || 0)}</span>
                  </div>
                  <div className="pt-3 border-t">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">LTV:CAC Ratio</span>
                      <Badge 
                        variant={kpis && kpis.ltvCacRatio > 3 ? 'sage' : 'alert'} 
                        size="sm"
                      >
                        {kpis?.ltvCacRatio.toFixed(1)}:1
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Engagement Metrics */}
            <Card>
              <CardHeader>
                <CardTitle>Engagement</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">DAU</span>
                  <span className="font-semibold">{formatNumber(currentMetrics.engagement.dau)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">MAU</span>
                  <span className="font-semibold">{formatNumber(currentMetrics.engagement.mau)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">DAU/MAU</span>
                  <Badge variant="outline" size="sm">
                    {formatPercentage(kpis?.dauMauRatio || 0)}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Session Duration</span>
                  <span className="font-semibold">{currentMetrics.engagement.sessionDuration}min</span>
                </div>
              </CardContent>
            </Card>

            {/* Acquisition Channels */}
            <Card>
              <CardHeader>
                <CardTitle>Top Acquisition Channels</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {currentMetrics.acquisition.channels.slice(0, 4).map((channel, index) => (
                    <div key={channel.channel} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>{channel.channel}</span>
                        <span className="font-semibold">{formatNumber(channel.users)}</span>
                      </div>
                      <Progress 
                        value={(channel.users / currentMetrics.acquisition.newUsers) * 100} 
                        className="h-1"
                        indicatorClassName={`bg-[${CHART_COLORS[index]}]`}
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {activeTab === 'conversion' && currentMetrics && (
        <FunnelVisualization />
      )}

      {activeTab === 'segments' && segments && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Customer Segments by Value</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <RechartsPieChart>
                  <Pie
                    data={segmentChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {segmentChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any) => formatCurrency(value)} />
                  <Legend />
                </RechartsPieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Segment Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {segments.map((segment) => (
                  <div key={segment.id} className="p-3 border rounded-lg">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="font-medium">{segment.name}</h4>
                        <p className="text-sm text-muted-foreground">
                          {formatNumber(segment.size)} customers
                        </p>
                      </div>
                      <Badge 
                        variant={
                          segment.characteristics.churnRisk === 'low' ? 'sage' :
                          segment.characteristics.churnRisk === 'medium' ? 'secondary' : 'destructive'
                        }
                        size="sm"
                      >
                        {segment.characteristics.churnRisk} risk
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Avg Revenue:</span>
                        <span className="ml-1 font-medium">{formatCurrency(segment.characteristics.avgRevenue)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Growth:</span>
                        <span className={cn('ml-1 font-medium', getChangeColor(segment.growth))}>
                          {segment.growth > 0 ? '+' : ''}{formatPercentage(segment.growth)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'campaigns' && campaigns && (
        <Card>
          <CardHeader>
            <CardTitle>Active Marketing Campaigns</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b">
                  <tr className="text-sm">
                    <th className="text-left py-2 px-3">Campaign</th>
                    <th className="text-right py-2 px-3">Channel</th>
                    <th className="text-right py-2 px-3">Budget</th>
                    <th className="text-right py-2 px-3">Spent</th>
                    <th className="text-right py-2 px-3">Conversions</th>
                    <th className="text-right py-2 px-3">CPA</th>
                    <th className="text-right py-2 px-3">ROI</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((campaign) => (
                    <tr key={campaign.id} className="border-b text-sm">
                      <td className="py-3 px-3">
                        <div>
                          <div className="font-medium">{campaign.name}</div>
                          <Badge variant="outline" size="sm" className="mt-1">
                            {campaign.status}
                          </Badge>
                        </div>
                      </td>
                      <td className="text-right py-3 px-3">{campaign.channel}</td>
                      <td className="text-right py-3 px-3">{formatCurrency(campaign.budget)}</td>
                      <td className="text-right py-3 px-3">
                        <div>
                          {formatCurrency(campaign.spent)}
                          <Progress 
                            value={(campaign.spent / campaign.budget) * 100} 
                            className="h-1 mt-1"
                          />
                        </div>
                      </td>
                      <td className="text-right py-3 px-3">{formatNumber(campaign.conversions)}</td>
                      <td className="text-right py-3 px-3">{formatCurrency(campaign.cpa)}</td>
                      <td className="text-right py-3 px-3">
                        <Badge 
                          variant={campaign.roi > 100 ? 'sage' : 'secondary'} 
                          size="sm"
                        >
                          {formatPercentage(campaign.roi, 0)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default BusinessMetrics