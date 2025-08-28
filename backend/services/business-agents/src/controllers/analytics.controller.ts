/**
 * Analytics Agent Controller
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import {
  AnalyticsAnalyzeRequest,
  AnalyticsInsightResponse,
  AgentType
} from '../types';
import { ollamaService } from '../services/ollama.service';
import { cacheService } from '../services/cache.service';
import { createLogger } from '../utils/logger';

const logger = createLogger('analytics-controller');

export class AnalyticsController {
  async analyzeData(
    request: FastifyRequest<{ Body: AnalyticsAnalyzeRequest }>,
    reply: FastifyReply
  ): Promise<void> {
    const startTime = Date.now();
    const { body } = request;

    try {
      // Check cache first
      const cached = await cacheService.get<AnalyticsInsightResponse>(
        AgentType.ANALYTICS,
        'analyze',
        body
      );

      if (cached) {
        logger.info('Returning cached analytics insights');
        return reply.send(cached);
      }

      // Prepare data for analysis
      const dataContext = this.prepareDataContext(body);
      const systemPrompt = this.buildSystemPrompt(body.analysisDepth);
      const userPrompt = this.buildUserPrompt(dataContext, body);

      // Generate insights
      const aiAnalysis = await ollamaService.generate(
        AgentType.ANALYTICS,
        userPrompt,
        systemPrompt,
        {
          temperature: 0.3, // Low temperature for analytical consistency
          format: 'json',
          maxTokens: 6000 // Larger token limit for comprehensive analysis
        }
      );

      // Parse AI analysis
      const parsed = this.parseAIAnalysis(aiAnalysis);

      // Generate visualizations
      const visualizations = this.generateVisualizations(body, parsed);

      // Handle comparison if requested
      let comparison;
      if (body.compareWith) {
        comparison = await this.generateComparison(body);
      }

      // Create response
      const response: AnalyticsInsightResponse = {
        id: uuidv4(),
        insights: {
          summary: parsed.summary || 'Analysis completed',
          keyFindings: parsed.keyFindings || [],
          trends: parsed.trends || [],
          anomalies: parsed.anomalies || [],
          predictions: parsed.predictions || [],
          recommendations: parsed.recommendations || []
        },
        visualizations,
        comparison,
        metadata: {
          analyzedAt: new Date(),
          model: 'fine-print-analytics',
          version: '1.0.0',
          dataPoints: body.metrics.length,
          processingTime: Date.now() - startTime,
          confidence: parsed.confidence || 85
        }
      };

      // Cache the response
      await cacheService.set(
        AgentType.ANALYTICS,
        'analyze',
        body,
        response,
        7200 // 2 hours TTL
      );

      logger.info({
        dataType: body.dataType,
        dataPoints: response.metadata.dataPoints,
        processingTime: response.metadata.processingTime,
        confidence: response.metadata.confidence,
        msg: 'Analytics insights generated'
      });

      reply.send(response);
    } catch (error) {
      logger.error('Failed to analyze data:', error);
      reply.code(500).send({
        error: 'ANALYSIS_FAILED',
        message: 'Failed to generate analytics insights',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private prepareDataContext(request: AnalyticsAnalyzeRequest): string {
    const { dataType, metrics, timeRange, dimensions } = request;

    // Calculate basic statistics
    const values = metrics.map(m => m.value);
    const stats = this.calculateStatistics(values);

    let context = `Data Analysis Context:
- Data Type: ${dataType}
- Time Range: ${timeRange.start} to ${timeRange.end}
- Granularity: ${timeRange.granularity || 'daily'}
- Total Data Points: ${metrics.length}

Statistical Summary:
- Total: ${stats.total}
- Average: ${stats.average}
- Median: ${stats.median}
- Min: ${stats.min}
- Max: ${stats.max}
- Standard Deviation: ${stats.stdDev}`;

    if (dimensions && dimensions.length > 0) {
      context += `\n\nDimensions: ${dimensions.join(', ')}`;
    }

    // Add top metrics
    context += '\n\nTop Metrics:';
    const sortedMetrics = [...metrics].sort((a, b) => b.value - a.value).slice(0, 10);
    sortedMetrics.forEach((metric, index) => {
      context += `\n${index + 1}. ${metric.name}: ${metric.value}`;
      if (metric.dimension) {
        context += ` (${metric.dimension})`;
      }
    });

    // Add time-based patterns if available
    if (metrics.some(m => m.date)) {
      context += '\n\nTime-based Distribution:';
      const timeGroups = this.groupByTime(metrics, timeRange.granularity || 'day');
      Object.entries(timeGroups).slice(0, 5).forEach(([period, data]) => {
        context += `\n- ${period}: ${data.length} records, avg: ${(data.reduce((sum, m) => sum + m.value, 0) / data.length).toFixed(2)}`;
      });
    }

    return context;
  }

  private buildSystemPrompt(depth: 'basic' | 'detailed' | 'comprehensive'): string {
    const depthInstructions = {
      basic: 'Provide high-level insights and key metrics only.',
      detailed: 'Include trends, patterns, and actionable recommendations.',
      comprehensive: 'Perform deep analysis with predictions, anomaly detection, and strategic insights.'
    };

    return `You are an expert business analytics AI for Fine Print AI, specializing in data analysis and insight generation.

Your role is to:
1. Analyze business metrics and identify patterns
2. ${depthInstructions[depth]}
3. Detect anomalies and unusual patterns
4. Generate predictive insights when possible
5. Provide actionable recommendations

Analysis areas:
- Usage patterns and user behavior
- Revenue and financial metrics
- Customer engagement and satisfaction
- Product performance and adoption
- Marketing effectiveness
- Operational efficiency

Provide your analysis in JSON format:
{
  "summary": "string - executive summary of findings",
  "keyFindings": ["array", "of", "key", "findings"],
  "trends": [
    {
      "metric": "string",
      "direction": "increasing|decreasing|stable",
      "rate": number,
      "significance": "high|medium|low",
      "forecast": [numbers]
    }
  ],
  "anomalies": [
    {
      "metric": "string",
      "timestamp": "ISO date string",
      "value": number,
      "expectedRange": {"min": number, "max": number},
      "severity": "critical|warning|info",
      "possibleCauses": ["array", "of", "causes"]
    }
  ],
  "predictions": [
    {
      "metric": "string",
      "period": "string",
      "value": number,
      "confidence": number,
      "range": {"min": number, "max": number}
    }
  ],
  "recommendations": ["array", "of", "actionable", "recommendations"],
  "confidence": number (0-100)
}`;
  }

  private buildUserPrompt(context: string, request: AnalyticsAnalyzeRequest): string {
    let prompt = `Analyze the following ${request.dataType} data and provide insights:

${context}`;

    if (request.compareWith) {
      prompt += `\n\nComparison requested with ${request.compareWith.type}.`;
    }

    prompt += '\n\nProvide comprehensive analysis in the specified JSON format.';

    return prompt;
  }

  private calculateStatistics(values: number[]): {
    total: number;
    average: number;
    median: number;
    min: number;
    max: number;
    stdDev: number;
  } {
    const sorted = [...values].sort((a, b) => a - b);
    const total = values.reduce((sum, val) => sum + val, 0);
    const average = total / values.length;
    const median = sorted[Math.floor(sorted.length / 2)];
    const min = sorted[0];
    const max = sorted[sorted.length - 1];

    // Calculate standard deviation
    const squaredDiffs = values.map(val => Math.pow(val - average, 2));
    const avgSquaredDiff = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
    const stdDev = Math.sqrt(avgSquaredDiff);

    return {
      total: Math.round(total * 100) / 100,
      average: Math.round(average * 100) / 100,
      median: Math.round(median * 100) / 100,
      min: Math.round(min * 100) / 100,
      max: Math.round(max * 100) / 100,
      stdDev: Math.round(stdDev * 100) / 100
    };
  }

  private groupByTime(
    metrics: Array<{ name: string; value: number; date?: string }>,
    granularity: string
  ): Record<string, typeof metrics> {
    const groups: Record<string, typeof metrics> = {};

    metrics.forEach(metric => {
      if (!metric.date) return;

      const date = new Date(metric.date);
      let key: string;

      switch (granularity) {
        case 'hour':
          key = `${date.toISOString().slice(0, 13)}:00`;
          break;
        case 'day':
          key = date.toISOString().slice(0, 10);
          break;
        case 'week':
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          key = `Week of ${weekStart.toISOString().slice(0, 10)}`;
          break;
        case 'month':
          key = date.toISOString().slice(0, 7);
          break;
        case 'quarter':
          const quarter = Math.floor(date.getMonth() / 3) + 1;
          key = `${date.getFullYear()}-Q${quarter}`;
          break;
        case 'year':
          key = date.getFullYear().toString();
          break;
        default:
          key = date.toISOString().slice(0, 10);
      }

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(metric);
    });

    return groups;
  }

  private parseAIAnalysis(jsonString: string): any {
    try {
      return JSON.parse(jsonString);
    } catch (error) {
      logger.error('Failed to parse AI analysis:', error);
      // Return default structure
      return {
        summary: 'Analysis completed with parsing error',
        keyFindings: ['Data processed successfully'],
        trends: [],
        anomalies: [],
        predictions: [],
        recommendations: ['Review data quality', 'Implement monitoring'],
        confidence: 50
      };
    }
  }

  private generateVisualizations(
    request: AnalyticsAnalyzeRequest,
    analysis: any
  ): Array<{
    type: 'line' | 'bar' | 'pie' | 'scatter' | 'heatmap';
    data: any;
    config: any;
  }> {
    const visualizations = [];

    // Time series visualization
    if (request.metrics.some(m => m.date)) {
      const timeGroups = this.groupByTime(request.metrics, request.timeRange.granularity || 'day');
      
      visualizations.push({
        type: 'line' as const,
        data: {
          labels: Object.keys(timeGroups),
          datasets: [{
            label: request.dataType,
            data: Object.values(timeGroups).map(group => 
              group.reduce((sum, m) => sum + m.value, 0) / group.length
            )
          }]
        },
        config: {
          title: `${request.dataType} Over Time`,
          xAxis: 'Time',
          yAxis: 'Value'
        }
      });
    }

    // Distribution visualization
    if (request.dimensions && request.dimensions.length > 0) {
      const dimensionGroups: Record<string, number> = {};
      request.metrics.forEach(m => {
        if (m.dimension) {
          dimensionGroups[m.dimension] = (dimensionGroups[m.dimension] || 0) + m.value;
        }
      });

      visualizations.push({
        type: 'pie' as const,
        data: {
          labels: Object.keys(dimensionGroups),
          datasets: [{
            data: Object.values(dimensionGroups)
          }]
        },
        config: {
          title: `Distribution by ${request.dimensions[0]}`,
          showLegend: true
        }
      });
    }

    // Top performers bar chart
    const topMetrics = [...request.metrics]
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    visualizations.push({
      type: 'bar' as const,
      data: {
        labels: topMetrics.map(m => m.name),
        datasets: [{
          label: 'Value',
          data: topMetrics.map(m => m.value)
        }]
      },
      config: {
        title: `Top ${request.dataType} Metrics`,
        horizontal: true
      }
    });

    return visualizations;
  }

  private async generateComparison(
    request: AnalyticsAnalyzeRequest
  ): Promise<{
    currentPeriod: any;
    previousPeriod: any;
    change: {
      absolute: number;
      percentage: number;
      direction: 'up' | 'down' | 'stable';
    };
  }> {
    const values = request.metrics.map(m => m.value);
    const currentStats = this.calculateStatistics(values);

    // Simulate previous period data (in production, fetch from database)
    const previousValues = values.map(v => v * (0.8 + Math.random() * 0.4));
    const previousStats = this.calculateStatistics(previousValues);

    const absoluteChange = currentStats.total - previousStats.total;
    const percentageChange = (absoluteChange / previousStats.total) * 100;

    return {
      currentPeriod: currentStats,
      previousPeriod: previousStats,
      change: {
        absolute: Math.round(absoluteChange * 100) / 100,
        percentage: Math.round(percentageChange * 100) / 100,
        direction: absoluteChange > 0 ? 'up' : absoluteChange < 0 ? 'down' : 'stable'
      }
    };
  }
}

export const analyticsController = new AnalyticsController();