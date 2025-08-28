/**
 * Prisma client mock for testing
 * Provides comprehensive mocking for Prisma ORM operations
 */

import { jest } from '@jest/globals';

// Mock data storage
class MockPrismaDatabase {
  private data: Map<string, any[]> = new Map();
  private transactionContext: any = null;

  constructor() {
    this.setupDefaultData();
  }

  private setupDefaultData(): void {
    this.data.set('user', [
      {
        id: 'test-user-1',
        email: 'test1@example.com',
        firstName: 'Test',
        lastName: 'User1',
        password: 'hashed-password',
        role: 'user',
        subscription: null,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      },
    ]);

    this.data.set('document', [
      {
        id: 'test-doc-1',
        userId: 'test-user-1',
        title: 'Test Document',
        type: 'terms-of-service',
        content: 'Test document content',
        language: 'en',
        status: 'active',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      },
    ]);

    this.data.set('analysis', [
      {
        id: 'test-analysis-1',
        documentId: 'test-doc-1',
        userId: 'test-user-1',
        status: 'completed',
        overallRiskScore: 75,
        findings: [],
        executiveSummary: 'Test summary',
        processingTime: 5000,
        modelVersion: 'phi:2.7b',
        createdAt: new Date('2024-01-01'),
        completedAt: new Date('2024-01-01'),
      },
    ]);

    this.data.set('subscription', []);
    this.data.set('usage', []);
    this.data.set('notification', []);
  }

