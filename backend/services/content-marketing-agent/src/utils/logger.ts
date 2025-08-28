interface LogEntry {
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  data?: any;
  timestamp: string;
  service: string;
}

class Logger {
  private serviceName = 'content-marketing-agent';

  private log(level: LogEntry['level'], message: string, data?: any): void {
    const entry: LogEntry = {
      level,
      message,
      data,
      timestamp: new Date().toISOString(),
      service: this.serviceName
    };

    if (process.env.NODE_ENV === 'development') {
      console.log(JSON.stringify(entry, null, 2));
    } else {
      console.log(JSON.stringify(entry));
    }
  }

  info(message: string, data?: any): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: any): void {
    this.log('warn', message, data);
  }

  error(message: string, data?: any): void {
    this.log('error', message, data);
  }

  debug(message: string, data?: any): void {
    if (process.env.NODE_ENV === 'development') {
      this.log('debug', message, data);
    }
  }
}

export const logger = new Logger();