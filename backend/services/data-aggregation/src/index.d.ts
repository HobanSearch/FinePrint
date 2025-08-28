declare class DataAggregationService {
    private fastify;
    private prisma;
    private crawlerService;
    private processorService;
    private trendService;
    private complianceService;
    constructor();
    private setupServices;
    private setupHooks;
    private checkDatabaseHealth;
    start(): Promise<void>;
    private startBackgroundServices;
    stop(): Promise<void>;
}
export { DataAggregationService };
//# sourceMappingURL=index.d.ts.map