  // Generic CRUD operations
  private createMockModel(modelName: string) {
    const data = this.data.get(modelName) || [];

    return {
      findMany: jest.fn().mockImplementation(async (args: any = {}) => {
        let result = [...data];

        // Apply where clause
        if (args.where) {
          result = this.applyWhereClause(result, args.where);
        }

        // Apply ordering
        if (args.orderBy) {
          result = this.applyOrderBy(result, args.orderBy);
        }

        // Apply pagination
        if (args.skip) {
          result = result.slice(args.skip);
        }
        if (args.take) {
          result = result.slice(0, args.take);
        }

        // Apply select/include
        if (args.select || args.include) {
          result = this.applySelectInclude(result, args.select, args.include);
        }

        return result;
      }),

      findUnique: jest.fn().mockImplementation(async (args: any) => {
        const filtered = this.applyWhereClause(data, args.where);
        const result = filtered[0] || null;

        if (result && (args.select || args.include)) {
          return this.applySelectInclude([result], args.select, args.include)[0];
        }

        return result;
      }),

      findFirst: jest.fn().mockImplementation(async (args: any = {}) => {
        let result = [...data];

        if (args.where) {
          result = this.applyWhereClause(result, args.where);
        }

        if (args.orderBy) {
          result = this.applyOrderBy(result, args.orderBy);
        }

        const first = result[0] || null;

        if (first && (args.select || args.include)) {
          return this.applySelectInclude([first], args.select, args.include)[0];
        }

        return first;
      }),

      create: jest.fn().mockImplementation(async (args: any) => {
        const newItem = {
          id: `${modelName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          ...args.data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        data.push(newItem);
        this.data.set(modelName, data);

        if (args.select || args.include) {
          return this.applySelectInclude([newItem], args.select, args.include)[0];
        }

        return newItem;
      }),

      update: jest.fn().mockImplementation(async (args: any) => {
        const filtered = this.applyWhereClause(data, args.where);
        if (filtered.length === 0) {
          throw new Error(`${modelName} not found`);
        }

        const item = filtered[0];
        const index = data.findIndex(d => d.id === item.id);
        
        const updatedItem = {
          ...item,
          ...args.data,
          updatedAt: new Date(),
        };

        data[index] = updatedItem;
        this.data.set(modelName, data);

        if (args.select || args.include) {
          return this.applySelectInclude([updatedItem], args.select, args.include)[0];
        }

        return updatedItem;
      }),

      updateMany: jest.fn().mockImplementation(async (args: any) => {
        const filtered = this.applyWhereClause(data, args.where);
        let count = 0;

        filtered.forEach(item => {
          const index = data.findIndex(d => d.id === item.id);
          if (index !== -1) {
            data[index] = {
              ...item,
              ...args.data,
              updatedAt: new Date(),
            };
            count++;
          }
        });

        this.data.set(modelName, data);
        return { count };
      }),

      delete: jest.fn().mockImplementation(async (args: any) => {
        const filtered = this.applyWhereClause(data, args.where);
        if (filtered.length === 0) {
          throw new Error(`${modelName} not found`);
        }

        const item = filtered[0];
        const index = data.findIndex(d => d.id === item.id);
        data.splice(index, 1);
        this.data.set(modelName, data);

        return item;
      }),

      deleteMany: jest.fn().mockImplementation(async (args: any = {}) => {
        const originalLength = data.length;
        let newData = data;

        if (args.where) {
          const toDelete = this.applyWhereClause(data, args.where);
          const idsToDelete = new Set(toDelete.map(item => item.id));
          newData = data.filter(item => !idsToDelete.has(item.id));
        } else {
          newData = [];
        }

        this.data.set(modelName, newData);
        return { count: originalLength - newData.length };
      }),

      count: jest.fn().mockImplementation(async (args: any = {}) => {
        let result = [...data];

        if (args.where) {
          result = this.applyWhereClause(result, args.where);
        }

        return result.length;
      }),

      aggregate: jest.fn().mockImplementation(async (args: any) => {
        let result = [...data];

        if (args.where) {
          result = this.applyWhereClause(result, args.where);
        }

        const aggregation: any = {};

        if (args._count) {
          aggregation._count = result.length;
        }

        if (args._avg) {
          for (const field of Object.keys(args._avg)) {
            const values = result.map(item => item[field]).filter(v => typeof v === 'number');
            aggregation._avg = aggregation._avg || {};
            aggregation._avg[field] = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
          }
        }

        if (args._sum) {
          for (const field of Object.keys(args._sum)) {
            const values = result.map(item => item[field]).filter(v => typeof v === 'number');
            aggregation._sum = aggregation._sum || {};
            aggregation._sum[field] = values.reduce((a, b) => a + b, 0);
          }
        }

        if (args._min) {
          for (const field of Object.keys(args._min)) {
            const values = result.map(item => item[field]).filter(v => v !== null && v !== undefined);
            aggregation._min = aggregation._min || {};
            aggregation._min[field] = values.length > 0 ? Math.min(...values) : null;
          }
        }

        if (args._max) {
          for (const field of Object.keys(args._max)) {
            const values = result.map(item => item[field]).filter(v => v !== null && v !== undefined);
            aggregation._max = aggregation._max || {};
            aggregation._max[field] = values.length > 0 ? Math.max(...values) : null;
          }
        }

        return aggregation;
      }),

      // Batch operations
      createMany: jest.fn().mockImplementation(async (args: any) => {
        const newItems = args.data.map((item: any) => ({
          id: `${modelName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          ...item,
          createdAt: new Date(),
          updatedAt: new Date(),
        }));

        data.push(...newItems);
        this.data.set(modelName, data);

        return { count: newItems.length };
      }),

      upsert: jest.fn().mockImplementation(async (args: any) => {
        const existing = this.applyWhereClause(data, args.where);

        if (existing.length > 0) {
          // Update
          const item = existing[0];
          const index = data.findIndex(d => d.id === item.id);
          const updatedItem = {
            ...item,
            ...args.update,
            updatedAt: new Date(),
          };
          data[index] = updatedItem;
          this.data.set(modelName, data);
          return updatedItem;
        } else {
          // Create
          const newItem = {
            id: `${modelName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            ...args.create,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          data.push(newItem);
          this.data.set(modelName, data);
          return newItem;
        }
      }),
    };
  }

  private applyWhereClause(data: any[], where: any): any[] {
    if (!where) return data;

    return data.filter(item => {
      return Object.entries(where).every(([key, value]) => {
        if (typeof value === 'object' && value !== null) {
          // Handle operators like { gt: 5 }, { contains: 'text' }, etc.
          return Object.entries(value).every(([operator, operatorValue]) => {
            switch (operator) {
              case 'equals':
                return item[key] === operatorValue;
              case 'not':
                return item[key] !== operatorValue;
              case 'in':
                return Array.isArray(operatorValue) && operatorValue.includes(item[key]);
              case 'notIn':
                return Array.isArray(operatorValue) && !operatorValue.includes(item[key]);
              case 'lt':
                return item[key] < operatorValue;
              case 'lte':
                return item[key] <= operatorValue;
              case 'gt':
                return item[key] > operatorValue;
              case 'gte':
                return item[key] >= operatorValue;
              case 'contains':
                return typeof item[key] === 'string' && item[key].includes(operatorValue as string);
              case 'startsWith':
                return typeof item[key] === 'string' && item[key].startsWith(operatorValue as string);
              case 'endsWith':
                return typeof item[key] === 'string' && item[key].endsWith(operatorValue as string);
              default:
                return true;
            }
          });
        } else {
          return item[key] === value;
        }
      });
    });
  }

  private applyOrderBy(data: any[], orderBy: any): any[] {
    if (!orderBy) return data;

    if (Array.isArray(orderBy)) {
      // Multiple order by clauses
      return data.sort((a, b) => {
        for (const order of orderBy) {
          const [field, direction] = Object.entries(order)[0];
          const comparison = this.compareValues(a[field], b[field]);
          if (comparison !== 0) {
            return direction === 'desc' ? -comparison : comparison;
          }
        }
        return 0;
      });
    } else {
      // Single order by clause
      const [field, direction] = Object.entries(orderBy)[0];
      return data.sort((a, b) => {
        const comparison = this.compareValues(a[field], b[field]);
        return direction === 'desc' ? -comparison : comparison;
      });
    }
  }

  private compareValues(a: any, b: any): number {
    if (a === b) return 0;
    if (a === null || a === undefined) return -1;
    if (b === null || b === undefined) return 1;
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }

  private applySelectInclude(data: any[], select?: any, include?: any): any[] {
    if (!select && !include) return data;

    return data.map(item => {
      let result: any = {};

      if (select) {
        // Only include selected fields
        Object.keys(select).forEach(key => {
          if (select[key] === true) {
            result[key] = item[key];
          }
        });
      } else {
        // Include all fields
        result = { ...item };
      }

      if (include) {
        // Add related data (simplified - would need proper relation handling)
        Object.keys(include).forEach(relation => {
          if (include[relation] === true) {
            result[relation] = null; // Placeholder for related data
          }
        });
      }

      return result;
    });
  }

  // Test utilities
  clearAllData(): void {
    this.data.clear();
    this.setupDefaultData();
  }

  addTestData(modelName: string, data: any[]): void {
    const existing = this.data.get(modelName) || [];
    this.data.set(modelName, [...existing, ...data]);
  }

  getModelData(modelName: string): any[] {
    return this.data.get(modelName) || [];
  }
}

const mockPrismaDb = new MockPrismaDatabase();

// Create the mock Prisma client
const mockPrisma = {
  user: mockPrismaDb.createMockModel('user'),
  document: mockPrismaDb.createMockModel('document'),
  analysis: mockPrismaDb.createMockModel('analysis'),
  subscription: mockPrismaDb.createMockModel('subscription'),
  usage: mockPrismaDb.createMockModel('usage'),
  notification: mockPrismaDb.createMockModel('notification'),
  
  // Transaction support
  $transaction: jest.fn().mockImplementation(async (operations: any[]) => {
    // Simple transaction simulation - execute all operations
    const results = [];
    for (const operation of operations) {
      if (typeof operation === 'function') {
        results.push(await operation(mockPrisma));
      } else {
        results.push(await operation);
      }
    }
    return results;
  }),

  // Connection management
  $connect: jest.fn().mockResolvedValue(undefined),
  $disconnect: jest.fn().mockResolvedValue(undefined),

  // Raw queries
  $queryRaw: jest.fn().mockImplementation(async (query: any, ...params: any[]) => {
    // Simple mock implementation
    return [];
  }),

  $executeRaw: jest.fn().mockImplementation(async (query: any, ...params: any[]) => {
    // Simple mock implementation
    return 0;
  }),

  // Test utilities
  __mockInstance: mockPrismaDb,
  __clearAllData: () => mockPrismaDb.clearAllData(),
  __addTestData: (model: string, data: any[]) => mockPrismaDb.addTestData(model, data),
  __getModelData: (model: string) => mockPrismaDb.getModelData(model),
};

export default mockPrisma;