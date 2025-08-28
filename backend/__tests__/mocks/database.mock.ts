/**
 * Database mock for testing
 * Provides in-memory database operations for tests
 */

import { jest } from '@jest/globals';

export interface MockDatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

export interface MockQueryResult {
  rows: any[];
  rowCount: number;
  command: string;
}

class MockDatabase {
  private connected = false;
  private transactions: Set<string> = new Set();
  private data: Map<string, any[]> = new Map();
  private queryHistory: Array<{ query: string; params?: any[]; timestamp: Date }> = [];

  constructor() {
    this.setupDefaultData();
  }

  private setupDefaultData(): void {
    // Setup default test data
    this.data.set('users', [
      {
        id: 'test-user-1',
        email: 'test1@example.com',
        firstName: 'Test',
        lastName: 'User1',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      },
      {
        id: 'test-user-2',
        email: 'test2@example.com',
        firstName: 'Test',
        lastName: 'User2',
        createdAt: new Date('2024-01-02'),
        updatedAt: new Date('2024-01-02'),
      },
    ]);

    this.data.set('documents', [
      {
        id: 'test-doc-1',
        userId: 'test-user-1',
        title: 'Test Contract',
        type: 'contract',
        content: 'Test contract content',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      },
    ]);

    this.data.set('analyses', [
      {
        id: 'test-analysis-1',
        documentId: 'test-doc-1',
        status: 'completed',
        overallRiskScore: 75,
        findings: [],
        createdAt: new Date('2024-01-01'),
        completedAt: new Date('2024-01-01'),
      },
    ]);
  }

  async connect(config?: MockDatabaseConfig): Promise<void> {
    if (this.connected) {
      throw new Error('Database already connected');
    }
    
    // Simulate connection delay
    await new Promise(resolve => setTimeout(resolve, 10));
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (!this.connected) {
      throw new Error('Database not connected');
    }
    
    this.connected = false;
    this.transactions.clear();
  }

  isConnected(): boolean {
    return this.connected;
  }

  async query(sql: string, params?: any[]): Promise<MockQueryResult> {
    if (!this.connected) {
      throw new Error('Database not connected');
    }

    // Log query for debugging
    this.queryHistory.push({
      query: sql,
      params,
      timestamp: new Date(),
    });

    // Simple query parsing for common operations
    const normalizedSql = sql.trim().toLowerCase();
    
    if (normalizedSql.startsWith('select')) {
      return this.handleSelect(sql, params);
    } else if (normalizedSql.startsWith('insert')) {
      return this.handleInsert(sql, params);
    } else if (normalizedSql.startsWith('update')) {
      return this.handleUpdate(sql, params);
    } else if (normalizedSql.startsWith('delete')) {
      return this.handleDelete(sql, params);
    }

    // Default response for other queries
    return {
      rows: [],
      rowCount: 0,
      command: 'UNKNOWN',
    };
  }

  private handleSelect(sql: string, params?: any[]): MockQueryResult {
    // Extract table name (simplified)
    const tableMatch = sql.match(/from\s+(\w+)/i);
    if (!tableMatch) {
      return { rows: [], rowCount: 0, command: 'SELECT' };
    }

    const tableName = tableMatch[1];
    const tableData = this.data.get(tableName) || [];

    // Simple WHERE clause handling
    let filteredData = [...tableData];
    
    if (sql.includes('WHERE') && params && params.length > 0) {
      // Very basic parameter substitution - in real implementation would be more sophisticated
      if (sql.includes('id = $1') || sql.includes('id = ?')) {
        filteredData = tableData.filter(row => row.id === params[0]);
      } else if (sql.includes('email = $1') || sql.includes('email = ?')) {
        filteredData = tableData.filter(row => row.email === params[0]);
      }
    }

    return {
      rows: filteredData,
      rowCount: filteredData.length,
      command: 'SELECT',
    };
  }

  private handleInsert(sql: string, params?: any[]): MockQueryResult {
    const tableMatch = sql.match(/insert\s+into\s+(\w+)/i);
    if (!tableMatch || !params) {
      return { rows: [], rowCount: 0, command: 'INSERT' };
    }

    const tableName = tableMatch[1];
    const tableData = this.data.get(tableName) || [];

    // Extract column names
    const columnsMatch = sql.match(/\(([^)]+)\)/);
    if (!columnsMatch) {
      return { rows: [], rowCount: 0, command: 'INSERT' };
    }

    const columns = columnsMatch[1].split(',').map(col => col.trim());
    
    // Create new record
    const newRecord: any = {};
    columns.forEach((col, index) => {
      newRecord[col] = params[index];
    });

