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
export let testTimeout: number;
export let moduleNameMapping: {
    '^@/(.*)$': string;
    '^@config/(.*)$': string;
    '^@services/(.*)$': string;
    '^@routes/(.*)$': string;
    '^@types/(.*)$': string;
    '^@utils/(.*)$': string;
};
export let globalSetup: string;
export let globalTeardown: string;
//# sourceMappingURL=jest.config.d.ts.map