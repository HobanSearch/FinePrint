export let preset: string;
export let testEnvironment: string;
export let roots: string[];
export let testMatch: string[];
export let transform: {
    '^.+\\.(ts|tsx)$': string;
};
export let collectCoverageFrom: string[];
export let coverageDirectory: string;
export let coverageReporters: string[];
export namespace coverageThreshold {
    namespace global {
        let branches: number;
        let functions: number;
        let lines: number;
        let statements: number;
    }
}
export let setupFilesAfterEnv: string[];
export let testTimeout: number;
export let verbose: boolean;
export let maxWorkers: number;
export let clearMocks: boolean;
export let restoreMocks: boolean;
export let moduleNameMapping: {
    '^@/(.*)$': string;
};
export let globals: {
    'ts-jest': {
        tsconfig: {
            compilerOptions: {
                module: string;
            };
        };
    };
};
//# sourceMappingURL=jest.config.d.ts.map