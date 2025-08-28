/**
 * Logger Utility
 * Provides structured logging with different levels and storage
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: any;
  stack?: string;
}

class Logger {
  private logLevel: LogLevel = __DEV__ ? LogLevel.DEBUG : LogLevel.INFO;
  private maxLogEntries = 1000;
  private logStorageKey = 'fine_print_logs';

  /**
   * Set the minimum log level
   */
  setLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  /**
   * Debug logging
   */
  debug(message: string, data?: any): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  /**
   * Info logging
   */
  info(message: string, data?: any): void {
    this.log(LogLevel.INFO, message, data);
  }

  /**
   * Warning logging
   */
  warn(message: string, data?: any): void {
    this.log(LogLevel.WARN, message, data);
  }

  /**
   * Error logging
   */
  error(message: string, error?: any): void {
    let stack: string | undefined;
    let data: any = error;

    if (error instanceof Error) {
      stack = error.stack;
      data = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    this.log(LogLevel.ERROR, message, data, stack);
  }

  /**
   * Core logging method
   */
  private log(level: LogLevel, message: string, data?: any, stack?: string): void {
    if (level < this.logLevel) {
      return;
    }

    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
      stack,
    };

    // Console output in development
    if (__DEV__) {
      const levelName = LogLevel[level];
      const formattedMessage = `[${levelName}] ${message}`;
      
      switch (level) {
        case LogLevel.DEBUG:
          console.debug(formattedMessage, data);
          break;
        case LogLevel.INFO:
          console.info(formattedMessage, data);
          break;
        case LogLevel.WARN:
          console.warn(formattedMessage, data);
          break;
        case LogLevel.ERROR:
          console.error(formattedMessage, data);
          break;
      }
    }

    // Store log entry
    this.storeLogEntry(logEntry).catch(error => {
      console.error('Failed to store log entry:', error);
    });
  }

  /**
   * Store log entry to persistent storage
   */
  private async storeLogEntry(logEntry: LogEntry): Promise<void> {
    try {
      const existingLogs = await this.getLogs();
      const updatedLogs = [logEntry, ...existingLogs.slice(0, this.maxLogEntries - 1)];
      
      await AsyncStorage.setItem(this.logStorageKey, JSON.stringify(updatedLogs));
    } catch (error) {
      console.error('Failed to store log entry:', error);
    }
  }

  /**
   * Get stored logs
   */
  async getLogs(): Promise<LogEntry[]> {
    try {
      const logsString = await AsyncStorage.getItem(this.logStorageKey);
      return logsString ? JSON.parse(logsString) : [];
    } catch (error) {
      console.error('Failed to retrieve logs:', error);
      return [];
    }
  }

  /**
   * Clear stored logs
   */
  async clearLogs(): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.logStorageKey);
    } catch (error) {
      console.error('Failed to clear logs:', error);
    }
  }

  /**
   * Export logs to file
   */
  async exportLogs(): Promise<string | null> {
    try {
      const logs = await this.getLogs();
      const logsText = logs
        .map(log => `${log.timestamp} [${LogLevel[log.level]}] ${log.message}${log.data ? ' ' + JSON.stringify(log.data) : ''}`)
        .join('\n');

      const fileName = `fine_print_logs_${new Date().toISOString().split('T')[0]}.txt`;
      const filePath = `${FileSystem.documentDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(filePath, logsText);
      return filePath;
    } catch (error) {
      console.error('Failed to export logs:', error);
      return null;
    }
  }

  /**
   * Get log statistics
   */
  async getLogStats(): Promise<{
    total: number;
    byLevel: Record<string, number>;
    oldestEntry?: string;
    newestEntry?: string;
  }> {
    try {
      const logs = await this.getLogs();
      const stats = {
        total: logs.length,
        byLevel: {
          DEBUG: 0,
          INFO: 0,
          WARN: 0,
          ERROR: 0,
        },
        oldestEntry: logs[logs.length - 1]?.timestamp,
        newestEntry: logs[0]?.timestamp,
      };

      logs.forEach(log => {
        const levelName = LogLevel[log.level];
        stats.byLevel[levelName]++;
      });

      return stats;
    } catch (error) {
      console.error('Failed to get log stats:', error);
      return {
        total: 0,
        byLevel: { DEBUG: 0, INFO: 0, WARN: 0, ERROR: 0 },
      };
    }
  }
}

export const logger = new Logger();