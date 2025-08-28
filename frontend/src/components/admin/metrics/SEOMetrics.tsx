import React from 'react'
import {
  Globe,
  TrendingUp,
  TrendingDown,
  Link,
  Zap,
  Gauge,
  Search,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'
import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Progress } from '@/components/ui/Progress'
import { cn } from '@/lib/utils'
import { useSEOMetrics, formatNumber, formatPercentage } from '../hooks/useBusinessMetrics'

export const SEOMetrics: React.FC = () => {
  const { data: seoData, isLoading } = useSEOMetrics()

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'sage'
    if (score >= 50) return 'alert'
    return 'danger'
  }

  const getChangeIcon = (change: number) => {
    if (change > 0) return <ArrowUp className="w-3 h-3" />
    if (change < 0) return <ArrowDown className="w-3 h-3" />
    return null
  }

  if (isLoading || !seoData) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-guardian-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Core Web Vitals */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="w-5 h-5" />
            Core Web Vitals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">LCP</span>
                <Badge variant={getScoreColor(100 - seoData.coreWebVitals.lcp * 10) as any} size="sm">
                  {seoData.coreWebVitals.lcp.toFixed(1)}s
                </Badge>
              </div>
              <Progress 
                value={Math.max(0, 100 - seoData.coreWebVitals.lcp * 10)} 
                className="h-2"
                indicatorClassName={cn(
                  seoData.coreWebVitals.lcp < 2.5 ? 'bg-sage-500' :
                  seoData.coreWebVitals.lcp < 4 ? 'bg-alert-500' : 'bg-danger-500'
                )}
              />
              <p className="text-xs text-muted-foreground">Largest Contentful Paint</p>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">FID</span>
                <Badge variant={getScoreColor(100 - seoData.coreWebVitals.fid) as any} size="sm">
                  {seoData.coreWebVitals.fid}ms
                </Badge>
              </div>
              <Progress 
                value={Math.max(0, 100 - seoData.coreWebVitals.fid)} 
                className="h-2"
                indicatorClassName={cn(
                  seoData.coreWebVitals.fid < 100 ? 'bg-sage-500' :
                  seoData.coreWebVitals.fid < 300 ? 'bg-alert-500' : 'bg-danger-500'
                )}
              />
              <p className="text-xs text-muted-foreground">First Input Delay</p>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">CLS</span>
                <Badge variant={getScoreColor(100 - seoData.coreWebVitals.cls * 1000) as any} size="sm">
                  {seoData.coreWebVitals.cls.toFixed(3)}
                </Badge>
              </div>
              <Progress 
                value={Math.max(0, 100 - seoData.coreWebVitals.cls * 1000)} 
                className="h-2"
                indicatorClassName={cn(
                  seoData.coreWebVitals.cls < 0.1 ? 'bg-sage-500' :
                  seoData.coreWebVitals.cls < 0.25 ? 'bg-alert-500' : 'bg-danger-500'
                )}
              />
              <p className="text-xs text-muted-foreground">Cumulative Layout Shift</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Page Speed Scores */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-guardian-500" />
                <span className="font-medium">Mobile Speed</span>
              </div>
              <Badge variant={getScoreColor(seoData.pageSpeed.mobile) as any}>
                {seoData.pageSpeed.mobile}/100
              </Badge>
            </div>
            <Progress value={seoData.pageSpeed.mobile} className="h-2" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-guardian-500" />
                <span className="font-medium">Desktop Speed</span>
              </div>
              <Badge variant={getScoreColor(seoData.pageSpeed.desktop) as any}>
                {seoData.pageSpeed.desktop}/100
              </Badge>
            </div>
            <Progress value={seoData.pageSpeed.desktop} className="h-2" />
          </CardContent>
        </Card>
      </div>

      {/* SEO Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{formatNumber(seoData.organicTraffic)}</div>
                <div className="text-sm text-muted-foreground">Organic Traffic</div>
              </div>
              <Globe className="w-8 h-8 text-guardian-500 opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{formatNumber(seoData.backlinks)}</div>
                <div className="text-sm text-muted-foreground">Backlinks</div>
              </div>
              <Link className="w-8 h-8 text-sage-500 opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{seoData.domainAuthority}</div>
                <div className="text-sm text-muted-foreground">Domain Authority</div>
              </div>
              <Badge variant="outline" size="sm">/100</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Keyword Rankings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="w-5 h-5" />
            Top Keyword Rankings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b">
                <tr className="text-sm">
                  <th className="text-left py-2 px-3">Keyword</th>
                  <th className="text-right py-2 px-3">Position</th>
                  <th className="text-right py-2 px-3">Change</th>
                  <th className="text-right py-2 px-3">Search Volume</th>
                </tr>
              </thead>
              <tbody>
                {seoData.rankings.slice(0, 10).map((keyword) => (
                  <tr key={keyword.keyword} className="border-b text-sm">
                    <td className="py-3 px-3 font-medium">{keyword.keyword}</td>
                    <td className="text-right py-3 px-3">
                      <Badge variant={keyword.position <= 3 ? 'sage' : 'outline'} size="sm">
                        #{keyword.position}
                      </Badge>
                    </td>
                    <td className="text-right py-3 px-3">
                      <div className={cn(
                        'flex items-center justify-end gap-1',
                        keyword.change < 0 ? 'text-sage-600' : 
                        keyword.change > 0 ? 'text-danger-600' : 'text-muted-foreground'
                      )}>
                        {getChangeIcon(-keyword.change)}
                        {Math.abs(keyword.change)}
                      </div>
                    </td>
                    <td className="text-right py-3 px-3">{formatNumber(keyword.volume)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default SEOMetrics