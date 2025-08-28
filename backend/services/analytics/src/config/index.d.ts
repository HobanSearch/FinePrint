import { z } from 'zod';
declare const configSchema: any;
type Config = z.infer<typeof configSchema>;
export declare const config: z.infer<any>;
export type { Config };
export declare const nodeEnv: z.infer<any>, port: z.infer<any>, database: z.infer<any>, redis: z.infer<any>, productAnalytics: z.infer<any>, dataWarehouse: z.infer<any>, elasticsearch: z.infer<any>, privacy: z.infer<any>, performance: z.infer<any>, processing: z.infer<any>, reporting: z.infer<any>, abTesting: z.infer<any>, aiAnalytics: z.infer<any>, security: z.infer<any>;
//# sourceMappingURL=index.d.ts.map