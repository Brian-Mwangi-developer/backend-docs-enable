import { Request, Response } from 'express';

/**
 * Custom logger utility for consistent logging across the application
 */
class Logger {
    private context: string;

    constructor(context: string) {
        this.context = context;
    }

    info(message: string, ...args: any[]) {
        console.log(`[${new Date().toISOString()}] [INFO] [${this.context}]`, message, ...args);
    }

    error(message: string, error?: any, ...args: any[]) {
        console.error(`[${new Date().toISOString()}] [ERROR] [${this.context}]`, message, error, ...args);
    }

    warn(message: string, ...args: any[]) {
        console.warn(`[${new Date().toISOString()}] [WARN] [${this.context}]`, message, ...args);
    }

    debug(message: string, ...args: any[]) {
        if (process.env.DEBUG === 'true') {
            console.debug(`[${new Date().toISOString()}] [DEBUG] [${this.context}]`, message, ...args);
        }
    }
}

export function createLogger(context: string): Logger {
    return new Logger(context);
}

/**
 * Express request logger middleware
 */
export function requestLogger(req: Request, res: Response, next: Function) {
    const start = Date.now();
    const logger = createLogger('HTTP');

    res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info(
            `${req.method} ${req.path} ${res.statusCode} - ${duration}ms`,
            {
                method: req.method,
                path: req.path,
                status: res.statusCode,
                duration: `${duration}ms`,
                ip: req.ip,
            }
        );
    });

    next();
}
