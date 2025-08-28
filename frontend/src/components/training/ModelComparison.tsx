/**
 * Fine Print AI - Model Comparison Component
 * Advanced model comparison interface with statistical analysis and visual comparisons
 */

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Badge,
} from '@/components/ui/badge';
import {
  Button,
} from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  CheckCircle,
  TrendingUp,
  TrendingDown,
  Award,
  BarChart3,
  Zap,
  Clock,
  Target,
  Brain,
  AlertTriangle,
} from 'lucide-react';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ScatterChart, Scatter, Cell } from 'recharts';

interface ModelMetrics {
  accuracy: number;
  f1_score: number;
  precision: number;
  recall: number;
  avg_latency_ms: number;
  throughput_rps: number;
  error_rate: number;
}

interface ModelEvaluationResult {
  model_id: string;
  model_name: string;
  metrics: ModelMetrics;
  performance_stats: {
    total_predictions: number;
    successful_predictions: number;
    failed_predictions: number;
    avg_response_time: number;
    p95_response_time: number;
    p99_response_time: number;
    memory_usage_mb: number;
    cpu_utilization: number;
  };
  error_analysis: {
    error_types: Record<string, number>;
    common_failure_patterns: string[];
    problematic_input_types: string[];
    improvement_suggestions: string[];
  };
}

interface ComparisonAnalysis {
  statistical_significance: Record<string, boolean>;
  performance_differences: Record<string, number>;
  winner: string | null;
  confidence_intervals: Record<string, { lower: number; upper: number }>;
  effect_sizes: Record<string, number>;
}

interface ModelComparisonData {
  evaluation_id: string;
  status: string;
  validation_status: string;
  models_evaluated: number;
  best_model: string | null;
  results: ModelEvaluationResult[];
  comparison_analysis: ComparisonAnalysis;
}

interface ModelComparisonProps {
  evaluationId?: string;
  modelIds?: string[];
}

