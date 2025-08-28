/**
 * Fine Print AI - Pipeline Monitor Component
 * Real-time monitoring for training pipelines with detailed progress tracking
 */

import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Progress,
} from '@/components/ui/progress';
import {
  Badge,
} from '@/components/ui/badge';
import {
  Button,
} from '@/components/ui/button';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  ScrollArea,
} from '@/components/ui/scroll-area';
import {
  Alert,
  AlertDescription,
} from '@/components/ui/alert';
import {
  Play,
  Pause,
  Square,
  Activity,
  Clock,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  Database,
  Brain,
  Zap,
  Terminal,
  Download,
  RefreshCw,
} from 'lucide-react';
import { format } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';

interface PipelineProgress {
  pipeline_id: string;
  stage: string;
  progress: number;
  message: string;
  estimated_completion?: string;
}

interface PipelineLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  stage: string;
  message: string;
  metadata?: any;
}

interface TrainingMetrics {
  epoch: number;
  loss: number;
  accuracy: number;
  val_loss: number;
  val_accuracy: number;
  learning_rate: number;
  timestamp: string;
}

interface PipelineDetails {
  id: string;
  name: string;
  status: string;
  current_stage: string;
  progress: number;
  dataset_id?: string;
  model_id?: string;
  started_at?: string;
  estimated_completion?: string;
  config: any;
  evaluation_results?: any;
  logs: PipelineLog[];
  metrics: TrainingMetrics[];
}

interface PipelineMonitorProps {
  pipelineId: string;
  onClose?: () => void;
}

