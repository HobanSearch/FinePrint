import { PrismaClient } from '@prisma/client';
declare const prisma: any;
declare global {
    var testUtils: {
        prisma: PrismaClient;
        cleanDatabase: () => Promise<void>;
        createTestUser: (overrides?: any) => Promise<any>;
        createTestInvoice: (userId: string, overrides?: any) => Promise<any>;
        createTestSubscription: (overrides?: any) => any;
        generateTestJWT: (userId: string, isAdmin?: boolean) => string;
        waitFor: (ms: number) => Promise<void>;
    };
}
export { prisma };
//# sourceMappingURL=setup.d.ts.map