interface ForecastOutput {
    prediction: number;
    confidence: number;
    range: {
        min: number;
        max: number;
    };
    factors: ForecastFactor[];
    trend: 'increasing' | 'stable' | 'decreasing';
    seasonality: number[];
}
interface ForecastFactor {
    name: string;
    impact: number;
    description: string;
}
export declare class RevenueForecasting {
    private prisma;
    private openai;
    private models;
    constructor();
    initialize(): Promise<void>;
    generateRevenueForecast(period: 'monthly' | 'quarterly' | 'yearly', horizon?: number): Promise<ForecastOutput>;
    analyzeSalesPerformance(): Promise<{
        current_performance: any;
        trends: any;
        recommendations: string[];
    }>;
    predictDealOutcome(opportunityId: string): Promise<{
        win_probability: number;
        expected_close_date: Date;
        factors: PredictionFactor[];
        recommendations: string[];
    }>;
    analyzeChurnRisk(): Promise<{
        high_risk_customers: any[];
        medium_risk_customers: any[];
        churn_factors: any[];
        preventive_actions: any[];
    }>;
    private getHistoricalRevenue;
    private getPipelineData;
    private analyzeSeasonality;
    private getExternalFactors;
    private timeSeriesForecasting;
    private pipelineForecasting;
    private aiEnhancedForecasting;
    private ensembleForecasts;
    private calculateTrend;
    private getStageMultiplier;
    private getTimeDecay;
    private calculateDealFactors;
    private calculateWinProbability;
    private predictCloseDate;
    private generateDealRecommendations;
    private getCurrentQuarterMetrics;
    private getPreviousQuarterMetrics;
    private getYearOverYearMetrics;
    private calculateSalesVelocity;
    private identifyTrends;
    private generateRecommendations;
    private calculateChurnRisk;
    private identifyChurnFactors;
    private generatePreventiveActions;
    private loadForecastingModels;
    private calculateHistoricalMetrics;
    getQuarterlyForecast(): Promise<ForecastOutput>;
    getAnnualForecast(): Promise<ForecastOutput>;
    getForecastAccuracy(): Promise<{
        accuracy: number;
        mae: number;
        mape: number;
    }>;
}
export {};
//# sourceMappingURL=revenue-forecasting-service.d.ts.map