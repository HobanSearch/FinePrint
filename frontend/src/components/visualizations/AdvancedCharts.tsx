import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ComposedChart,
  LineChart,
  AreaChart,
  BarChart,
  PieChart,
  RadarChart,
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
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ReferenceLine,
  Brush,
} from 'recharts'
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Shield, 
  Activity,
  Target,
  Zap,
  BarChart3,
  PieChart as PieChartIcon,
  MousePointer,
  Info
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { cn, getRiskColor, getRiskLabel } from '@/lib/utils'
import { RISK_LEVELS } from '@/lib/constants'

// Color schemes for different chart types
const CHART_COLORS = {
  sage: ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#d1fae5'],
  guardian: ['#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe'],
  alert: ['#f59e0b', '#fbbf24', '#fcd34d', '#fde68a', '#fef3c7'],
  danger: ['#ef4444', '#f87171', '#fca5a5', '#fecaca', '#fee2e2'],
  neutral: ['#6b7280', '#9ca3af', '#d1d5db', '#e5e7eb', '#f3f4f6'],
}

const CATEGORY_COLORS = {
  'DATA_COLLECTION': CHART_COLORS.guardian[0],
  'USER_RIGHTS': CHART_COLORS.sage[0],
  'LIABILITY': CHART_COLORS.danger[0],
  'TERMINATION': CHART_COLORS.alert[0],
  'PAYMENT': CHART_COLORS.guardian[1],
  'CONTENT_LICENSING': CHART_COLORS.neutral[0],
  'DISPUTE_RESOLUTION': CHART_COLORS.danger[1],
  'AUTOMATIC_RENEWAL': CHART_COLORS.alert[1],
}

// Risk Trend Chart with Interactive Features
export interface RiskTrendChartProps {
  data: Array<{
    date: string
    overallScore: number
    categories: Record<string, number>
    findingsCount: number
    criticalCount: number
  }>
  height?: number
  showBrush?: boolean
  showReferenceLine?: boolean
  interactive?: boolean
  className?: string
}

