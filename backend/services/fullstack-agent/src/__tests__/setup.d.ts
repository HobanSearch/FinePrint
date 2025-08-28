declare global {
    var testUtils: {
        createMockRequest: (overrides?: any) => any;
        createMockReply: () => any;
        delay: (ms: number) => Promise<void>;
        mockImplementationOnce: (mock: any, implementation: any) => void;
    };
}
export {};
//# sourceMappingURL=setup.d.ts.map