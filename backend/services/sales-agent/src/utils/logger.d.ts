export declare const logger: {
    level: any;
    serializers: {
        req: (req: any) => {
            method: any;
            url: any;
            headers: {
                'user-agent': any;
                'content-type': any;
            };
            remoteAddress: any;
            remotePort: any;
        };
        res: (res: any) => {
            statusCode: any;
            headers: {
                'content-type': any;
                'content-length': any;
            };
        };
        err: (err: any) => {
            type: any;
            message: any;
            stack: any;
            code: any;
            statusCode: any;
        };
    };
    formatters: {
        level: (label: string) => {
            level: string;
        };
        log: (obj: any) => any;
    };
    transport: {
        target: string;
        options: {
            translateTime: string;
            ignore: string;
            colorize: boolean;
        };
    } | undefined;
};
//# sourceMappingURL=logger.d.ts.map