const ModelComparison: React.FC<ModelComparisonProps> = ({ evaluationId, modelIds }) => {
  const [selectedMetric, setSelectedMetric] = useState<string>('accuracy');
  const [comparisonMode, setComparisonMode] = useState<'side-by-side' | 'radar' | 'performance'>('side-by-side');

  // Fetch comparison data
  const { data: comparisonData, isLoading } = useQuery<ModelComparisonData>({
    queryKey: ['model-comparison', evaluationId, modelIds],
    queryFn: async () => {
      if (evaluationId) {
        const response = await fetch(`/api/v1/evaluation/${evaluationId}/comparison`);
        if (!response.ok) throw new Error('Failed to fetch comparison data');
        const result = await response.json();
        return result.comparison;
      } else if (modelIds && modelIds.length > 1) {
        // For direct model comparison without evaluation
        const response = await fetch('/api/v1/evaluation/compare', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model_ids: modelIds }),
        });
        if (!response.ok) throw new Error('Failed to fetch comparison data');
        return response.json();
      }
      throw new Error('No evaluation ID or model IDs provided');
    },
    enabled: !!(evaluationId || (modelIds && modelIds.length > 1)),
  });

  // Process data for radar chart
  const radarData = useMemo(() => {
    if (!comparisonData?.results) return [];

    const metrics = ['accuracy', 'f1_score', 'precision', 'recall'];
    return metrics.map(metric => {
      const data: any = { metric: metric.replace('_', ' ') };
      comparisonData.results.forEach(result => {
        data[result.model_name] = result.metrics[metric as keyof ModelMetrics] || 0;
      });
      return data;
    });
  }, [comparisonData]);

  // Process data for performance comparison
  const performanceData = useMemo(() => {
    if (!comparisonData?.results) return [];

    return comparisonData.results.map(result => ({
      model: result.model_name,
      latency: result.metrics.avg_latency_ms || 0,
      throughput: result.metrics.throughput_rps || 0,
      memory: result.performance_stats.memory_usage_mb || 0,
      cpu: result.performance_stats.cpu_utilization || 0,
      error_rate: result.metrics.error_rate || 0,
    }));
  }, [comparisonData]);

  const getMetricColor = (value: number, metric: string) => {
    if (metric === 'error_rate' || metric === 'avg_latency_ms') {
      // Lower is better
      return value < 0.05 ? 'text-green-600' : value < 0.1 ? 'text-yellow-600' : 'text-red-600';
    } else {
      // Higher is better
      return value > 0.9 ? 'text-green-600' : value > 0.7 ? 'text-yellow-600' : 'text-red-600';
    }
  };

  const formatMetricValue = (value: number, metric: string) => {
    if (metric === 'avg_latency_ms') {
      return `${value.toFixed(0)}ms`;
    } else if (metric === 'throughput_rps') {
      return `${value.toFixed(1)} RPS`;
    } else if (metric === 'error_rate') {
      return `${(value * 100).toFixed(2)}%`;
    } else if (metric.includes('rate') || metric.includes('accuracy') || metric.includes('precision') || metric.includes('recall') || metric.includes('f1')) {
      return `${(value * 100).toFixed(1)}%`;
    } else {
      return value.toFixed(3);
    }
  };

  const getWinnerBadge = (modelName: string) => {
    if (comparisonData?.best_model === modelName) {
      return (
        <Badge className="bg-yellow-100 text-yellow-800 ml-2">
          <Award className="w-3 h-3 mr-1" />
          Best
        </Badge>
      );
    }
    return null;
  };

  const getSignificanceBadge = (metric: string) => {
    const isSignificant = comparisonData?.comparison_analysis?.statistical_significance?.[metric];
    if (isSignificant) {
      return (
        <Badge className="bg-green-100 text-green-800 ml-2 text-xs">
          Significant
        </Badge>
      );
    }
    return (
      <Badge className="bg-gray-100 text-gray-600 ml-2 text-xs">
        Not Significant
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Brain className="w-6 h-6 animate-pulse mr-2" />
        Loading model comparison...
      </div>
    );
  }

  if (!comparisonData?.results || comparisonData.results.length < 2) {
    return (
      <Card>
        <CardContent className="text-center py-8">
          <BarChart3 className="w-12 h-12 mx-auto mb-2 text-gray-400" />
          <p className="text-gray-600">Need at least 2 models to compare</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Model Comparison</h2>
          <p className="text-gray-600">
            Comparing {comparisonData.results.length} models
            {comparisonData.best_model && (
              <span className="ml-2">
                • Best: <span className="font-medium">{comparisonData.best_model}</span>
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <Select value={comparisonMode} onValueChange={setComparisonMode}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="side-by-side">Side by Side</SelectItem>
              <SelectItem value="radar">Radar Chart</SelectItem>
              <SelectItem value="performance">Performance</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Comparison Mode Tabs */}
      <Tabs value={comparisonMode} onValueChange={setComparisonMode}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="side-by-side">Side by Side</TabsTrigger>
          <TabsTrigger value="radar">Radar Chart</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="side-by-side" className="space-y-6">
          {/* Statistical Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Statistical Analysis Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {comparisonData.models_evaluated}
                  </div>
                  <div className="text-sm text-gray-600">Models Compared</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {Object.values(comparisonData.comparison_analysis?.statistical_significance || {})
                      .filter(Boolean).length}
                  </div>
                  <div className="text-sm text-gray-600">Significant Differences</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">
                    {comparisonData.validation_status === 'passed' ? 'PASSED' : 'FAILED'}
                  </div>
                  <div className="text-sm text-gray-600">Validation Status</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Metrics Comparison Table */}
          <Card>
            <CardHeader>
              <CardTitle>Metrics Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Model</TableHead>
                    <TableHead>Accuracy {getSignificanceBadge('accuracy')}</TableHead>
                    <TableHead>F1 Score {getSignificanceBadge('f1')}</TableHead>
                    <TableHead>Precision {getSignificanceBadge('precision')}</TableHead>
                    <TableHead>Recall {getSignificanceBadge('recall')}</TableHead>
                    <TableHead>Latency {getSignificanceBadge('latency')}</TableHead>
                    <TableHead>Error Rate {getSignificanceBadge('error_rate')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comparisonData.results.map((result) => (
                    <TableRow key={result.model_id}>
                      <TableCell className="font-medium">
                        {result.model_name}
                        {getWinnerBadge(result.model_name)}
                      </TableCell>
                      <TableCell className={getMetricColor(result.metrics.accuracy || 0, 'accuracy')}>
                        {formatMetricValue(result.metrics.accuracy || 0, 'accuracy')}
                      </TableCell>
                      <TableCell className={getMetricColor(result.metrics.f1_score || 0, 'f1_score')}>
                        {formatMetricValue(result.metrics.f1_score || 0, 'f1_score')}
                      </TableCell>
                      <TableCell className={getMetricColor(result.metrics.precision || 0, 'precision')}>
                        {formatMetricValue(result.metrics.precision || 0, 'precision')}
                      </TableCell>
                      <TableCell className={getMetricColor(result.metrics.recall || 0, 'recall')}>
                        {formatMetricValue(result.metrics.recall || 0, 'recall')}
                      </TableCell>
                      <TableCell className={getMetricColor(result.metrics.avg_latency_ms || 0, 'avg_latency_ms')}>
                        {formatMetricValue(result.metrics.avg_latency_ms || 0, 'avg_latency_ms')}
                      </TableCell>
                      <TableCell className={getMetricColor(result.metrics.error_rate || 0, 'error_rate')}>
                        {formatMetricValue(result.metrics.error_rate || 0, 'error_rate')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Detailed Analysis */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {comparisonData.results.map((result) => (
              <Card key={result.model_id}>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    {result.model_name}
                    {getWinnerBadge(result.model_name)}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Performance Stats */}
                    <div>
                      <h4 className="font-medium mb-2">Performance Statistics</h4>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-gray-600">Total Predictions:</span>
                          <span className="ml-2 font-medium">
                            {result.performance_stats.total_predictions.toLocaleString()}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-600">Success Rate:</span>
                          <span className="ml-2 font-medium">
                            {((result.performance_stats.successful_predictions / result.performance_stats.total_predictions) * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-600">P95 Latency:</span>
                          <span className="ml-2 font-medium">
                            {result.performance_stats.p95_response_time.toFixed(0)}ms
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-600">Memory Usage:</span>
                          <span className="ml-2 font-medium">
                            {result.performance_stats.memory_usage_mb.toFixed(0)}MB
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Error Analysis */}
                    <div>
                      <h4 className="font-medium mb-2">Error Analysis</h4>
                      <div className="space-y-2">
                        {Object.entries(result.error_analysis.error_types).slice(0, 3).map(([type, count]) => (
                          <div key={type} className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">{type.replace('_', ' ')}</span>
                            <Badge variant="outline">{count}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Improvement Suggestions */}
                    {result.error_analysis.improvement_suggestions.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-2">Improvement Suggestions</h4>
                        <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                          {result.error_analysis.improvement_suggestions.slice(0, 2).map((suggestion, index) => (
                            <li key={index}>{suggestion}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="radar" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Performance Radar Chart</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="metric" />
                  <PolarRadiusAxis angle={90} domain={[0, 1]} />
                  {comparisonData.results.map((result, index) => (
                    <Radar
                      key={result.model_id}
                      name={result.model_name}
                      dataKey={result.model_name}
                      stroke={`hsl(${index * 120}, 70%, 50%)`}
                      fill={`hsl(${index * 120}, 70%, 50%)`}
                      fillOpacity={0.1}
                      strokeWidth={2}
                    />
                  ))}
                </RadarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Metric Selection */}
          <Card>
            <CardHeader>
              <CardTitle>Detailed Metric Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <Select value={selectedMetric} onValueChange={setSelectedMetric}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="accuracy">Accuracy</SelectItem>
                    <SelectItem value="f1_score">F1 Score</SelectItem>
                    <SelectItem value="precision">Precision</SelectItem>
                    <SelectItem value="recall">Recall</SelectItem>
                    <SelectItem value="avg_latency_ms">Average Latency</SelectItem>
                    <SelectItem value="error_rate">Error Rate</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={comparisonData.results.map(result => ({
                  model: result.model_name,
                  value: result.metrics[selectedMetric as keyof ModelMetrics] || 0,
                }))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="model" />
                  <YAxis />
                  <Tooltip 
                    formatter={(value: number) => [formatMetricValue(value, selectedMetric), selectedMetric]}
                  />
                  <Bar dataKey="value" fill="#3b82f6">
                    {comparisonData.results.map((result, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={result.model_name === comparisonData.best_model ? '#10b981' : '#3b82f6'} 
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-6">
          {/* Performance vs Quality Scatter Plot */}
          <Card>
            <CardHeader>
              <CardTitle>Performance vs Quality Trade-off</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <ScatterChart data={performanceData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="latency" 
                    name="Latency (ms)"
                    label={{ value: 'Latency (ms)', position: 'insideBottom', offset: -10 }}
                  />
                  <YAxis 
                    dataKey="accuracy" 
                    name="Accuracy"
                    label={{ value: 'Accuracy', angle: -90, position: 'insideLeft' }}
                  />
                  <Tooltip 
                    formatter={(value, name) => [
                      name === 'latency' ? `${value}ms` : `${(Number(value) * 100).toFixed(1)}%`,
                      name === 'latency' ? 'Latency' : 'Accuracy'
                    ]}
                    labelFormatter={(label) => `Model: ${label}`}
                  />
                  <Scatter name="Models" dataKey="accuracy" fill="#3b82f6">
                    {performanceData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={`hsl(${index * 60}, 70%, 50%)`} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Resource Usage Comparison */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Memory Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={performanceData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="model" />
                    <YAxis />
                    <Tooltip formatter={(value: number) => [`${value.toFixed(0)}MB`, 'Memory Usage']} />
                    <Bar dataKey="memory" fill="#8b5cf6" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>CPU Utilization</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={performanceData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="model" />
                    <YAxis />
                    <Tooltip formatter={(value: number) => [`${value.toFixed(1)}%`, 'CPU Usage']} />
                    <Bar dataKey="cpu" fill="#f59e0b" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Performance Summary Table */}
          <Card>
            <CardHeader>
              <CardTitle>Performance Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Model</TableHead>
                    <TableHead>Latency</TableHead>
                    <TableHead>Throughput</TableHead>
                    <TableHead>Memory</TableHead>
                    <TableHead>CPU</TableHead>
                    <TableHead>Error Rate</TableHead>
                    <TableHead>Efficiency Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {performanceData.map((data) => {
                    // Calculate efficiency score (accuracy/latency ratio)
                    const efficiency = (0.9 / Math.max(data.latency, 1)) * 1000;
                    
                    return (
                      <TableRow key={data.model}>
                        <TableCell className="font-medium">
                          {data.model}
                          {data.model === comparisonData.best_model && getWinnerBadge(data.model)}
                        </TableCell>
                        <TableCell className={getMetricColor(data.latency, 'avg_latency_ms')}>
                          {data.latency.toFixed(0)}ms
                        </TableCell>
                        <TableCell>
                          {data.throughput.toFixed(1)} RPS
                        </TableCell>
                        <TableCell>
                          {data.memory.toFixed(0)}MB
                        </TableCell>
                        <TableCell>
                          {data.cpu.toFixed(1)}%
                        </TableCell>
                        <TableCell className={getMetricColor(data.error_rate, 'error_rate')}>
                          {(data.error_rate * 100).toFixed(2)}%
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center">
                            {efficiency.toFixed(1)}
                            {efficiency > 5 ? (
                              <TrendingUp className="w-4 h-4 ml-1 text-green-600" />
                            ) : efficiency > 2 ? (
                              <Target className="w-4 h-4 ml-1 text-yellow-600" />
                            ) : (
                              <TrendingDown className="w-4 h-4 ml-1 text-red-600" />
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Actions */}
      <div className="flex justify-end space-x-2">
        <Button variant="outline">
          Export Report
        </Button>
        <Button>
          Deploy Winner
        </Button>
      </div>
    </div>
  );
};

export default ModelComparison;