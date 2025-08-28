import { IaCEngine } from './infrastructure/iac-engine';
import { PipelineEngine } from './cicd/pipeline-engine';
import { KubernetesOrchestrationEngine } from './kubernetes/orchestration-engine';
import { ObservabilityEngine } from './monitoring/observability-engine';
import { SecurityAutomationEngine } from './security/security-automation-engine';
export declare function initializeServices(): Promise<void>;
export declare function getServices(): {
    redis: Redis;
    iacEngine: IaCEngine;
    pipelineEngine: PipelineEngine;
    kubernetesEngine: KubernetesOrchestrationEngine;
    observabilityEngine: ObservabilityEngine;
    securityEngine: SecurityAutomationEngine;
    costOptimizationEngine: CostOptimizationEngine;
    backupEngine: BackupEngine;
    gitopsEngine: GitOpsEngine;
    multiCloudEngine: MultiCloudEngine;
};
export declare function checkServicesHealth(): Promise<Record<string, boolean>>;
export declare function shutdownServices(): Promise<void>;
//# sourceMappingURL=index.d.ts.map