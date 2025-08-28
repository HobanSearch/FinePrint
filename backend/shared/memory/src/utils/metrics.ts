/**
 * Metrics utility for Memory Service
 */

export interface HistogramStats {
  count: number;
  sum: number;
  avg: number;
  min: number;
  max: number;
  total: number;
}

export class Metrics {
  private static instance: Metrics;
  private counters: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();
  private gauges: Map<string, number> = new Map();

  private constructor() {}

  static getInstance(): Metrics {
    if (!Metrics.instance) {
      Metrics.instance = new Metrics();
    }
    return Metrics.instance;
  }

  increment(name: string, value: number = 1): void {
    const current = this.counters.get(name) || 0;
    this.counters.set(name, current + value);
  }

  histogram(name: string, value: number): void {
    if (!this.histograms.has(name)) {
      this.histograms.set(name, []);
    }
    this.histograms.get(name)!.push(value);
  }

  gauge(name: string, value: number): void {
    this.gauges.set(name, value);
  }

  getCounterValue(name: string): number | undefined {
    return this.counters.get(name);
  }

  getHistogramStats(name: string): HistogramStats | undefined {
    const values = this.histograms.get(name);
    if (!values || values.length === 0) return undefined;

    const sum = values.reduce((a, b) => a + b, 0);
    return {
      count: values.length,
      sum,
      avg: sum / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      total: values.length,
    };
  }

  getGaugeValue(name: string): number | undefined {
    return this.gauges.get(name);
  }

  getAllMetrics(): {
    counters: Record<string, number>;
    gauges: Record<string, number>;
    histograms: Record<string, HistogramStats>;
  } {
    const histogramStats: Record<string, HistogramStats> = {};
    
    for (const [name, values] of this.histograms.entries()) {
      const stats = this.getHistogramStats(name);
      if (stats) {
        histogramStats[name] = stats;
      }
    }

    return {
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      histograms: histogramStats,
    };
  }

  reset(): void {
    this.counters.clear();
    this.histograms.clear();
    this.gauges.clear();
  }
}