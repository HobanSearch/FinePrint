/**
 * Fine Print AI - Custom Hooks for Training Data Management
 * Provides reusable hooks for training pipelines, datasets, evaluations, and A/B tests
 */

import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

// Types
export interface TrainingPipeline {
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
  config?: any;
}

export interface Dataset {
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

export interface ModelEvaluation {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  validation_status: 'passed' | 'failed' | 'pending';
  model_count: number;
  created_at: string;
  completed_at?: string;
}

export interface ABTest {
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
  // Pipelines
  getPipelines: async (): Promise<{ pipelines: TrainingPipeline[]; total: number }> => {
    const response = await fetch('/api/v1/pipelines');
    if (!response.ok) throw new Error('Failed to fetch pipelines');
    return response.json();
  },

  getPipeline: async (id: string): Promise<TrainingPipeline> => {
    const response = await fetch(`/api/v1/pipelines/${id}`);
    if (!response.ok) throw new Error('Failed to fetch pipeline');
    const result = await response.json();
    return result.pipeline;
  },

  startPipeline: async (id: string) => {
    const response = await fetch(`/api/v1/pipelines/${id}/start`, { method: 'POST' });
    if (!response.ok) throw new Error('Failed to start pipeline');
    return response.json();
  },

  cancelPipeline: async (id: string) => {
    const response = await fetch(`/api/v1/pipelines/${id}/cancel`, { method: 'POST' });
    if (!response.ok) throw new Error('Failed to cancel pipeline');
    return response.json();
  },

  createPipeline: async (config: any) => {
    const response = await fetch('/api/v1/pipelines/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!response.ok) throw new Error('Failed to create pipeline');
    return response.json();
  },

  // Datasets
  getDatasets: async (): Promise<{ datasets: Dataset[]; total: number }> => {
    const response = await fetch('/api/v1/datasets');
    if (!response.ok) throw new Error('Failed to fetch datasets');
    return response.json();
  },

  getDataset: async (id: string): Promise<Dataset> => {
    const response = await fetch(`/api/v1/datasets/${id}`);
    if (!response.ok) throw new Error('Failed to fetch dataset');
    const result = await response.json();
    return result.dataset;
  },

  generateDataset: async (config: any) => {
    const response = await fetch('/api/v1/datasets/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!response.ok) throw new Error('Failed to generate dataset');
    return response.json();
  },

  deleteDataset: async (id: string) => {
    const response = await fetch(`/api/v1/datasets/${id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Failed to delete dataset');
    return response.json();
  },

  // Evaluations
  getEvaluations: async (): Promise<{ evaluations: ModelEvaluation[]; total: number }> => {
    const response = await fetch('/api/v1/evaluation');
    if (!response.ok) throw new Error('Failed to fetch evaluations');
    return response.json();
  },

  getEvaluation: async (id: string) => {
    const response = await fetch(`/api/v1/evaluation/${id}`);
    if (!response.ok) throw new Error('Failed to fetch evaluation');
    return response.json();
  },

  startEvaluation: async (config: any) => {
    const response = await fetch('/api/v1/evaluation/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!response.ok) throw new Error('Failed to start evaluation');
    return response.json();
  },

  cancelEvaluation: async (id: string) => {
    const response = await fetch(`/api/v1/evaluation/${id}/cancel`, { method: 'POST' });
    if (!response.ok) throw new Error('Failed to cancel evaluation');
    return response.json();
  },

  // A/B Tests
  getABTests: async (): Promise<{ tests: ABTest[]; total: number }> => {
    const response = await fetch('/api/v1/experiments');
    if (!response.ok) throw new Error('Failed to fetch A/B tests');
    return response.json();
  },

  getABTest: async (id: string) => {
    const response = await fetch(`/api/v1/experiments/${id}`);
    if (!response.ok) throw new Error('Failed to fetch A/B test');
    return response.json();
  },

  createABTest: async (config: any) => {
    const response = await fetch('/api/v1/experiments/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!response.ok) throw new Error('Failed to create A/B test');
    return response.json();
  },

  startABTest: async (id: string) => {
    const response = await fetch(`/api/v1/experiments/${id}/start`, { method: 'POST' });
    if (!response.ok) throw new Error('Failed to start A/B test');
    return response.json();
  },

  stopABTest: async (id: string, reason?: string) => {
    const response = await fetch(`/api/v1/experiments/${id}/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason || 'Manual stop' }),
    });
    if (!response.ok) throw new Error('Failed to stop A/B test');
    return response.json();
  },
};

