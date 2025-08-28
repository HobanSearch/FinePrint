import { jest } from '@jest/globals';

export class RedisMock {
  private data: Map<string, any> = new Map();
  private hashes: Map<string, Map<string, any>> = new Map();
  private sets: Map<string, Set<any>> = new Map();
  private lists: Map<string, any[]> = new Map();
  private expirations: Map<string, number> = new Map();

  // String operations
  get = jest.fn().mockImplementation((key: string) => {
    if (this.isExpired(key)) {
      this.data.delete(key);
      this.expirations.delete(key);
      return null;
    }
    return this.data.get(key) || null;
  });

  set = jest.fn().mockImplementation((key: string, value: any, ...args: any[]) => {
    this.data.set(key, value);
    
    // Handle EX (expiration in seconds)
    for (let i = 0; i < args.length; i++) {
      if (args[i] === 'EX' && args[i + 1]) {
        this.expirations.set(key, Date.now() + (args[i + 1] * 1000));
      }
    }
    
    return 'OK';
  });

  del = jest.fn().mockImplementation((...keys: string[]) => {
    let deleted = 0;
    keys.forEach(key => {
      if (this.data.has(key)) {
        this.data.delete(key);
        this.expirations.delete(key);
        deleted++;
      }
    });
    return deleted;
  });

  exists = jest.fn().mockImplementation((key: string) => {
    if (this.isExpired(key)) {
      this.data.delete(key);
      this.expirations.delete(key);
      return 0;
    }
    return this.data.has(key) ? 1 : 0;
  });

  expire = jest.fn().mockImplementation((key: string, seconds: number) => {
    if (this.data.has(key)) {
      this.expirations.set(key, Date.now() + (seconds * 1000));
      return 1;
    }
    return 0;
  });

  ttl = jest.fn().mockImplementation((key: string) => {
    const expiration = this.expirations.get(key);
    if (!expiration) return -1;
    
    const remaining = Math.ceil((expiration - Date.now()) / 1000);
    return remaining > 0 ? remaining : -2;
  });

  // Hash operations
  hget = jest.fn().mockImplementation((key: string, field: string) => {
    const hash = this.hashes.get(key);
    return hash ? hash.get(field) || null : null;
  });

  hset = jest.fn().mockImplementation((key: string, field: string, value: any) => {
    if (!this.hashes.has(key)) {
      this.hashes.set(key, new Map());
    }
    const hash = this.hashes.get(key)!;
    const isNew = !hash.has(field);
    hash.set(field, value);
    return isNew ? 1 : 0;
  });

  hgetall = jest.fn().mockImplementation((key: string) => {
    const hash = this.hashes.get(key);
    if (!hash) return {};
    
    const result: Record<string, any> = {};
    hash.forEach((value, field) => {
      result[field] = value;
    });
    return result;
  });

  hdel = jest.fn().mockImplementation((key: string, ...fields: string[]) => {
    const hash = this.hashes.get(key);
    if (!hash) return 0;
    
    let deleted = 0;
    fields.forEach(field => {
      if (hash.delete(field)) {
        deleted++;
      }
    });
    
    if (hash.size === 0) {
      this.hashes.delete(key);
    }
    
    return deleted;
  });

  // Set operations
  sadd = jest.fn().mockImplementation((key: string, ...members: any[]) => {
    if (!this.sets.has(key)) {
      this.sets.set(key, new Set());
    }
    const set = this.sets.get(key)!;
    let added = 0;
    members.forEach(member => {
      if (!set.has(member)) {
        set.add(member);
        added++;
      }
    });
    return added;
  });

  smembers = jest.fn().mockImplementation((key: string) => {
    const set = this.sets.get(key);
    return set ? Array.from(set) : [];
  });

  srem = jest.fn().mockImplementation((key: string, ...members: any[]) => {
    const set = this.sets.get(key);
    if (!set) return 0;
    
    let removed = 0;
    members.forEach(member => {
      if (set.delete(member)) {
        removed++;
      }
    });
    
    if (set.size === 0) {
      this.sets.delete(key);
    }
    
    return removed;
  });

  // List operations
  lpush = jest.fn().mockImplementation((key: string, ...values: any[]) => {
    if (!this.lists.has(key)) {
      this.lists.set(key, []);
    }
    const list = this.lists.get(key)!;
    values.reverse().forEach(value => {
      list.unshift(value);
    });
    return list.length;
  });

  rpush = jest.fn().mockImplementation((key: string, ...values: any[]) => {
    if (!this.lists.has(key)) {
      this.lists.set(key, []);
    }
    const list = this.lists.get(key)!;
    values.forEach(value => {
      list.push(value);
    });
    return list.length;
  });

  lpop = jest.fn().mockImplementation((key: string) => {
    const list = this.lists.get(key);
    if (!list || list.length === 0) return null;
    
    const value = list.shift();
    if (list.length === 0) {
      this.lists.delete(key);
    }
    return value;
  });

  rpop = jest.fn().mockImplementation((key: string) => {
    const list = this.lists.get(key);
    if (!list || list.length === 0) return null;
    
    const value = list.pop();
    if (list.length === 0) {
      this.lists.delete(key);
    }
    return value;
  });

  lrange = jest.fn().mockImplementation((key: string, start: number, stop: number) => {
    const list = this.lists.get(key);
    if (!list) return [];
    
    return list.slice(start, stop + 1);
  });

  // JSON operations (for RedisJSON)
  'json.set' = jest.fn().mockImplementation((key: string, path: string, value: any) => {
    this.data.set(key, JSON.stringify(value));
    return 'OK';
  });

  'json.get' = jest.fn().mockImplementation((key: string, path?: string) => {
    const value = this.data.get(key);
    return value ? JSON.parse(value) : null;
  });

  // Connection operations
  ping = jest.fn().mockResolvedValue('PONG');
  
  connect = jest.fn().mockResolvedValue(undefined);
  
  disconnect = jest.fn().mockResolvedValue(undefined);
  
  quit = jest.fn().mockResolvedValue('OK');

  // Utility operations
  flushall = jest.fn().mockImplementation(() => {
    this.data.clear();
    this.hashes.clear();
    this.sets.clear();
    this.lists.clear();
    this.expirations.clear();
    return 'OK';
  });

  flushdb = jest.fn().mockImplementation(() => {
    return this.flushall();
  });

  keys = jest.fn().mockImplementation((pattern: string) => {
    const regex = new RegExp(pattern.replace('*', '.*'));
    return Array.from(this.data.keys()).filter(key => regex.test(key));
  });

  // Helper methods
  private isExpired(key: string): boolean {
    const expiration = this.expirations.get(key);
    return expiration ? Date.now() > expiration : false;
  }

  // Test utilities
  clearMock() {
    this.data.clear();
    this.hashes.clear();
    this.sets.clear();
    this.lists.clear();
    this.expirations.clear();
    jest.clearAllMocks();
  }

  getMockData() {
    return {
      strings: Object.fromEntries(this.data),
      hashes: Object.fromEntries(
        Array.from(this.hashes.entries()).map(([key, value]) => [
          key,
          Object.fromEntries(value)
        ])
      ),
      sets: Object.fromEntries(
        Array.from(this.sets.entries()).map(([key, value]) => [
          key,
          Array.from(value)
        ])
      ),
      lists: Object.fromEntries(this.lists)
    };
  }
}

export const redisMock = new RedisMock();

// Factory function for creating Redis mock instances
export const createRedisMock = () => redisMock;