/**
 * Fine Print AI - A/B Test Dashboard Component
 * Comprehensive A/B testing interface with real-time monitoring and statistical analysis
 */

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  Progress,
} from '@/components/ui/progress';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Play,
  Pause,
  Square,
  TrendingUp,
  TrendingDown,
  Target,
  Users,
  Clock,
  Award,
  AlertTriangle,
  CheckCircle,
  BarChart3,
  Activity,
  Eye,
  Settings,
} from 'lucide-react';
import { format, differenceInHours } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';

interface ABTestVariant {
  id: string;
  model_name: string;
  is_control: boolean;
  sample_size: number;
  traffic_percentage: number;
  metrics: {
    accuracy: number;
    avg_response_time: number;
    error_rate: number;
    user_satisfaction: number;
    conversion_rate: number;
    confidence_intervals: Record<string, { lower: number; upper: number }>;
  };
}

interface ABTestResults {
  test_summary: {
    id: string;
    name: string;
    status: string;
    duration_hours: number | null;
    total_sample_size: number;
  };
  variants: ABTestVariant[];
  overall_metrics: {
    total_requests: number;
    successful_requests: number;
    failed_requests: number;
    avg_response_time: number;
    p95_response_time: number;
    conversion_rate: number;
    user_satisfaction_score: number;
  };
  statistical_analysis: {
    is_significant: boolean;
    p_value: number;
    effect_size: number;
    confidence_interval: { lower: number; upper: number };
    statistical_power: number;
    required_sample_size: number;
    bayesian_probability: number;
  } | null;
  winner: string | null;
  confidence_level: number;
  raw_data_points: number;
}

interface ABTest {
  id: string;
  name: string;
  status: 'draft' | 'running' | 'completed' | 'stopped' | 'failed';
  variants: number;
  current_sample_size: number;
  winner?: string;
  confidence_level?: number;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  estimated_completion?: string;
}

interface PerformanceData {
  metric: string;
  interval: string;
  variants: Array<{
    variant_name: string;
    is_control: boolean;
    data_points: Array<{
      timestamp: string;
      value: number;
      sample_count: number;
    }>;
  }>;
}

