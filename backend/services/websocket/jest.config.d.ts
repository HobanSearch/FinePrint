export let preset: string;
export let testEnvironment: string;
export let roots: string[];
export let testMatch: string[];
export let transform: {
    '^.+\\.ts$': string;
};
export let collectCoverageFrom: string[];
export let coverageDirectory: string;
export let coverageReporters: string[];
export let setupFilesAfterEnv: string[];
export let moduleNameMapping: {
    '^@fineprintai/(.*)$': string;
    '^@/(.*)$': string;
};
export let testTimeout: number;
export let verbose: boolean;
export let detectOpenHandles: boolean;
export let forceExit: boolean;
//# sourceMappingURL=jest.config.d.ts.map