const PipelineMonitor: React.FC<PipelineMonitorProps> = ({ pipelineId, onClose }) => {
  const [wsConnection, setWsConnection] = useState<WebSocket | null>(null);
  const [realTimeMetrics, setRealTimeMetrics] = useState<TrainingMetrics[]>([]);
  const [realTimeLogs, setRealTimeLogs] = useState<PipelineLog[]>([]);

  // Fetch pipeline details
  const { data: pipeline, isLoading, refetch } = useQuery<PipelineDetails>({
    queryKey: ['pipeline-details', pipelineId],
    queryFn: async () => {
      const response = await fetch(`/api/v1/pipelines/${pipelineId}`);
      if (!response.ok) throw new Error('Failed to fetch pipeline details');
      const result = await response.json();
      return result.pipeline;
    },
    refetchInterval: 2000, // Refresh every 2 seconds
  });

  // WebSocket connection for real-time updates
  useEffect(() => {
    if (!pipelineId) return;

    const ws = new WebSocket(`ws://localhost:3001/ws/pipelines/${pipelineId}`);
    
    ws.onopen = () => {
      console.log('WebSocket connected for pipeline:', pipelineId);
      setWsConnection(ws);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'progress':
          // Update progress without full refetch
          break;
        case 'metrics':
          setRealTimeMetrics(prev => [...prev.slice(-100), data.data]); // Keep last 100 points
          break;
        case 'log':
          setRealTimeLogs(prev => [...prev.slice(-200), data.data]); // Keep last 200 logs
          break;
        case 'status_change':
          refetch(); // Refetch full data on status change
          break;
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setWsConnection(null);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    return () => {
      ws.close();
    };
  }, [pipelineId, refetch]);

  const handlePipelineAction = async (action: string) => {
    try {
      let url = '';
      let method = 'POST';
      
      switch (action) {
        case 'cancel':
          url = `/api/v1/pipelines/${pipelineId}/cancel`;
          break;
        case 'restart':
          url = `/api/v1/pipelines/${pipelineId}/start`;
          break;
        default:
          return;
      }
      
      const response = await fetch(url, { method });
      if (!response.ok) throw new Error(`Failed to ${action} pipeline`);
      
      refetch();
    } catch (error) {
      console.error(`Error ${action} pipeline:`, error);
    }
  };

  const getStageIcon = (stage: string) => {
    switch (stage) {
      case 'dataset_generation':
        return Database;
      case 'model_training':
        return Brain;
      case 'evaluation':
        return Activity;
      case 'deployment':
        return Zap;
      default:
        return Clock;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-600';
      case 'failed':
        return 'text-red-600';
      case 'running':
      case 'dataset_generation':
      case 'model_training':
      case 'evaluation':
        return 'text-blue-600';
      default:
        return 'text-gray-600';
    }
  };

  const formatDuration = (startTime: string, endTime?: string) => {
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date();
    const duration = end.getTime() - start.getTime();
    
    const hours = Math.floor(duration / (1000 * 60 * 60));
    const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((duration % (1000 * 60)) / 1000);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const allMetrics = [...(pipeline?.metrics || []), ...realTimeMetrics];
  const allLogs = [...(pipeline?.logs || []), ...realTimeLogs];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin mr-2" />
        Loading pipeline details...
      </div>
    );
  }

  if (!pipeline) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Pipeline not found or failed to load.
        </AlertDescription>
      </Alert>
    );
  }

  const StageIcon = getStageIcon(pipeline.current_stage);
  const isRunning = ['dataset_generation', 'model_training', 'evaluation', 'deployment'].includes(pipeline.status);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <StageIcon className={`w-6 h-6 ${getStatusColor(pipeline.status)}`} />
          <div>
            <h2 className="text-2xl font-bold">{pipeline.name}</h2>
            <p className="text-gray-600">
              {pipeline.current_stage.replace('_', ' ')} • 
              {pipeline.started_at && (
                <span className="ml-1">
                  Running for {formatDuration(pipeline.started_at)}
                </span>
              )}
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          {wsConnection && (
            <div className="flex items-center text-green-600 text-sm">
              <Activity className="w-4 h-4 mr-1 animate-pulse" />
              Live
            </div>
          )}
          
          {isRunning && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => handlePipelineAction('cancel')}
            >
              <Square className="w-4 h-4 mr-1" />
              Cancel
            </Button>
          )}
          
          {pipeline.status === 'failed' && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => handlePipelineAction('restart')}
            >
              <Play className="w-4 h-4 mr-1" />
              Restart
            </Button>
          )}
          
          {onClose && (
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </div>

      {/* Progress Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <TrendingUp className="w-5 h-5 mr-2" />
            Progress Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Overall Progress</span>
              <span className="text-sm text-gray-600">{pipeline.progress}%</span>
            </div>
            <Progress value={pipeline.progress} className="h-3" />
            
            {pipeline.estimated_completion && (
              <div className="text-sm text-gray-600">
                Estimated completion: {format(new Date(pipeline.estimated_completion), 'MMM dd, HH:mm')}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stage Progress */}
      <Card>
        <CardHeader>
          <CardTitle>Pipeline Stages</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[
              { key: 'dataset_generation', label: 'Dataset Generation', icon: Database },
              { key: 'model_training', label: 'Model Training', icon: Brain },
              { key: 'evaluation', label: 'Evaluation', icon: Activity },
              { key: 'deployment', label: 'Deployment', icon: Zap },
            ].map((stage) => {
              const Icon = stage.icon;
              const isActive = pipeline.current_stage === stage.key;
              const isCompleted = pipeline.progress >= (stage.key === 'dataset_generation' ? 25 : 
                                                        stage.key === 'model_training' ? 70 :
                                                        stage.key === 'evaluation' ? 90 : 100);
              
              return (
                <div key={stage.key} className="flex items-center space-x-3">
                  <div className={`p-2 rounded-full ${
                    isCompleted ? 'bg-green-100 text-green-600' :
                    isActive ? 'bg-blue-100 text-blue-600' :
                    'bg-gray-100 text-gray-400'
                  }`}>
                    {isCompleted ? <CheckCircle className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                  </div>
                  <div className="flex-1">
                    <div className={`font-medium ${isActive ? 'text-blue-600' : isCompleted ? 'text-green-600' : 'text-gray-600'}`}>
                      {stage.label}
                    </div>
                    {isActive && (
                      <div className="text-sm text-gray-500">In progress...</div>
                    )}
                    {isCompleted && !isActive && (
                      <div className="text-sm text-green-600">Completed</div>
                    )}
                  </div>
                  {isCompleted && <CheckCircle className="w-5 h-5 text-green-600" />}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Tabs for detailed monitoring */}
      <Tabs defaultValue="metrics" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="metrics">Training Metrics</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="config">Configuration</TabsTrigger>
          <TabsTrigger value="results">Results</TabsTrigger>
        </TabsList>

        <TabsContent value="metrics" className="space-y-4">
          {allMetrics.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Loss</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={allMetrics}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="epoch" />
                      <YAxis />
                      <Tooltip />
                      <Area type="monotone" dataKey="loss" stackId="1" stroke="#ef4444" fill="#fef2f2" />
                      <Area type="monotone" dataKey="val_loss" stackId="1" stroke="#f97316" fill="#fff7ed" />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Accuracy</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={allMetrics}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="epoch" />
                      <YAxis domain={[0, 1]} />
                      <Tooltip formatter={(value: number) => `${(value * 100).toFixed(2)}%`} />
                      <Line type="monotone" dataKey="accuracy" stroke="#10b981" strokeWidth={2} />
                      <Line type="monotone" dataKey="val_accuracy" stroke="#3b82f6" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Learning Rate</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={allMetrics}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="epoch" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="learning_rate" stroke="#8b5cf6" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Current Metrics</CardTitle>
                </CardHeader>
                <CardContent>
                  {allMetrics.length > 0 && (
                    <div className="grid grid-cols-2 gap-4">
                      {(() => {
                        const latest = allMetrics[allMetrics.length - 1];
                        return (
                          <>
                            <div>
                              <div className="text-2xl font-bold text-green-600">
                                {(latest.accuracy * 100).toFixed(2)}%
                              </div>
                              <div className="text-sm text-gray-600">Accuracy</div>
                            </div>
                            <div>
                              <div className="text-2xl font-bold text-blue-600">
                                {latest.loss.toFixed(4)}
                              </div>
                              <div className="text-sm text-gray-600">Loss</div>
                            </div>
                            <div>
                              <div className="text-2xl font-bold text-purple-600">
                                {latest.learning_rate.toExponential(2)}
                              </div>
                              <div className="text-sm text-gray-600">Learning Rate</div>
                            </div>
                            <div>
                              <div className="text-2xl font-bold text-orange-600">
                                {latest.epoch}
                              </div>
                              <div className="text-sm text-gray-600">Epoch</div>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="text-center py-8">
                <Brain className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                <p className="text-gray-600">No training metrics available yet</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center">
                <Terminal className="w-5 h-5 mr-2" />
                Pipeline Logs
              </CardTitle>
              <Button size="sm" variant="outline">
                <Download className="w-4 h-4 mr-1" />
                Export
              </Button>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-96">
                <div className="space-y-2">
                  {allLogs.map((log, index) => (
                    <div key={index} className={`p-2 rounded text-sm border-l-4 ${
                      log.level === 'error' ? 'border-red-500 bg-red-50' :
                      log.level === 'warn' ? 'border-yellow-500 bg-yellow-50' :
                      'border-blue-500 bg-blue-50'
                    }`}>
                      <div className="flex items-center justify-between mb-1">
                        <Badge variant="outline" className="text-xs">
                          {log.stage}
                        </Badge>
                        <span className="text-xs text-gray-500">
                          {format(new Date(log.timestamp), 'HH:mm:ss')}
                        </span>
                      </div>
                      <div className={`font-mono ${
                        log.level === 'error' ? 'text-red-700' :
                        log.level === 'warn' ? 'text-yellow-700' :
                        'text-blue-700'
                      }`}>
                        {log.message}
                      </div>
                    </div>
                  ))}
                  
                  {allLogs.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      No logs available
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="config" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pipeline Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="bg-gray-50 p-4 rounded-lg overflow-auto text-sm">
                {JSON.stringify(pipeline.config, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="results" className="space-y-4">
          {pipeline.evaluation_results ? (
            <Card>
              <CardHeader>
                <CardTitle>Evaluation Results</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-600">
                      {(pipeline.evaluation_results.overall_score * 100).toFixed(1)}%
                    </div>
                    <div className="text-sm text-gray-600">Overall Score</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-blue-600">
                      {pipeline.evaluation_results.accuracy ? 
                        (pipeline.evaluation_results.accuracy * 100).toFixed(1) + '%' : 'N/A'}
                    </div>
                    <div className="text-sm text-gray-600">Accuracy</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-purple-600">
                      {pipeline.evaluation_results.f1_score ? 
                        (pipeline.evaluation_results.f1_score * 100).toFixed(1) + '%' : 'N/A'}
                    </div>
                    <div className="text-sm text-gray-600">F1 Score</div>
                  </div>
                </div>
                
                <pre className="bg-gray-50 p-4 rounded-lg overflow-auto text-sm">
                  {JSON.stringify(pipeline.evaluation_results, null, 2)}
                </pre>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="text-center py-8">
                <Activity className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                <p className="text-gray-600">
                  {pipeline.status === 'completed' ? 
                    'No evaluation results available' : 
                    'Evaluation results will appear here once training is complete'
                  }
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PipelineMonitor;