// Pipeline Hooks
export const usePipelines = (refetchInterval?: number) => {
  return useQuery({
    queryKey: ['training-pipelines'],
    queryFn: trainingAPI.getPipelines,
    refetchInterval: refetchInterval || 5000,
  });
};

export const usePipeline = (id: string, enabled = true) => {
  return useQuery({
    queryKey: ['training-pipeline', id],
    queryFn: () => trainingAPI.getPipeline(id),
    enabled: enabled && !!id,
    refetchInterval: 2000,
  });
};

export const useCreatePipeline = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: trainingAPI.createPipeline,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['training-pipelines'] });
      toast.success(`Pipeline "${data.pipeline.name}" created successfully`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to create pipeline: ${error.message}`);
    },
  });
};

export const useStartPipeline = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: trainingAPI.startPipeline,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['training-pipelines'] });
      toast.success(`Pipeline "${data.pipeline.name}" started successfully`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to start pipeline: ${error.message}`);
    },
  });
};

export const useCancelPipeline = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: trainingAPI.cancelPipeline,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-pipelines'] });
      toast.success('Pipeline cancelled successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to cancel pipeline: ${error.message}`);
    },
  });
};

// Dataset Hooks
export const useDatasets = () => {
  return useQuery({
    queryKey: ['training-datasets'],
    queryFn: trainingAPI.getDatasets,
  });
};

export const useDataset = (id: string, enabled = true) => {
  return useQuery({
    queryKey: ['training-dataset', id],
    queryFn: () => trainingAPI.getDataset(id),
    enabled: enabled && !!id,
  });
};

export const useGenerateDataset = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: trainingAPI.generateDataset,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['training-datasets'] });
      toast.success(`Dataset "${data.dataset.name}" generation started`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to generate dataset: ${error.message}`);
    },
  });
};

export const useDeleteDataset = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: trainingAPI.deleteDataset,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-datasets'] });
      toast.success('Dataset deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete dataset: ${error.message}`);
    },
  });
};

// Evaluation Hooks
export const useEvaluations = () => {
  return useQuery({
    queryKey: ['model-evaluations'],
    queryFn: trainingAPI.getEvaluations,
  });
};

export const useEvaluation = (id: string, enabled = true) => {
  return useQuery({
    queryKey: ['model-evaluation', id],
    queryFn: () => trainingAPI.getEvaluation(id),
    enabled: enabled && !!id,
    refetchInterval: 3000,
  });
};

export const useStartEvaluation = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: trainingAPI.startEvaluation,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['model-evaluations'] });
      toast.success(`Evaluation "${data.evaluation.name}" started successfully`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to start evaluation: ${error.message}`);
    },
  });
};

export const useCancelEvaluation = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: trainingAPI.cancelEvaluation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['model-evaluations'] });
      toast.success('Evaluation cancelled successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to cancel evaluation: ${error.message}`);
    },
  });
};

// A/B Test Hooks
export const useABTests = (refetchInterval?: number) => {
  return useQuery({
    queryKey: ['ab-tests'],
    queryFn: trainingAPI.getABTests,
    refetchInterval: refetchInterval || 5000,
  });
};

export const useABTest = (id: string, enabled = true) => {
  return useQuery({
    queryKey: ['ab-test', id],
    queryFn: () => trainingAPI.getABTest(id),
    enabled: enabled && !!id,
    refetchInterval: 3000,
  });
};

