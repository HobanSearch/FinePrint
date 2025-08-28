declare global {
    namespace jest {
        interface Matchers<R> {
            toBeValidUUID(): R;
            toBeValidEmail(): R;
            toHaveValidSEOScore(): R;
        }
    }
}
export {};
//# sourceMappingURL=setup.d.ts.map