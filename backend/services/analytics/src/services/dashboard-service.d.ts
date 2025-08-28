import { Dashboard, DashboardWidget, MonitoringRule, SLATarget, PerformanceTrend, Platform } from '@/types/analytics';
interface RealtimeUpdate {
    dashboardId: string;
    widgetId: string;
    data: any;
    timestamp: Date;
}
declare class DashboardService {
    private prisma;
    private redis;
    private config;
    private updateTimer?;
    private activeConnections;
    private isInitialized;
    constructor();
    private initialize;
    createDashboard(name: string, description: string, widgets: DashboardWidget[], isPublic: boolean | undefined, createdBy: string): Promise<Dashboard>;
    getDashboard(dashboardId: string, includeData?: boolean): Promise<Dashboard | null>;
    getExecutiveDashboard(): Promise<Dashboard>;
    getOperationalDashboard(): Promise<Dashboard>;
    getRealtimePerformanceMetrics(): Promise<any>;
    createMonitoringRule(name: string, platform: Platform, metricType: string, threshold: number, condition: any, severity: 'low' | 'medium' | 'high' | 'critical', recipients: string[]): Promise<MonitoringRule>;
    createSLATarget(name: string, platform: Platform, metricType: string, target: number, tolerance: number, timeframe: 'daily' | 'weekly' | 'monthly'): Promise<SLATarget>;
    getPerformanceTrends(platform: Platform, metricType: string, timeRange: {
        start: Date;
        end: Date;
    }): Promise<PerformanceTrend>;
    subscribeToUpdates(dashboardId: string, callback: (update: RealtimeUpdate) => void): string;
    unsubscribeFromUpdates(subscriptionId: string): void;
    private startRealtimeUpdates;
    private processRealtimeUpdates;
    private initializeDefaultDashboards;
    private createExecutiveDashboard;
    private createOperationalDashboard;
    private getPlatformMetrics;
    private getOverallSystemMetrics;
    private getActiveAlerts;
    private getSLAStatus;
    private calculateTrend;
    private hashData;
    private storeDashboard;
    private getDashboardFromDB;
    private initializeWidgetData;
    private getWidgetData;
    private storeMonitoringRule;
    private startMonitoring;
    private storeSLATarget;
    private startSLAMonitoring;
    private getHistoricalPerformanceData;
    private identifyTrendFactors;
    shutdown(): Promise<void>;
}
export declare const dashboardService: DashboardService;
export {};
//# sourceMappingURL=dashboard-service.d.ts.map