    // Add timestamps if not provided
    if (!newRecord.createdAt) {
      newRecord.createdAt = new Date();
    }
    if (!newRecord.updatedAt) {
      newRecord.updatedAt = new Date();
    }

    tableData.push(newRecord);
    this.data.set(tableName, tableData);

    return {
      rows: [newRecord],
      rowCount: 1,
      command: 'INSERT',
    };
  }

  private handleUpdate(sql: string, params?: any[]): MockQueryResult {
    const tableMatch = sql.match(/update\s+(\w+)/i);
    if (!tableMatch || !params) {
      return { rows: [], rowCount: 0, command: 'UPDATE' };
    }

    const tableName = tableMatch[1];
    const tableData = this.data.get(tableName) || [];

    // Simple WHERE clause handling for updates
    let updatedCount = 0;
    const updatedRows: any[] = [];

    if (sql.includes('WHERE id = $') || sql.includes('WHERE id = ?')) {
      const id = params[params.length - 1]; // Assume ID is last parameter
      
      tableData.forEach(row => {
        if (row.id === id) {
          // Update row (simplified - would need proper column mapping)
          row.updatedAt = new Date();
          updatedRows.push(row);
          updatedCount++;
        }
      });
    }

    return {
      rows: updatedRows,
      rowCount: updatedCount,
      command: 'UPDATE',
    };
  }

  private handleDelete(sql: string, params?: any[]): MockQueryResult {
    const tableMatch = sql.match(/delete\s+from\s+(\w+)/i);
    if (!tableMatch) {
      return { rows: [], rowCount: 0, command: 'DELETE' };
    }

    const tableName = tableMatch[1];
    const tableData = this.data.get(tableName) || [];

    let deletedCount = 0;

    if (sql.includes('WHERE id = $') || sql.includes('WHERE id = ?')) {
      const id = params?.[0];
      const originalLength = tableData.length;
      const filteredData = tableData.filter(row => row.id !== id);
      deletedCount = originalLength - filteredData.length;
      this.data.set(tableName, filteredData);
    }

    return {
      rows: [],
      rowCount: deletedCount,
      command: 'DELETE',
    };
  }

  async beginTransaction(): Promise<string> {
    const transactionId = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.transactions.add(transactionId);
    return transactionId;
  }

  async commitTransaction(transactionId: string): Promise<void> {
    if (!this.transactions.has(transactionId)) {
      throw new Error('Transaction not found');
    }
    this.transactions.delete(transactionId);
  }

  async rollbackTransaction(transactionId: string): Promise<void> {
    if (!this.transactions.has(transactionId)) {
      throw new Error('Transaction not found');
    }
    this.transactions.delete(transactionId);
    // In a real implementation, you'd restore the state
  }

  // Test utilities
  clearAllData(): void {
    this.data.clear();
    this.setupDefaultData();
  }

  addTestData(tableName: string, data: any[]): void {
    this.data.set(tableName, [...(this.data.get(tableName) || []), ...data]);
  }

  getQueryHistory(): Array<{ query: string; params?: any[]; timestamp: Date }> {
    return [...this.queryHistory];
  }

  clearQueryHistory(): void {
    this.queryHistory = [];
  }

  getTableData(tableName: string): any[] {
    return this.data.get(tableName) || [];
  }
}

// Create mock instance
const mockDatabase = new MockDatabase();

// Jest mock functions
export const mockConnect = jest.fn().mockImplementation((config) => mockDatabase.connect(config));
export const mockDisconnect = jest.fn().mockImplementation(() => mockDatabase.disconnect());
export const mockQuery = jest.fn().mockImplementation((sql, params) => mockDatabase.query(sql, params));
export const mockBeginTransaction = jest.fn().mockImplementation(() => mockDatabase.beginTransaction());
export const mockCommitTransaction = jest.fn().mockImplementation((id) => mockDatabase.commitTransaction(id));
export const mockRollbackTransaction = jest.fn().mockImplementation((id) => mockDatabase.rollbackTransaction(id));

// Export default mock
export default {
  connect: mockConnect,
  disconnect: mockDisconnect,
  query: mockQuery,
  beginTransaction: mockBeginTransaction,
  commitTransaction: mockCommitTransaction,
  rollbackTransaction: mockRollbackTransaction,
  isConnected: jest.fn().mockImplementation(() => mockDatabase.isConnected()),
  
  // Test utilities
  __mockInstance: mockDatabase,
  __clearAllData: () => mockDatabase.clearAllData(),
  __addTestData: (table: string, data: any[]) => mockDatabase.addTestData(table, data),
  __getQueryHistory: () => mockDatabase.getQueryHistory(),
  __clearQueryHistory: () => mockDatabase.clearQueryHistory(),
  __getTableData: (table: string) => mockDatabase.getTableData(table),
};