export const useCreateABTest = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: trainingAPI.createABTest,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ab-tests'] });
      toast.success(`A/B test "${data.test.name}" created successfully`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to create A/B test: ${error.message}`);
    },
  });
};

export const useStartABTest = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: trainingAPI.startABTest,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ab-tests'] });
      toast.success(`A/B test "${data.test.name}" started successfully`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to start A/B test: ${error.message}`);
    },
  });
};

export const useStopABTest = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => 
      trainingAPI.stopABTest(id, reason),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ab-tests'] });
      toast.success(`A/B test "${data.test.name}" stopped successfully`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to stop A/B test: ${error.message}`);
    },
  });
};

// Real-time WebSocket Hook
export const useTrainingWebSocket = (pipelineId: string, onMessage?: (data: any) => void) => {
  const queryClient = useQueryClient();

  React.useEffect(() => {
    if (!pipelineId) return;

    const ws = new WebSocket(`ws://localhost:3001/api/v1/pipelines/ws/${pipelineId}`);
    
    ws.onopen = () => {
      console.log(`WebSocket connected for pipeline: ${pipelineId}`);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      // Handle different message types
      switch (data.type) {
        case 'progress':
          queryClient.setQueryData(['training-pipeline', pipelineId], (old: any) => ({
            ...old,
            progress: data.data.progress,
            current_stage: data.data.stage,
            updated_at: new Date().toISOString(),
          }));
          break;
        case 'status_change':
          queryClient.invalidateQueries({ queryKey: ['training-pipeline', pipelineId] });
          queryClient.invalidateQueries({ queryKey: ['training-pipelines'] });
          break;
        case 'completed':
          queryClient.invalidateQueries({ queryKey: ['training-pipeline', pipelineId] });
          queryClient.invalidateQueries({ queryKey: ['training-pipelines'] });
          toast.success('Training pipeline completed successfully!');
          break;
        case 'failed':
          queryClient.invalidateQueries({ queryKey: ['training-pipeline', pipelineId] });
          queryClient.invalidateQueries({ queryKey: ['training-pipelines'] });
          toast.error('Training pipeline failed');
          break;
      }

      // Call custom message handler if provided
      if (onMessage) {
        onMessage(data);
      }
    };

    ws.onclose = () => {
      console.log(`WebSocket disconnected for pipeline: ${pipelineId}`);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    return () => {
      ws.close();
    };
  }, [pipelineId, queryClient, onMessage]);
};

// Utility Hooks
export const useTrainingStats = () => {
  const { data: pipelines } = usePipelines();
  const { data: datasets } = useDatasets();
  const { data: evaluations } = useEvaluations();
  const { data: abTests } = useABTests();

  return React.useMemo(() => {
    const pipelinesList = pipelines?.pipelines || [];
    const datasetsList = datasets?.datasets || [];
    const evaluationsList = evaluations?.evaluations || [];
    const testsList = abTests?.tests || [];

    return {
      pipelines: {
        total: pipelinesList.length,
        active: pipelinesList.filter(p => ['dataset_generation', 'model_training', 'evaluation'].includes(p.status)).length,
        completed: pipelinesList.filter(p => p.status === 'completed').length,
        failed: pipelinesList.filter(p => p.status === 'failed').length,
      },
      datasets: {
        total: datasetsList.length,
        completed: datasetsList.filter(d => d.status === 'completed').length,
        generating: datasetsList.filter(d => d.status === 'generating').length,
      },
      evaluations: {
        total: evaluationsList.length,
        running: evaluationsList.filter(e => e.status === 'running').length,
        completed: evaluationsList.filter(e => e.status === 'completed').length,
        passed: evaluationsList.filter(e => e.validation_status === 'passed').length,
      },
      abTests: {
        total: testsList.length,
        running: testsList.filter(t => t.status === 'running').length,
        completed: testsList.filter(t => t.status === 'completed').length,
        withWinners: testsList.filter(t => t.winner).length,
      },
    };
  }, [pipelines, datasets, evaluations, abTests]);
};