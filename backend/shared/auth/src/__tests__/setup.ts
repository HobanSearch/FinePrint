/**
 * Fine Print AI - Test Setup
 * Global test configuration and utilities
 */

import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';

// Mock Redis for testing
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
    keys: jest.fn(),
    sadd: jest.fn(),
    srem: jest.fn(),
    smembers: jest.fn(),
    ping: jest.fn().mockResolvedValue('PONG'),
    quit: jest.fn(),
    on: jest.fn(),
    off: jest.fn()
  }));
});

// Mock Prisma for testing
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $queryRaw: jest.fn(),
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    },
    session: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    },
    certificate: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    }
  }))
}));

// Mock external services
jest.mock('geoip-lite');
jest.mock('ua-parser-js');
jest.mock('node-forge');
jest.mock('@simplewebauthn/server');

// Global test configuration
beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.resetAllMocks();
});

// Test utilities
export const createMockRedis = () => {
  return new Redis() as jest.Mocked<Redis>;
};

export const createMockPrisma = () => {
  return new PrismaClient() as jest.Mocked<PrismaClient>;
};

export const createMockLogger = () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  trace: jest.fn()
});

export const createMockConfigService = () => ({
  get: jest.fn(),
  set: jest.fn(),
  getFeatureFlag: jest.fn().mockReturnValue(true),
  getDynamicConfig: jest.fn()
});

// Mock data factories
export const createMockUser = (overrides = {}) => ({
  id: 'user-123',
  email: 'test@example.com',
  passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$hash',
  role: 'user',
  isActive: true,
  emailVerified: true,
  mfaEnabled: false,
  mfaMethods: [],
  trustedDevices: [],
  lastLoginAt: new Date(),
  failedLoginAttempts: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides
});

export const createMockDeviceInfo = (overrides = {}) => ({
  deviceId: 'device-123',
  fingerprint: 'fingerprint-hash',
  name: 'Test Device',
  type: 'desktop' as const,
  os: 'macOS',
  browser: 'Chrome',
  version: '120.0',
  trusted: false,
  ...overrides
});

export const createMockAuthContext = (overrides = {}) => ({
  userId: 'user-123',
  sessionId: 'session-123',
  deviceId: 'device-123',
  ipAddress: '192.168.1.100',
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  location: {
    country: 'US',
    region: 'CA',
    city: 'San Francisco',
    latitude: 37.7749,
    longitude: -122.4194,
    timezone: 'America/Los_Angeles'
  },
  riskScore: 25,
  authenticationMethods: ['password'],
  trustedDevice: false,
  timestamp: new Date(),
  ...overrides
});

export const createMockTokenPayload = (overrides = {}) => ({
  sub: 'user-123',
  iss: 'fineprintai.com',
  aud: 'fineprintai-api',
  exp: Math.floor(Date.now() / 1000) + 3600,
  nbf: Math.floor(Date.now() / 1000),
  iat: Math.floor(Date.now() / 1000),
  jti: 'token-123',
  email: 'test@example.com',
  role: 'user',
  roles: ['user'],
  permissions: ['document:read'],
  sessionId: 'session-123',
  deviceId: 'device-123',
  platform: 'web' as const,
  riskScore: 25,
  mfaVerified: false,
  ...overrides
});

// Test constants
export const TEST_CONFIG = {
  REDIS_URL: 'redis://localhost:6379',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/fineprintai_test',
  JWT_SECRET: 'test-jwt-secret-key-for-testing-only',
  MFA_SECRET: 'test-mfa-secret-key-for-testing-only',
  ENCRYPTION_KEY: 'test-encryption-key-for-testing-only-32-chars'
};