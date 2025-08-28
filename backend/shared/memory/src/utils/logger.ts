/**
 * Logger utility for Memory Service
 */

export class Logger {
  private static instances: Map<string, Logger> = new Map();
  private name: string;

  private constructor(name: string) {
    this.name = name;
  }

  static getInstance(name: string): Logger {
    if (!Logger.instances.has(name)) {
      Logger.instances.set(name, new Logger(name));
    }
    return Logger.instances.get(name)!;
  }

  info(message: string, ...args: any[]): void {
    console.log(`[${new Date().toISOString()}] [${this.name}] INFO: ${message}`, ...args);
  }

  debug(message: string, ...args: any[]): void {
    console.log(`[${new Date().toISOString()}] [${this.name}] DEBUG: ${message}`, ...args);
  }

  warn(message: string, ...args: any[]): void {
    console.warn(`[${new Date().toISOString()}] [${this.name}] WARN: ${message}`, ...args);
  }

  error(message: string, ...args: any[]): void {
    console.error(`[${new Date().toISOString()}] [${this.name}] ERROR: ${message}`, ...args);
  }
}