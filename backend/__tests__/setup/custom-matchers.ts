/**
 * Custom Jest matchers for Fine Print AI testing
 * Provides domain-specific assertions for better test readability
 */

import { expect } from '@jest/globals';
import { MatcherFunction } from 'expect';

// Extend Jest matchers interface
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidUUID(): R;
      toBeValidTimestamp(): R;
      toBeValidEmail(): R;
      toHaveValidAnalysisStructure(): R;
      toHaveValidFinding(): R;
      toBeWithinPerformanceThreshold(threshold: number): R;
      toHaveValidSecurityHeaders(): R;
      toBeValidJWT(): R;
      toHaveValidRiskScore(): R;
    }
  }
}

// UUID validation matcher
const toBeValidUUID: MatcherFunction<[unknown]> = function (received: unknown) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  
  const pass = typeof received === 'string' && uuidRegex.test(received);
  
  if (pass) {
    return {
      message: () => `expected ${received} not to be a valid UUID`,
      pass: true,
    };
  } else {
    return {
      message: () => `expected ${received} to be a valid UUID`,
      pass: false,
    };
  }
};

// Timestamp validation matcher
const toBeValidTimestamp: MatcherFunction<[unknown]> = function (received: unknown) {
  let pass = false;
  let timestamp: Date;
  
  try {
    if (typeof received === 'string' || typeof received === 'number') {
      timestamp = new Date(received);
      pass = !isNaN(timestamp.getTime()) && timestamp.getTime() > 0;
    } else if (received instanceof Date) {
      pass = !isNaN(received.getTime());
    }
  } catch {
    pass = false;
  }
  
  if (pass) {
    return {
      message: () => `expected ${received} not to be a valid timestamp`,
      pass: true,
    };
  } else {
    return {
      message: () => `expected ${received} to be a valid timestamp`,
      pass: false,
    };
  }
};

// Email validation matcher
const toBeValidEmail: MatcherFunction<[unknown]> = function (received: unknown) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  const pass = typeof received === 'string' && emailRegex.test(received);
  
  if (pass) {
    return {
      message: () => `expected ${received} not to be a valid email`,
      pass: true,
    };
  } else {
    return {
      message: () => `expected ${received} to be a valid email`,
      pass: false,
    };
  }
};

// Analysis structure validation matcher
const toHaveValidAnalysisStructure: MatcherFunction<[unknown]> = function (received: unknown) {
  if (typeof received !== 'object' || received === null) {
    return {
      message: () => `expected ${received} to be an object`,
      pass: false,
    };
  }
  
  const analysis = received as any;
  const requiredFields = ['id', 'status', 'documentId', 'createdAt'];
  const optionalFields = ['findings', 'overallRiskScore', 'executiveSummary', 'completedAt'];
  
  const missingFields = requiredFields.filter(field => !(field in analysis));
  
  if (missingFields.length > 0) {
    return {
      message: () => `expected analysis to have required fields: ${missingFields.join(', ')}`,
      pass: false,
    };
  }
  
  // Validate field types
  if (typeof analysis.id !== 'string' || !analysis.id) {
    return {
      message: () => `expected analysis.id to be a non-empty string`,
      pass: false,
    };
  }
  
  const validStatuses = ['pending', 'processing', 'completed', 'failed'];
  if (!validStatuses.includes(analysis.status)) {
    return {
      message: () => `expected analysis.status to be one of: ${validStatuses.join(', ')}`,
      pass: false,
    };
  }
  
  return {
    message: () => `expected ${received} not to have valid analysis structure`,
    pass: true,
  };
};

