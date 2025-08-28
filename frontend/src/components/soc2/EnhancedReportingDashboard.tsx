/**
 * Fine Print AI - Enhanced SOC2 Reporting Dashboard
 * 
 * Comprehensive dashboard for SOC2 audit preparation, trend analysis,
 * and enhanced reporting capabilities
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  FileText,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Download,
  Calendar as CalendarIcon,
  Filter,
  RefreshCw,
  Eye,
  BarChart3,
  PieChart as PieChartIcon,
  FileDown,
  Clock,
  Target,
  Zap,
} from 'lucide-react';

interface AuditReport {
  id: string;
  reportType: 'readiness' | 'gap_analysis' | 'continuous' | 'annual';
  period: {
    startDate: Date;
    endDate: Date;
  };
  scope: string[];
  summary: {
    overallScore: number;
    totalControls: number;
    compliantControls: number;
    nonCompliantControls: number;
    criticalFindings: number;
    highRiskFindings: number;
    mediumRiskFindings: number;
    lowRiskFindings: number;
  };
  findings: AuditFinding[];
  recommendations: AuditRecommendation[];
  evidenceGaps: EvidenceGap[];
  trendAnalysis: TrendAnalysis;
  generatedAt: Date;
  generatedBy: string;
}

interface AuditFinding {
  id: string;
  controlId: string;
  controlName: string;
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: 'design_deficiency' | 'operating_effectiveness' | 'evidence_gap' | 'policy_gap';
  description: string;
  impact: string;
  rootCause: string;
  currentStatus: string;
  detectedAt: Date;
  dueDate?: Date;
  assignedTo?: string;
}

interface AuditRecommendation {
  id: string;
  findingId: string;
  priority: 'immediate' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  implementation: {
    steps: string[];
    estimatedEffort: string;
    resources: string[];
    timeline: string;
  };
  riskReduction: string;
  complianceImpact: string;
}

interface EvidenceGap {
  controlId: string;
  controlName: string;
  requiredEvidence: string[];
  missingEvidence: string[];
  alternativeEvidence: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendedActions: string[];
}

interface TrendAnalysis {
  timeframe: string;
  overallTrend: 'improving' | 'stable' | 'declining';
  controlTrends: ControlTrend[];
  industryBenchmarks: IndustryBenchmark[];
  seasonalPatterns: SeasonalPattern[];
  predictiveInsights: PredictiveInsight[];
}

interface ControlTrend {
  controlId: string;
  controlName: string;
  category: string;
  trend: 'improving' | 'stable' | 'declining';
  scoreHistory: Array<{
    date: Date;
    score: number;
    status: string;
  }>;
  changePoints: Array<{
    date: Date;
    description: string;
    impact: string;
  }>;
}

interface IndustryBenchmark {
  category: string;
  industryAverage: number;
  ourScore: number;
  percentile: number;
  trend: 'above' | 'at' | 'below';
  recommendations: string[];
}

interface SeasonalPattern {
  pattern: string;
  description: string;
  impactedControls: string[];
  mitigationStrategies: string[];
}

interface PredictiveInsight {
  insight: string;
  confidence: number;
  timeframe: string;
  potentialImpact: string;
  recommendedActions: string[];
}

export const EnhancedReportingDashboard: React.FC = () => {
  const [reports, setReports] = useState<AuditReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<AuditReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    to: new Date(),
  });
  const [selectedScope, setSelectedScope] = useState<string[]>(['security', 'availability', 'processing_integrity', 'confidentiality', 'privacy']);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/soc2/enhanced-reporting/reports');
      const data = await response.json();
      if (data.success) {
        setReports(data.reports);
        if (data.reports.length > 0 && !selectedReport) {
          setSelectedReport(data.reports[0]);
        }
      }
    } catch (error) {
      console.error('Error fetching reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateReport = async (reportType: string) => {
    setLoading(true);
    try {
      const endpoint = `/api/soc2/enhanced-reporting/generate/${reportType}`;
      const payload = {
        scope: selectedScope,
        ...(reportType === 'continuous' && { period: 'monthly' }),
        ...(reportType === 'gap_analysis' && { targetFramework: 'soc2_type2' }),
        options: {
          includeEvidence: true,
          includeTrends: true,
          format: 'json',
        },
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (data.success) {
        setSelectedReport(data.report);
        await fetchReports();
      }
    } catch (error) {
      console.error('Error generating report:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportReport = async (format: string) => {
    if (!selectedReport) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/soc2/enhanced-reporting/reports/${selectedReport.id}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format }),
      });

      const data = await response.json();
      if (data.success && data.downloadUrl) {
        window.open(data.downloadUrl, '_blank');
      }
    } catch (error) {
      console.error('Error exporting report:', error);
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'destructive';
      case 'high': return 'destructive';
      case 'medium': return 'warning';
      case 'low': return 'secondary';
      default: return 'secondary';
    }
  };

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'improving': return '#10b981';
      case 'declining': return '#ef4444';
      case 'stable': return '#6b7280';
      default: return '#6b7280';
    }
  };

  const formatChartData = (data: any[]) => {
    return data.map(item => ({
      ...item,
      date: format(new Date(item.date), 'MMM dd'),
    }));
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Enhanced SOC2 Reporting</h1>
          <p className="text-muted-foreground mt-1">
            Comprehensive audit preparation, trend analysis, and compliance reporting
          </p>
        </div>
        <div className="flex space-x-2">
          <Button
            variant="outline"
            onClick={() => generateReport('readiness')}
            disabled={loading}
          >
            <FileText className="w-4 h-4 mr-2" />
            Generate Readiness Report
          </Button>
          <Button
            variant="outline"
            onClick={() => generateReport('gap_analysis')}
            disabled={loading}
          >
            <Target className="w-4 h-4 mr-2" />
            Gap Analysis
          </Button>
          <Button
            variant="outline"
            onClick={() => generateReport('continuous')}
            disabled={loading}
          >
            <TrendingUp className="w-4 h-4 mr-2" />
            Continuous Monitoring
          </Button>
        </div>
      </div>

      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Filter className="w-5 h-5 mr-2" />
            Report Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium">Scope:</label>
              <Select value={selectedScope.join(',')} onValueChange={(value) => setSelectedScope(value.split(','))}>
                <SelectTrigger className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="security,availability,processing_integrity,confidentiality,privacy">
                    All Categories
                  </SelectItem>
                  <SelectItem value="security">Security Only</SelectItem>
                  <SelectItem value="availability">Availability Only</SelectItem>
                  <SelectItem value="processing_integrity">Processing Integrity Only</SelectItem>
                  <SelectItem value="confidentiality">Confidentiality Only</SelectItem>
                  <SelectItem value="privacy">Privacy Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium">Date Range:</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-64 justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(dateRange.from, 'MMM dd, yyyy')} - {format(dateRange.to, 'MMM dd, yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={dateRange.from}
                    selected={{ from: dateRange.from, to: dateRange.to }}
                    onSelect={(range) => range && setDateRange({ from: range.from!, to: range.to! })}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <Button variant="outline" onClick={fetchReports} disabled={loading}>
              <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Main Content */}
      {selectedReport && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="findings">Findings</TabsTrigger>
            <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
            <TabsTrigger value="trends">Trend Analysis</TabsTrigger>
            <TabsTrigger value="benchmarks">Benchmarks</TabsTrigger>
            <TabsTrigger value="export">Export</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Overall Score</p>
                      <p className="text-3xl font-bold">{selectedReport.summary.overallScore}%</p>
                    </div>
                    <div className={cn(
                      "w-12 h-12 rounded-full flex items-center justify-center",
                      selectedReport.summary.overallScore >= 80 ? "bg-green-100 text-green-600" :
                      selectedReport.summary.overallScore >= 60 ? "bg-yellow-100 text-yellow-600" :
                      "bg-red-100 text-red-600"
                    )}>
                      <Target className="w-6 h-6" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Total Findings</p>
                      <p className="text-3xl font-bold">{selectedReport.findings.length}</p>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                      <AlertTriangle className="w-6 h-6" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Critical Issues</p>
                      <p className="text-3xl font-bold">{selectedReport.summary.criticalFindings}</p>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
                      <Zap className="w-6 h-6" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Compliant Controls</p>
                      <p className="text-3xl font-bold">{selectedReport.summary.compliantControls}</p>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                      <CheckCircle className="w-6 h-6" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Findings by Severity Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Findings by Severity</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Critical', value: selectedReport.summary.criticalFindings, fill: '#ef4444' },
                        { name: 'High', value: selectedReport.summary.highRiskFindings, fill: '#f97316' },
                        { name: 'Medium', value: selectedReport.summary.mediumRiskFindings, fill: '#eab308' },
                        { name: 'Low', value: selectedReport.summary.lowRiskFindings, fill: '#22c55e' },
                      ]}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle>Report Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Report Type</p>
                    <p className="capitalize">{selectedReport.reportType.replace('_', ' ')}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Generated</p>
                    <p>{format(new Date(selectedReport.generatedAt), 'PPP pp')}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Period</p>
                    <p>
                      {format(new Date(selectedReport.period.startDate), 'MMM dd, yyyy')} -{' '}
                      {format(new Date(selectedReport.period.endDate), 'MMM dd, yyyy')}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Scope</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {selectedReport.scope.map((scope) => (
                        <Badge key={scope} variant="outline" className="text-xs">
                          {scope.replace('_', ' ')}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Findings Tab */}
          <TabsContent value="findings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Audit Findings ({selectedReport.findings.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {selectedReport.findings.map((finding) => (
                    <div key={finding.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-semibold">{finding.controlName}</h4>
                          <p className="text-sm text-muted-foreground">{finding.controlId} • {finding.category}</p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Badge variant={getSeverityColor(finding.severity)}>
                            {finding.severity}
                          </Badge>
                          <Badge variant="outline">
                            {finding.type.replace('_', ' ')}
                          </Badge>
                        </div>
                      </div>
                      <p className="text-sm">{finding.description}</p>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="font-medium">Impact:</p>
                          <p className="text-muted-foreground">{finding.impact}</p>
                        </div>
                        <div>
                          <p className="font-medium">Root Cause:</p>
                          <p className="text-muted-foreground">{finding.rootCause}</p>
                        </div>
                      </div>
                      {finding.dueDate && (
                        <div className="flex items-center text-sm text-muted-foreground">
                          <Clock className="w-4 h-4 mr-1" />
                          Due: {format(new Date(finding.dueDate), 'MMM dd, yyyy')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Recommendations Tab */}
          <TabsContent value="recommendations" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Recommendations ({selectedReport.recommendations.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {selectedReport.recommendations.map((rec) => (
                    <div key={rec.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <h4 className="font-semibold">{rec.title}</h4>
                        <Badge variant={rec.priority === 'immediate' ? 'destructive' : 
                                      rec.priority === 'high' ? 'destructive' :
                                      rec.priority === 'medium' ? 'warning' : 'secondary'}>
                          {rec.priority}
                        </Badge>
                      </div>
                      <p className="text-sm">{rec.description}</p>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="font-medium">Timeline:</p>
                          <p className="text-muted-foreground">{rec.implementation.timeline}</p>
                        </div>
                        <div>
                          <p className="font-medium">Estimated Effort:</p>
                          <p className="text-muted-foreground">{rec.implementation.estimatedEffort}</p>
                        </div>
                      </div>
                      <div>
                        <p className="font-medium text-sm">Implementation Steps:</p>
                        <ol className="list-decimal list-inside text-sm text-muted-foreground mt-1 space-y-1">
                          {rec.implementation.steps.map((step, index) => (
                            <li key={index}>{step}</li>
                          ))}
                        </ol>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Trends Tab */}
          <TabsContent value="trends" className="space-y-6">
            {selectedReport.trendAnalysis.controlTrends.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Control Performance Trends</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={400}>
                    <LineChart data={formatChartData(selectedReport.trendAnalysis.controlTrends[0]?.scoreHistory || [])}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="score"
                        stroke="#8884d8"
                        strokeWidth={2}
                        dot={{ fill: '#8884d8' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Predictive Insights</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {selectedReport.trendAnalysis.predictiveInsights.map((insight, index) => (
                    <div key={index} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-semibold">{insight.insight}</h4>
                        <Badge variant="outline">
                          {Math.round(insight.confidence * 100)}% confidence
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">{insight.potentialImpact}</p>
                      <div>
                        <p className="font-medium text-sm">Recommended Actions:</p>
                        <ul className="list-disc list-inside text-sm text-muted-foreground mt-1 space-y-1">
                          {insight.recommendedActions.map((action, actionIndex) => (
                            <li key={actionIndex}>{action}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Benchmarks Tab */}
          <TabsContent value="benchmarks" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Industry Benchmarks</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {selectedReport.trendAnalysis.industryBenchmarks.map((benchmark, index) => (
                    <div key={index} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold">{benchmark.category}</h4>
                        <Badge variant={benchmark.trend === 'above' ? 'default' : 
                                      benchmark.trend === 'at' ? 'secondary' : 'destructive'}>
                          {benchmark.trend} industry average
                        </Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-4 mb-3">
                        <div>
                          <p className="text-sm font-medium">Our Score</p>
                          <p className="text-2xl font-bold">{benchmark.ourScore}%</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium">Industry Average</p>
                          <p className="text-2xl font-bold">{benchmark.industryAverage}%</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium">Percentile</p>
                          <p className="text-2xl font-bold">{benchmark.percentile}th</p>
                        </div>
                      </div>
                      <div>
                        <p className="font-medium text-sm">Recommendations:</p>
                        <ul className="list-disc list-inside text-sm text-muted-foreground mt-1 space-y-1">
                          {benchmark.recommendations.map((rec, recIndex) => (
                            <li key={recIndex}>{rec}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Export Tab */}
          <TabsContent value="export" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Export Report</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Button
                    variant="outline"
                    onClick={() => exportReport('html')}
                    disabled={loading}
                    className="h-20 flex-col"
                  >
                    <FileText className="w-8 h-8 mb-2" />
                    HTML Report
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => exportReport('pdf')}
                    disabled={loading}
                    className="h-20 flex-col"
                  >
                    <FileDown className="w-8 h-8 mb-2" />
                    PDF Report
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => exportReport('docx')}
                    disabled={loading}
                    className="h-20 flex-col"
                  >
                    <FileText className="w-8 h-8 mb-2" />
                    Word Document
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => exportReport('xlsx')}
                    disabled={loading}
                    className="h-20 flex-col"
                  >
                    <BarChart3 className="w-8 h-8 mb-2" />
                    Excel Spreadsheet
                  </Button>
                </div>
                
                <div className="mt-6">
                  <h4 className="font-semibold mb-3">Report History</h4>
                  <div className="space-y-2">
                    {reports.slice(0, 5).map((report) => (
                      <div key={report.id} className="flex items-center justify-between p-3 border rounded">
                        <div>
                          <p className="font-medium">{report.reportType.replace('_', ' ')} Report</p>
                          <p className="text-sm text-muted-foreground">
                            Generated {format(new Date(report.generatedAt), 'MMM dd, yyyy')}
                          </p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedReport(report)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => exportReport('html')}
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Loading State */}
      {loading && (
        <Card>
          <CardContent className="p-12">
            <div className="flex items-center justify-center space-x-2">
              <RefreshCw className="w-6 h-6 animate-spin" />
              <p>Processing request...</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};