export const RiskTrendChart: React.FC<RiskTrendChartProps> = ({
  data,
  height = 300,
  showBrush = true,
  showReferenceLine = true,
  interactive = true,
  className,
}) => {
  const [selectedMetric, setSelectedMetric] = React.useState<'score' | 'findings' | 'critical'>('score')
  const [hoveredData, setHoveredData] = React.useState<any>(null)

  const formatData = React.useMemo(() => {
    return data.map(item => ({
      ...item,
      date: new Date(item.date).toLocaleDateString(),
      riskLevel: getRiskLabel(item.overallScore),
    }))
  }, [data])

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white dark:bg-neutral-800 p-3 rounded-lg shadow-lg border"
        >
          <p className="font-medium text-sm mb-2">{label}</p>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs text-muted-foreground">Risk Score:</span>
              <Badge variant={getRiskColor(data.overallScore) as any} size="sm">
                {Math.round(data.overallScore)}/100
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs text-muted-foreground">Findings:</span>
              <span className="text-xs font-medium">{data.findingsCount}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs text-muted-foreground">Critical:</span>
              <span className="text-xs font-medium text-danger-600">{data.criticalCount}</span>
            </div>
          </div>
        </motion.div>
      )
    }
    return null
  }

  const getMetricValue = (item: any) => {
    switch (selectedMetric) {
      case 'findings': return item.findingsCount
      case 'critical': return item.criticalCount
      default: return item.overallScore
    }
  }

  const getMetricColor = () => {
    switch (selectedMetric) {
      case 'findings': return CHART_COLORS.guardian[0]
      case 'critical': return CHART_COLORS.danger[0]
      default: return CHART_COLORS.sage[0]
    }
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Risk Trend Analysis
          </CardTitle>
          
          {interactive && (
            <div className="flex items-center gap-1">
              <Button
                variant={selectedMetric === 'score' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedMetric('score')}
              >
                Score
              </Button>
              <Button
                variant={selectedMetric === 'findings' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedMetric('findings')}
              >
                Findings
              </Button>
              <Button
                variant={selectedMetric === 'critical' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedMetric('critical')}
              >
                Critical
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          <ComposedChart data={formatData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis 
              dataKey="date" 
              fontSize={12}
              tickMargin={10}
            />
            <YAxis 
              fontSize={12}
              domain={selectedMetric === 'score' ? [0, 100] : [0, 'dataMax + 5']}
            />
            <Tooltip content={<CustomTooltip />} />
            
            {showReferenceLine && selectedMetric === 'score' && (
              <>
                <ReferenceLine y={60} stroke={CHART_COLORS.alert[0]} strokeDasharray="5 5" />
                <ReferenceLine y={80} stroke={CHART_COLORS.danger[0]} strokeDasharray="5 5" />
              </>
            )}
            
            <Area
              type="monotone"
              dataKey={selectedMetric === 'score' ? 'overallScore' : 
                       selectedMetric === 'findings' ? 'findingsCount' : 'criticalCount'}
              stroke={getMetricColor()}
              fill={getMetricColor()}
              fillOpacity={0.2}
              strokeWidth={2}
            />
            
            <Line
              type="monotone"
              dataKey={selectedMetric === 'score' ? 'overallScore' : 
                       selectedMetric === 'findings' ? 'findingsCount' : 'criticalCount'}
              stroke={getMetricColor()}
              strokeWidth={3}
              dot={{ fill: getMetricColor(), strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6, stroke: getMetricColor(), strokeWidth: 2 }}
            />
            
            {showBrush && (
              <Brush 
                dataKey="date" 
                height={30} 
                stroke={getMetricColor()}
                fill={getMetricColor()}
                fillOpacity={0.1}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

// Interactive Heatmap for Document Risk Analysis
export interface RiskHeatmapProps {
  data: Array<{
    section: string
    category: string
    riskScore: number
    findingsCount: number
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'MINIMAL'
  }>
  onCellClick?: (section: string, category: string) => void
  className?: string
}

export const RiskHeatmap: React.FC<RiskHeatmapProps> = ({
  data,
  onCellClick,
  className,
}) => {
  const [hoveredCell, setHoveredCell] = React.useState<{ section: string; category: string } | null>(null)

  // Organize data into a matrix
  const sections = [...new Set(data.map(d => d.section))]
  const categories = [...new Set(data.map(d => d.category))]
  
  const getCell = (section: string, category: string) => {
    return data.find(d => d.section === section && d.category === category)
  }

  const getRiskIntensity = (score: number) => {
    return Math.min(100, Math.max(0, score)) / 100
  }

  const getRiskColorForScore = (score: number) => {
    if (score >= 80) return CHART_COLORS.danger[0]
    if (score >= 60) return CHART_COLORS.alert[0]
    if (score >= 40) return CHART_COLORS.guardian[0]
    return CHART_COLORS.sage[0]
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="w-5 h-5" />
          Risk Heatmap by Section & Category
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Click on cells to drill down into specific findings
        </p>
      </CardHeader>
      
      <CardContent>
        <div className="overflow-x-auto">
          <div className="inline-block min-w-full">
            {/* Categories header */}
            <div className="flex">
              <div className="w-32 flex-shrink-0" /> {/* Empty corner */}
              {categories.map(category => (
                <div
                  key={category}
                  className="w-24 h-12 flex items-center justify-center text-xs font-medium text-center border-l border-b"
                  style={{ writingMode: 'vertical-lr', textOrientation: 'mixed' }}
                >
                  {category.replace(/_/g, ' ')}
                </div>
              ))}
            </div>
            
            {/* Rows */}
            {sections.map(section => (
              <div key={section} className="flex">
                {/* Section label */}
                <div className="w-32 flex-shrink-0 h-12 flex items-center px-2 text-xs font-medium border-r border-b bg-neutral-50 dark:bg-neutral-900">
                  {section.replace(/_/g, ' ')}
                </div>
                
                {/* Cells */}
                {categories.map(category => {
                  const cell = getCell(section, category)
                  const isHovered = hoveredCell?.section === section && hoveredCell?.category === category
                  
                  return (
                    <motion.div
                      key={`${section}-${category}`}
                      className={cn(
                        'w-24 h-12 border-l border-b relative cursor-pointer',
                        'flex items-center justify-center transition-all duration-200',
                        isHovered && 'ring-2 ring-guardian-400 z-10'
                      )}
                      style={{
                        backgroundColor: cell ? getRiskColorForScore(cell.riskScore) : '#f3f4f6',
                        opacity: cell ? getRiskIntensity(cell.riskScore) * 0.8 + 0.2 : 0.1,
                      }}
                      onMouseEnter={() => setHoveredCell({ section, category })}
                      onMouseLeave={() => setHoveredCell(null)}
                      onClick={() => cell && onCellClick?.(section, category)}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      {cell && (
                        <div className="text-center">
                          <div className="text-xs font-bold text-white drop-shadow">
                            {Math.round(cell.riskScore)}
                          </div>
                          {cell.findingsCount > 0 && (
                            <div className="text-xs text-white drop-shadow">
                              {cell.findingsCount}
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* Hover tooltip */}
                      <AnimatePresence>
                        {isHovered && cell && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 z-20"
                          >
                            <div className="bg-white dark:bg-neutral-800 p-2 rounded shadow-lg border text-center whitespace-nowrap">
                              <div className="text-xs font-medium">
                                {section.replace(/_/g, ' ')} × {category.replace(/_/g, ' ')}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Risk: {Math.round(cell.riskScore)}/100
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Findings: {cell.findingsCount}
                              </div>
                              <Badge variant={getRiskColor(cell.riskScore) as any} size="sm" className="mt-1">
                                {cell.severity}
                              </Badge>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
        
        {/* Legend */}
        <div className="flex items-center gap-4 mt-4 pt-4 border-t">
          <span className="text-xs text-muted-foreground">Risk Level:</span>
          <div className="flex items-center gap-2">
            {[
              { label: 'Low', color: CHART_COLORS.sage[0], range: '0-40' },
              { label: 'Medium', color: CHART_COLORS.guardian[0], range: '40-60' },
              { label: 'High', color: CHART_COLORS.alert[0], range: '60-80' },
              { label: 'Critical', color: CHART_COLORS.danger[0], range: '80-100' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-1">
                <div
                  className="w-3 h-3 rounded"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-xs">{item.label}</span>
                <span className="text-xs text-muted-foreground">({item.range})</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// Category Distribution Radar Chart
export interface CategoryRadarChartProps {
  data: Array<{
    category: string
    riskScore: number
    weight: number
    findingsCount: number
  }>
  className?: string
}

export const CategoryRadarChart: React.FC<CategoryRadarChartProps> = ({
  data,
  className,
}) => {
  const formatData = React.useMemo(() => {
    return data.map(item => ({
      category: item.category.replace(/_/g, ' '),
      risk: item.riskScore,
      weight: item.weight * 100,
      findings: item.findingsCount,
    }))
  }, [data])

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Risk Categories Overview
        </CardTitle>
      </CardHeader>
      
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <RadarChart data={formatData} margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
            <PolarGrid />
            <PolarAngleAxis dataKey="category" fontSize={10} />
            <PolarRadiusAxis
              angle={30}
              domain={[0, 100]}
              fontSize={10}
              tickCount={5}
            />
            <Radar
              name="Risk Score"
              dataKey="risk"
              stroke={CHART_COLORS.danger[0]}
              fill={CHART_COLORS.danger[0]}
              fillOpacity={0.3}
              strokeWidth={2}
            />
            <Radar
              name="Weight"
              dataKey="weight"
              stroke={CHART_COLORS.guardian[0]}
              fill={CHART_COLORS.guardian[0]}
              fillOpacity={0.1}
              strokeWidth={1}
              strokeDasharray="5 5"
            />
            <Tooltip 
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="bg-white dark:bg-neutral-800 p-2 rounded shadow-lg border">
                      <p className="font-medium text-xs">{label}</p>
                      {payload.map((entry, index) => (
                        <p key={index} className="text-xs" style={{ color: entry.color }}>
                          {entry.dataKey}: {Math.round(entry.value as number)}
                          {entry.dataKey === 'risk' ? '/100' : '%'}
                        </p>
                      ))}
                    </div>
                  )
                }
                return null
              }}
            />
            <Legend />
          </RadarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

// Severity Distribution Pie Chart
export interface SeverityPieChartProps {
  data: Array<{
    severity: string
    count: number
    percentage: number
  }>
  interactive?: boolean
  className?: string
}

export const SeverityPieChart: React.FC<SeverityPieChartProps> = ({
  data,
  interactive = true,
  className,
}) => {
  const [activeIndex, setActiveIndex] = React.useState<number | null>(null)

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return CHART_COLORS.danger[0]
      case 'HIGH': return CHART_COLORS.alert[0]
      case 'MEDIUM': return CHART_COLORS.guardian[0]
      case 'LOW': return CHART_COLORS.sage[0]
      case 'MINIMAL': return CHART_COLORS.neutral[0]
      default: return CHART_COLORS.neutral[2]
    }
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PieChartIcon className="w-5 h-5" />
          Findings by Severity
        </CardTitle>
      </CardHeader>
      
      <CardContent>
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={40}
              outerRadius={80}
              paddingAngle={2}
              dataKey="count"
              onMouseEnter={(_, index) => interactive && setActiveIndex(index)}
              onMouseLeave={() => interactive && setActiveIndex(null)}
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={getSeverityColor(entry.severity)}
                  stroke={activeIndex === index ? '#fff' : 'none'}
                  strokeWidth={activeIndex === index ? 2 : 0}
                />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload
                  return (
                    <div className="bg-white dark:bg-neutral-800 p-2 rounded shadow-lg border">
                      <p className="font-medium text-xs">{data.severity}</p>
                      <p className="text-xs">Count: {data.count}</p>
                      <p className="text-xs">Percentage: {data.percentage.toFixed(1)}%</p>
                    </div>
                  )
                }
                return null
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        
        {/* Legend */}
        <div className="grid grid-cols-2 gap-2 mt-4">
          {data.map((item, index) => (
            <div
              key={item.severity}
              className={cn(
                'flex items-center gap-2 p-2 rounded text-xs',
                interactive && 'cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-900',
                activeIndex === index && 'bg-neutral-100 dark:bg-neutral-800'
              )}
              onMouseEnter={() => interactive && setActiveIndex(index)}
              onMouseLeave={() => interactive && setActiveIndex(null)}
            >
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: getSeverityColor(item.severity) }}
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium">{item.severity}</div>
                <div className="text-muted-foreground">
                  {item.count} ({item.percentage.toFixed(1)}%)
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}