// Finding validation matcher
const toHaveValidFinding: MatcherFunction<[unknown]> = function (received: unknown) {
  if (typeof received !== 'object' || received === null) {
    return {
      message: () => `expected ${received} to be an object`,
      pass: false,
    };
  }
  
  const finding = received as any;
  const requiredFields = ['id', 'category', 'title', 'description', 'severity', 'confidence'];
  
  const missingFields = requiredFields.filter(field => !(field in finding));
  
  if (missingFields.length > 0) {
    return {
      message: () => `expected finding to have required fields: ${missingFields.join(', ')}`,
      pass: false,
    };
  }
  
  const validSeverities = ['low', 'medium', 'high', 'critical'];
  if (!validSeverities.includes(finding.severity)) {
    return {
      message: () => `expected finding.severity to be one of: ${validSeverities.join(', ')}`,
      pass: false,
    };
  }
  
  if (typeof finding.confidence !== 'number' || finding.confidence < 0 || finding.confidence > 1) {
    return {
      message: () => `expected finding.confidence to be a number between 0 and 1`,
      pass: false,
    };
  }
  
  return {
    message: () => `expected ${received} not to have valid finding structure`,
    pass: true,
  };
};

// Performance threshold matcher
const toBeWithinPerformanceThreshold: MatcherFunction<[number]> = function (received: unknown, threshold: number) {
  if (typeof received !== 'number') {
    return {
      message: () => `expected ${received} to be a number`,
      pass: false,
    };
  }
  
  const pass = received <= threshold;
  
  if (pass) {
    return {
      message: () => `expected ${received}ms not to be within performance threshold of ${threshold}ms`,
      pass: true,
    };
  } else {
    return {
      message: () => `expected ${received}ms to be within performance threshold of ${threshold}ms`,
      pass: false,
    };
  }
};

// Security headers validation matcher
const toHaveValidSecurityHeaders: MatcherFunction<[unknown]> = function (received: unknown) {
  if (typeof received !== 'object' || received === null) {
    return {
      message: () => `expected ${received} to be an object`,
      pass: false,
    };
  }
  
  const headers = received as Record<string, string>;
  const requiredSecurityHeaders = [
    'x-content-type-options',
    'x-frame-options',
    'x-xss-protection',
    'strict-transport-security',
    'content-security-policy'
  ];
  
  const missingHeaders = requiredSecurityHeaders.filter(
    header => !(header in headers) && !(header.toLowerCase() in headers)
  );
  
  if (missingHeaders.length > 0) {
    return {
      message: () => `expected response to have security headers: ${missingHeaders.join(', ')}`,
      pass: false,
    };
  }
  
  return {
    message: () => `expected response not to have all required security headers`,
    pass: true,
  };
};

// JWT validation matcher
const toBeValidJWT: MatcherFunction<[unknown]> = function (received: unknown) {
  if (typeof received !== 'string') {
    return {
      message: () => `expected ${received} to be a string`,
      pass: false,
    };
  }
  
  const jwtParts = received.split('.');
  const pass = jwtParts.length === 3 && jwtParts.every(part => part.length > 0);
  
  if (pass) {
    return {
      message: () => `expected ${received} not to be a valid JWT`,
      pass: true,
    };
  } else {
    return {
      message: () => `expected ${received} to be a valid JWT (header.payload.signature)`,
      pass: false,
    };
  }
};

// Risk score validation matcher
const toHaveValidRiskScore: MatcherFunction<[unknown]> = function (received: unknown) {
  if (typeof received !== 'number') {
    return {
      message: () => `expected ${received} to be a number`,
      pass: false,
    };
  }
  
  const pass = received >= 0 && received <= 100 && Number.isFinite(received);
  
  if (pass) {
    return {
      message: () => `expected ${received} not to be a valid risk score`,
      pass: true,
    };
  } else {
    return {
      message: () => `expected ${received} to be a valid risk score (0-100)`,
      pass: false,
    };
  }
};

// Register all custom matchers
expect.extend({
  toBeValidUUID,
  toBeValidTimestamp,
  toBeValidEmail,
  toHaveValidAnalysisStructure,
  toHaveValidFinding,
  toBeWithinPerformanceThreshold,
  toHaveValidSecurityHeaders,
  toBeValidJWT,
  toHaveValidRiskScore,
});

export {};