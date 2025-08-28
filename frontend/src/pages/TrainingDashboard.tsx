/**
 * Fine Print AI - Training Dashboard
 * Comprehensive interface for monitoring ML training pipelines, datasets, and model evaluation
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Button,
} from '@/components/ui/button';
import {
  Badge,
} from '@/components/ui/badge';
import {
  Progress,
} from '@/components/ui/progress';
import {
  Alert,
  AlertCircle,
  CheckCircle,
  Clock,
  Play,
  Pause,
  BarChart3,
  Brain,
  Database,
  TrendingUp,
  Settings,
  Download,
  RefreshCw,
} from 'lucide-react';
import { format } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

// Types
interface TrainingPipeline {
  id: string;
  name: string;
  status: 'pending' | 'dataset_generation' | 'model_training' | 'evaluation' | 'deployment' | 'completed' | 'failed';
  current_stage: string;
  progress: number;
  dataset_id?: string;
  model_id?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  evaluation_results?: any;
}

interface Dataset {
  id: string;
  name: string;
  status: 'generating' | 'completed' | 'failed';
  statistics: {
    total_examples: number;
    train_examples: number;
    validation_examples: number;
    test_examples: number;
    quality_score: number;
  };
  config: {
    task_type: string;
    jurisdiction: string;
  };
  created_at: string;
}

interface ModelEvaluation {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  validation_status: 'passed' | 'failed' | 'pending';
  model_count: number;
  created_at: string;
  completed_at?: string;
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
}

// API functions
const trainingAPI = {
  getPipelines: async (): Promise<{ pipelines: TrainingPipeline[]; total: number }> => {
    const response = await fetch('/api/v1/pipelines');
    if (!response.ok) throw new Error('Failed to fetch pipelines');
    return response.json();
  },

  getDatasets: async (): Promise<{ datasets: Dataset[]; total: number }> => {
    const response = await fetch('/api/v1/datasets');
    if (!response.ok) throw new Error('Failed to fetch datasets');
    return response.json();
  },

  getEvaluations: async (): Promise<{ evaluations: ModelEvaluation[]; total: number }> => {
    const response = await fetch('/api/v1/evaluation');
    if (!response.ok) throw new Error('Failed to fetch evaluations');
    return response.json();
  },

  getABTests: async (): Promise<{ tests: ABTest[]; total: number }> => {
    const response = await fetch('/api/v1/experiments');
    if (!response.ok) throw new Error('Failed to fetch A/B tests');
    return response.json();
  },

  startPipeline: async (pipelineId: string) => {
    const response = await fetch(`/api/v1/pipelines/${pipelineId}/start`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to start pipeline');
    return response.json();
  },

  cancelPipeline: async (pipelineId: string) => {
    const response = await fetch(`/api/v1/pipelines/${pipelineId}/cancel`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to cancel pipeline');
    return response.json();
  },
};

// Status badge component
const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'completed':
        return { color: 'bg-green-100 text-green-800', icon: CheckCircle };
      case 'running':
      case 'dataset_generation':
      case 'model_training':
      case 'evaluation':
        return { color: 'bg-blue-100 text-blue-800', icon: Clock };
      case 'failed':
        return { color: 'bg-red-100 text-red-800', icon: AlertCircle };
      case 'pending':
        return { color: 'bg-gray-100 text-gray-800', icon: Clock };
      default:
        return { color: 'bg-gray-100 text-gray-800', icon: Clock };
    }
  };

  const config = getStatusConfig(status);
  const Icon = config.icon;

  return (
    <Badge className={config.color}>
      <Icon className="w-3 h-3 mr-1" />
      {status.replace('_', ' ')}
    </Badge>
  );
};

// Pipeline card component
const PipelineCard: React.FC<{ pipeline: TrainingPipeline; onAction: (id: string, action: string) => void }> = ({ 
  pipeline, 
  onAction 
}) => {
  const isRunning = ['dataset_generation', 'model_training', 'evaluation', 'deployment'].includes(pipeline.status);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{pipeline.name}</CardTitle>
          <StatusBadge status={pipeline.status} />
        </div>
        <div className="text-sm text-gray-600">
          Stage: {pipeline.current_stage}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span>Progress</span>
              <span>{pipeline.progress}%</span>
            </div>
            <Progress value={pipeline.progress} className="h-2" />
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Created:</span>
              <div>{format(new Date(pipeline.created_at), 'MMM dd, HH:mm')}</div>
            </div>
            {pipeline.started_at && (
              <div>
                <span className="text-gray-600">Started:</span>
                <div>{format(new Date(pipeline.started_at), 'MMM dd, HH:mm')}</div>
              </div>
            )}
          </div>

          {pipeline.evaluation_results && (
            <div className="text-sm">
              <span className="text-gray-600">Accuracy:</span>
              <span className="ml-2 font-medium">
                {(pipeline.evaluation_results.overall_score * 100).toFixed(1)}%
              </span>
            </div>
          )}

          <div className="flex gap-2">
            {pipeline.status === 'pending' && (
              <Button 
                size="sm" 
                onClick={() => onAction(pipeline.id, 'start')}
                className="flex items-center gap-1"
              >
                <Play className="w-3 h-3" />
                Start
              </Button>
            )}
            {isRunning && (
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => onAction(pipeline.id, 'cancel')}
                className="flex items-center gap-1"
              >
                <Pause className="w-3 h-3" />
                Cancel
              </Button>
            )}
            <Button size="sm" variant="outline">
              <Settings className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// Dataset card component
const DatasetCard: React.FC<{ dataset: Dataset }> = ({ dataset }) => {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{dataset.name}</CardTitle>
          <StatusBadge status={dataset.status} />
        </div>
        <div className="text-sm text-gray-600">
          {dataset.config.task_type} • {dataset.config.jurisdiction}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Total Examples:</span>
              <div className="font-medium">{dataset.statistics.total_examples.toLocaleString()}</div>
            </div>
            <div>
              <span className="text-gray-600">Quality Score:</span>
              <div className="font-medium">{(dataset.statistics.quality_score * 100).toFixed(1)}%</div>
            </div>
          </div>

          <div className="text-xs text-gray-600">
            Train: {dataset.statistics.train_examples} • 
            Val: {dataset.statistics.validation_examples} • 
            Test: {dataset.statistics.test_examples}
          </div>

          <div className="text-xs text-gray-600">
            Created: {format(new Date(dataset.created_at), 'MMM dd, yyyy HH:mm')}
          </div>

          <Button size="sm" variant="outline" className="w-full">
            <Download className="w-3 h-3 mr-1" />
            Download
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

// Evaluation card component
const EvaluationCard: React.FC<{ evaluation: ModelEvaluation }> = ({ evaluation }) => {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{evaluation.name}</CardTitle>
          <StatusBadge status={evaluation.status} />
        </div>
        <div className="text-sm text-gray-600">
          {evaluation.model_count} models evaluated
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Validation:</span>
            <StatusBadge status={evaluation.validation_status} />
          </div>

          <div className="text-xs text-gray-600">
            Created: {format(new Date(evaluation.created_at), 'MMM dd, yyyy HH:mm')}
          </div>

          {evaluation.completed_at && (
            <div className="text-xs text-gray-600">
              Completed: {format(new Date(evaluation.completed_at), 'MMM dd, yyyy HH:mm')}
            </div>
          )}

          <Button size="sm" variant="outline" className="w-full">
            <BarChart3 className="w-3 h-3 mr-1" />
            View Results
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

// A/B Test card component
const ABTestCard: React.FC<{ test: ABTest }> = ({ test }) => {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{test.name}</CardTitle>
          <StatusBadge status={test.status} />
        </div>
        <div className="text-sm text-gray-600">
          {test.variants} variants • {test.current_sample_size} samples
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {test.winner && (
            <div className="text-sm">
              <span className="text-gray-600">Winner:</span>
              <span className="ml-2 font-medium">{test.winner}</span>
              {test.confidence_level && (
                <span className="ml-1 text-xs text-gray-500">
                  ({(test.confidence_level * 100).toFixed(1)}% confidence)
                </span>
              )}
            </div>
          )}

          <div className="text-xs text-gray-600">
            Created: {format(new Date(test.created_at), 'MMM dd, yyyy HH:mm')}
          </div>

          {test.started_at && (
            <div className="text-xs text-gray-600">
              Started: {format(new Date(test.started_at), 'MMM dd, yyyy HH:mm')}
            </div>
          )}

          <Button size="sm" variant="outline" className="w-full">
            <TrendingUp className="w-3 h-3 mr-1" />
            View Analysis
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

// Main dashboard component
export const TrainingDashboard: React.FC = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('overview');

  // Queries
  const { data: pipelinesData, isLoading: pipelinesLoading } = useQuery({
    queryKey: ['training-pipelines'],
    queryFn: trainingAPI.getPipelines,
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  const { data: datasetsData, isLoading: datasetsLoading } = useQuery({
    queryKey: ['training-datasets'],
    queryFn: trainingAPI.getDatasets,
  });

  const { data: evaluationsData, isLoading: evaluationsLoading } = useQuery({
    queryKey: ['model-evaluations'],
    queryFn: trainingAPI.getEvaluations,
  });

  const { data: abTestsData, isLoading: abTestsLoading } = useQuery({
    queryKey: ['ab-tests'],
    queryFn: trainingAPI.getABTests,
  });

  // Mutations
  const startPipelineMutation = useMutation({
    mutationFn: trainingAPI.startPipeline,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-pipelines'] });
    },
  });

  const cancelPipelineMutation = useMutation({
    mutationFn: trainingAPI.cancelPipeline,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-pipelines'] });
    },
  });

  const handlePipelineAction = (pipelineId: string, action: string) => {
    if (action === 'start') {
      startPipelineMutation.mutate(pipelineId);
    } else if (action === 'cancel') {
      cancelPipelineMutation.mutate(pipelineId);
    }
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries();
  };

  // Calculate overview stats
  const getOverviewStats = () => {
    const pipelines = pipelinesData?.pipelines || [];
    const datasets = datasetsData?.datasets || [];
    const evaluations = evaluationsData?.evaluations || [];
    const abTests = abTestsData?.tests || [];

    return {
      activePipelines: pipelines.filter(p => ['dataset_generation', 'model_training', 'evaluation'].includes(p.status)).length,
      completedPipelines: pipelines.filter(p => p.status === 'completed').length,
      totalDatasets: datasets.length,
      runningEvaluations: evaluations.filter(e => e.status === 'running').length,
      activeABTests: abTests.filter(t => t.status === 'running').length,
    };
  };

  const stats = getOverviewStats();

  // Generate mock performance data for charts
  const generatePerformanceData = () => {
    const data = [];
    for (let i = 0; i < 24; i++) {
      data.push({
        hour: i,
        accuracy: 0.75 + Math.random() * 0.2,
        latency: 100 + Math.random() * 50,
      });
    }
    return data;
  };

  const performanceData = generatePerformanceData();

  if (pipelinesLoading || datasetsLoading || evaluationsLoading || abTestsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin mr-2" />
        Loading dashboard...
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Training Dashboard</h1>
          <p className="text-gray-600">Monitor and manage ML training pipelines</p>
        </div>
        <Button onClick={handleRefresh} disabled={pipelinesLoading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${pipelinesLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="pipelines">Pipelines</TabsTrigger>
          <TabsTrigger value="datasets">Datasets</TabsTrigger>
          <TabsTrigger value="evaluations">Evaluations</TabsTrigger>
          <TabsTrigger value="ab-tests">A/B Tests</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <Clock className="w-4 h-4 text-blue-600" />
                  <div>
                    <div className="text-2xl font-bold">{stats.activePipelines}</div>
                    <div className="text-xs text-gray-600">Active Pipelines</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <div>
                    <div className="text-2xl font-bold">{stats.completedPipelines}</div>
                    <div className="text-xs text-gray-600">Completed</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <Database className="w-4 h-4 text-purple-600" />
                  <div>
                    <div className="text-2xl font-bold">{stats.totalDatasets}</div>
                    <div className="text-xs text-gray-600">Datasets</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <Brain className="w-4 h-4 text-orange-600" />
                  <div>
                    <div className="text-2xl font-bold">{stats.runningEvaluations}</div>
                    <div className="text-xs text-gray-600">Evaluations</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <TrendingUp className="w-4 h-4 text-red-600" />
                  <div>
                    <div className="text-2xl font-bold">{stats.activeABTests}</div>
                    <div className="text-xs text-gray-600">A/B Tests</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Performance Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Model Accuracy (24h)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={performanceData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hour" />
                    <YAxis domain={[0.7, 1]} />
                    <Tooltip formatter={(value: number) => `${(value * 100).toFixed(1)}%`} />
                    <Line type="monotone" dataKey="accuracy" stroke="#3b82f6" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Response Latency (24h)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={performanceData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hour" />
                    <YAxis />
                    <Tooltip formatter={(value: number) => `${value.toFixed(0)}ms`} />
                    <Bar dataKey="latency" fill="#10b981" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {pipelinesData?.pipelines.slice(0, 5).map((pipeline) => (
                  <div key={pipeline.id} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                    <div className="flex items-center space-x-3">
                      <Brain className="w-4 h-4" />
                      <div>
                        <div className="font-medium">{pipeline.name}</div>
                        <div className="text-sm text-gray-600">
                          {pipeline.current_stage} • {pipeline.progress}%
                        </div>
                      </div>
                    </div>
                    <StatusBadge status={pipeline.status} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pipelines" className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Training Pipelines</h2>
            <Button>
              <Play className="w-4 h-4 mr-2" />
              New Pipeline
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pipelinesData?.pipelines.map((pipeline) => (
              <PipelineCard 
                key={pipeline.id} 
                pipeline={pipeline} 
                onAction={handlePipelineAction}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="datasets" className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Training Datasets</h2>
            <Button>
              <Database className="w-4 h-4 mr-2" />
              Generate Dataset
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {datasetsData?.datasets.map((dataset) => (
              <DatasetCard key={dataset.id} dataset={dataset} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="evaluations" className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Model Evaluations</h2>
            <Button>
              <BarChart3 className="w-4 h-4 mr-2" />
              New Evaluation
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {evaluationsData?.evaluations.map((evaluation) => (
              <EvaluationCard key={evaluation.id} evaluation={evaluation} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="ab-tests" className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">A/B Tests</h2>
            <Button>
              <TrendingUp className="w-4 h-4 mr-2" />
              New A/B Test
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {abTestsData?.tests.map((test) => (
              <ABTestCard key={test.id} test={test} />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default TrainingDashboard;