const ABTestDashboard: React.FC = () => {
  const queryClient = useQueryClient();
  const [selectedTest, setSelectedTest] = useState<string | null>(null);
  const [selectedMetric, setSelectedMetric] = useState('conversion_rate');

  // Fetch A/B tests
  const { data: testsData, isLoading: testsLoading } = useQuery({
    queryKey: ['ab-tests'],
    queryFn: async () => {
      const response = await fetch('/api/v1/experiments');
      if (!response.ok) throw new Error('Failed to fetch A/B tests');
      return response.json();
    },
    refetchInterval: 5000, // Refresh every 5 seconds for running tests
  });

  // Fetch detailed results for selected test
  const { data: testResults, isLoading: resultsLoading } = useQuery<ABTestResults>({
    queryKey: ['ab-test-results', selectedTest],
    queryFn: async () => {
      if (!selectedTest) return null;
      const response = await fetch(`/api/v1/experiments/${selectedTest}/results`);
      if (!response.ok) throw new Error('Failed to fetch test results');
      const result = await response.json();
      return result.results;
    },
    enabled: !!selectedTest,
    refetchInterval: selectedTest ? 3000 : false, // Refresh every 3 seconds if test is selected
  });

  // Fetch performance data
  const { data: performanceData } = useQuery<PerformanceData>({
    queryKey: ['ab-test-performance', selectedTest, selectedMetric],
    queryFn: async () => {
      if (!selectedTest) return null;
      const response = await fetch(`/api/v1/experiments/${selectedTest}/performance?metric=${selectedMetric}`);
      if (!response.ok) throw new Error('Failed to fetch performance data');
      const result = await response.json();
      return result.performance_data;
    },
    enabled: !!selectedTest,
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Mutations for test actions
  const startTestMutation = useMutation({
    mutationFn: async (testId: string) => {
      const response = await fetch(`/api/v1/experiments/${testId}/start`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to start test');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ab-tests'] });
    },
  });

  const stopTestMutation = useMutation({
    mutationFn: async ({ testId, reason }: { testId: string; reason?: string }) => {
      const response = await fetch(`/api/v1/experiments/${testId}/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || 'Manual stop' }),
      });
      if (!response.ok) throw new Error('Failed to stop test');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ab-tests'] });
    },
  });

  const getStatusBadge = (status: string) => {
    const configs = {
      running: { color: 'bg-blue-100 text-blue-800', icon: Activity },
      completed: { color: 'bg-green-100 text-green-800', icon: CheckCircle },
      stopped: { color: 'bg-yellow-100 text-yellow-800', icon: Pause },
      failed: { color: 'bg-red-100 text-red-800', icon: AlertTriangle },
      draft: { color: 'bg-gray-100 text-gray-800', icon: Clock },
    };

    const config = configs[status as keyof typeof configs] || configs.draft;
    const Icon = config.icon;

    return (
      <Badge className={config.color}>
        <Icon className="w-3 h-3 mr-1" />
        {status}
      </Badge>
    );
  };

  const getSignificanceBadge = (isSignificant: boolean, pValue: number) => {
    if (isSignificant) {
      return (
        <Badge className="bg-green-100 text-green-800">
          <CheckCircle className="w-3 h-3 mr-1" />
          Significant (p={pValue.toFixed(4)})
        </Badge>
      );
    } else {
      return (
        <Badge className="bg-gray-100 text-gray-600">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Not Significant (p={pValue.toFixed(4)})
        </Badge>
      );
    }
  };

  const formatMetricValue = (value: number, metric: string) => {
    if (metric.includes('rate') || metric.includes('accuracy') || metric.includes('satisfaction')) {
      return `${(value * 100).toFixed(1)}%`;
    } else if (metric.includes('time')) {
      return `${value.toFixed(0)}ms`;
    } else {
      return value.toFixed(3);
    }
  };

  const calculateProgress = (test: ABTest) => {
    if (test.status === 'completed') return 100;
    if (test.status === 'draft') return 0;
    
    // Estimate progress based on sample size (assuming 1000 is target)
    return Math.min((test.current_sample_size / 1000) * 100, 95);
  };

  // Generate chart data for performance over time
  const generatePerformanceChartData = () => {
    if (!performanceData) return [];
    
    const timePoints = new Set<string>();
    performanceData.variants.forEach(variant => {
      variant.data_points.forEach(point => {
        timePoints.add(point.timestamp);
      });
    });

    return Array.from(timePoints).sort().map(timestamp => {
      const dataPoint: any = { timestamp: format(new Date(timestamp), 'HH:mm') };
      
      performanceData.variants.forEach(variant => {
        const point = variant.data_points.find(p => p.timestamp === timestamp);
        dataPoint[variant.variant_name] = point?.value || 0;
      });
      
      return dataPoint;
    });
  };

  const chartData = generatePerformanceChartData();

  if (testsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Activity className="w-6 h-6 animate-spin mr-2" />
        Loading A/B tests...
      </div>
    );
  }

  const tests: ABTest[] = testsData?.tests || [];
  const runningTests = tests.filter(t => t.status === 'running');
  const completedTests = tests.filter(t => t.status === 'completed');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">A/B Test Dashboard</h2>
          <p className="text-gray-600">
            {runningTests.length} running • {completedTests.length} completed
          </p>
        </div>
        <Button>
          <Play className="w-4 h-4 mr-2" />
          New A/B Test
        </Button>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Activity className="w-4 h-4 text-blue-600" />
              <div>
                <div className="text-2xl font-bold">{runningTests.length}</div>
                <div className="text-xs text-gray-600">Running Tests</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <div>
                <div className="text-2xl font-bold">{completedTests.length}</div>
                <div className="text-xs text-gray-600">Completed</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Users className="w-4 h-4 text-purple-600" />
              <div>
                <div className="text-2xl font-bold">
                  {runningTests.reduce((sum, test) => sum + test.current_sample_size, 0).toLocaleString()}
                </div>
                <div className="text-xs text-gray-600">Active Users</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Award className="w-4 h-4 text-yellow-600" />
              <div>
                <div className="text-2xl font-bold">
                  {completedTests.filter(t => t.winner).length}
                </div>
                <div className="text-xs text-gray-600">With Winners</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tests Table */}
      <Card>
        <CardHeader>
          <CardTitle>All A/B Tests</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Test Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Variants</TableHead>
                <TableHead>Sample Size</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Winner</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tests.map((test) => (
                <TableRow key={test.id}>
                  <TableCell className="font-medium">{test.name}</TableCell>
                  <TableCell>{getStatusBadge(test.status)}</TableCell>
                  <TableCell>{test.variants}</TableCell>
                  <TableCell>{test.current_sample_size.toLocaleString()}</TableCell>
                  <TableCell>
                    {test.started_at ? (
                      <span>
                        {differenceInHours(
                          test.completed_at ? new Date(test.completed_at) : new Date(),
                          new Date(test.started_at)
                        )}h
                      </span>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell>
                    {test.winner ? (
                      <Badge className="bg-green-100 text-green-800">
                        <Award className="w-3 h-3 mr-1" />
                        {test.winner}
                      </Badge>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell>
                    {test.confidence_level ? `${(test.confidence_level * 100).toFixed(1)}%` : '-'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      <Progress value={calculateProgress(test)} className="w-20 h-2" />
                      <span className="text-xs text-gray-600">
                        {calculateProgress(test).toFixed(0)}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-1">
                      {test.status === 'draft' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => startTestMutation.mutate(test.id)}
                          disabled={startTestMutation.isPending}
                        >
                          <Play className="w-3 h-3" />
                        </Button>
                      )}
                      {test.status === 'running' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => stopTestMutation.mutate({ testId: test.id })}
                          disabled={stopTestMutation.isPending}
                        >
                          <Square className="w-3 h-3" />
                        </Button>
                      )}
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedTest(test.id)}
                          >
                            <Eye className="w-3 h-3" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>{test.name} - Detailed Results</DialogTitle>
                          </DialogHeader>
                          {selectedTest === test.id && (
                            <ABTestDetailsView 
                              testResults={testResults} 
                              performanceData={performanceData}
                              selectedMetric={selectedMetric}
                              onMetricChange={setSelectedMetric}
                              isLoading={resultsLoading}
                            />
                          )}
                        </DialogContent>
                      </Dialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Running Tests Detail */}
      {runningTests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Running Tests - Live Monitoring</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {runningTests.slice(0, 4).map((test) => (
                <Card key={test.id} className="border-blue-200">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{test.name}</CardTitle>
                      <div className="flex items-center text-blue-600 text-sm">
                        <Activity className="w-4 h-4 mr-1 animate-pulse" />
                        Live
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Sample Size Progress</span>
                        <span className="text-sm font-medium">
                          {test.current_sample_size.toLocaleString()} / 1,000
                        </span>
                      </div>
                      <Progress value={calculateProgress(test)} className="h-2" />
                      
                      {test.estimated_completion && (
                        <div className="text-xs text-gray-600">
                          Est. completion: {format(new Date(test.estimated_completion), 'MMM dd, HH:mm')}
                        </div>
                      )}
                      
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Variants:</span>
                        <span className="font-medium">{test.variants}</span>
                      </div>
                      
                      {test.started_at && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Running for:</span>
                          <span className="font-medium">
                            {differenceInHours(new Date(), new Date(test.started_at))}h
                          </span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// Detailed view component for individual A/B test results
const ABTestDetailsView: React.FC<{
  testResults: ABTestResults | undefined;
  performanceData: PerformanceData | undefined;
  selectedMetric: string;
  onMetricChange: (metric: string) => void;
  isLoading: boolean;
}> = ({ testResults, performanceData, selectedMetric, onMetricChange, isLoading }) => {
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Activity className="w-6 h-6 animate-spin mr-2" />
        Loading test results...
      </div>
    );
  }

  if (!testResults) {
    return <div>No test results available</div>;
  }

  // Generate chart data for performance over time
  const generatePerformanceChartData = () => {
    if (!performanceData) return [];
    
    const timePoints = new Set<string>();
    performanceData.variants.forEach(variant => {
      variant.data_points.forEach(point => {
        timePoints.add(point.timestamp);
      });
    });

    return Array.from(timePoints).sort().map(timestamp => {
      const dataPoint: any = { timestamp: format(new Date(timestamp), 'HH:mm') };
      
      performanceData.variants.forEach(variant => {
        const point = variant.data_points.find(p => p.timestamp === timestamp);
        dataPoint[variant.variant_name] = point?.value || 0;
      });
      
      return dataPoint;
    });
  };

  const chartData = generatePerformanceChartData();
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">
              {testResults.test_summary.total_sample_size.toLocaleString()}
            </div>
            <div className="text-xs text-gray-600">Total Sample Size</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">
              {testResults.test_summary.duration_hours ? `${testResults.test_summary.duration_hours.toFixed(1)}h` : 'Ongoing'}
            </div>
            <div className="text-xs text-gray-600">Duration</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-purple-600">
              {testResults.variants.length}
            </div>
            <div className="text-xs text-gray-600">Variants</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-orange-600">
              {testResults.statistical_analysis ? 
                `${(testResults.statistical_analysis.statistical_power * 100).toFixed(0)}%` : 
                'N/A'
              }
            </div>
            <div className="text-xs text-gray-600">Statistical Power</div>
          </CardContent>
        </Card>
      </div>

      {/* Statistical Analysis */}
      {testResults.statistical_analysis && (
        <Card>
          <CardHeader>
            <CardTitle>Statistical Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Statistical Significance:</span>
                  {testResults.statistical_analysis.is_significant ? (
                    <Badge className="bg-green-100 text-green-800">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Significant
                    </Badge>
                  ) : (
                    <Badge className="bg-gray-100 text-gray-600">
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      Not Significant
                    </Badge>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-medium">P-Value:</span>
                  <span className="font-mono">
                    {testResults.statistical_analysis.p_value.toFixed(4)}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-medium">Effect Size:</span>
                  <span className="font-mono">
                    {testResults.statistical_analysis.effect_size.toFixed(4)}
                  </span>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Bayesian Probability:</span>
                  <span className="font-mono">
                    {(testResults.statistical_analysis.bayesian_probability * 100).toFixed(1)}%
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-medium">Required Sample Size:</span>
                  <span className="font-mono">
                    {testResults.statistical_analysis.required_sample_size.toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-medium">Winner:</span>
                  {testResults.winner ? (
                    <Badge className="bg-green-100 text-green-800">
                      <Award className="w-3 h-3 mr-1" />
                      {testResults.winner}
                    </Badge>
                  ) : (
                    <span className="text-gray-600">No clear winner</span>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Variants Comparison */}
      <Card>
        <CardHeader>
          <CardTitle>Variant Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Variant</TableHead>
                <TableHead>Sample Size</TableHead>
                <TableHead>Conversion Rate</TableHead>
                <TableHead>Avg Response Time</TableHead>
                <TableHead>Error Rate</TableHead>
                <TableHead>User Satisfaction</TableHead>
                <TableHead>Traffic %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {testResults.variants.map((variant, index) => (
                <TableRow key={variant.id} className={variant.is_control ? 'bg-blue-50' : ''}>
                  <TableCell className="font-medium">
                    {variant.model_name}
                    {variant.is_control && (
                      <Badge className="ml-2 bg-blue-100 text-blue-800">Control</Badge>
                    )}
                    {testResults.winner === variant.model_name && (
                      <Badge className="ml-2 bg-green-100 text-green-800">
                        <Award className="w-3 h-3 mr-1" />
                        Winner
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{variant.sample_size.toLocaleString()}</TableCell>
                  <TableCell>
                    <div className="flex items-center">
                      {(variant.metrics.conversion_rate * 100).toFixed(2)}%
                      {variant.metrics.confidence_intervals.conversion_rate && (
                        <span className="ml-2 text-xs text-gray-500">
                          ± {((variant.metrics.confidence_intervals.conversion_rate.upper - variant.metrics.confidence_intervals.conversion_rate.lower) * 50).toFixed(2)}%
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{variant.metrics.avg_response_time.toFixed(0)}ms</TableCell>
                  <TableCell>
                    <span className={variant.metrics.error_rate < 0.05 ? 'text-green-600' : 'text-red-600'}>
                      {(variant.metrics.error_rate * 100).toFixed(2)}%
                    </span>
                  </TableCell>
                  <TableCell>{(variant.metrics.user_satisfaction * 100).toFixed(1)}%</TableCell>
                  <TableCell>{variant.traffic_percentage.toFixed(1)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Performance Over Time */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Performance Over Time
              <select
                value={selectedMetric}
                onChange={(e) => onMetricChange(e.target.value)}
                className="text-sm border rounded px-2 py-1"
              >
                <option value="conversion_rate">Conversion Rate</option>
                <option value="response_time">Response Time</option>
                <option value="accuracy">Accuracy</option>
                <option value="error_rate">Error Rate</option>
              </select>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="timestamp" />
                <YAxis />
                <Tooltip />
                {testResults.variants.map((variant, index) => (
                  <Line
                    key={variant.id}
                    type="monotone"
                    dataKey={variant.model_name}
                    stroke={colors[index % colors.length]}
                    strokeWidth={variant.is_control ? 3 : 2}
                    strokeDasharray={variant.is_control ? "0" : "5 5"}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ABTestDashboard;