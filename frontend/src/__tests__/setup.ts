import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll, afterAll, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { handlers } from './__mocks__/handlers';

// Setup MSW server
export const server = setupServer(...handlers);

// Start server before all tests
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

// Clean up after each test
afterEach(() => {
  cleanup();
  server.resetHandlers();
});

// Clean up after all tests
afterAll(() => {
  server.close();
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock scrollTo
Object.defineProperty(window, 'scrollTo', {
  value: vi.fn(),
  writable: true,
});

// Mock HTMLElement.scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

// Mock localStorage
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  },
  writable: true,
});

// Mock sessionStorage
Object.defineProperty(window, 'sessionStorage', {
  value: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  },
  writable: true,
});

// Mock fetch if not available
if (!global.fetch) {
  global.fetch = vi.fn();
}

// Mock URL.createObjectURL
Object.defineProperty(URL, 'createObjectURL', {
  value: vi.fn(() => 'mock-object-url'),
});

Object.defineProperty(URL, 'revokeObjectURL', {
  value: vi.fn(),
});

// Mock FileReader
global.FileReader = vi.fn().mockImplementation(() => ({
  readAsText: vi.fn(),
  readAsDataURL: vi.fn(),
  readAsArrayBuffer: vi.fn(),
  onload: null,
  onerror: null,
  result: null,
}));

// Custom matchers
expect.extend({
  toHaveAccessibleName(received, expected) {
    const element = received;
    const accessibleName = element.getAttribute('aria-label') || 
                          element.getAttribute('aria-labelledby') || 
                          element.textContent;
    
    const pass = accessibleName === expected;
    
    return {
      message: () => 
        pass 
          ? `Expected element not to have accessible name "${expected}"`
          : `Expected element to have accessible name "${expected}", but got "${accessibleName}"`,
      pass,
    };
  },
  
  toBeInTheDocument(received) {
    const element = received;
    const pass = element && document.body.contains(element);
    
    return {
      message: () => 
        pass 
          ? 'Expected element not to be in the document'
          : 'Expected element to be in the document',
      pass,
    };
  },
  
  toHaveClass(received, className) {
    const element = received;
    const pass = element.classList.contains(className);
    
    return {
      message: () => 
        pass 
          ? `Expected element not to have class "${className}"`
          : `Expected element to have class "${className}"`,
      pass,
    };
  }
});

// Global test utilities
global.TestUtils = {
  sleep: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  
  waitForNextTick: () => new Promise(resolve => setTimeout(resolve, 0)),
  
  createMockFile: (
    name = 'test.txt',
    content = 'test content',
    type = 'text/plain'
  ) => {
    return new File([content], name, { type });
  },
  
  createMockEvent: (type: string, properties = {}) => {
    const event = new Event(type);
    Object.assign(event, properties);
    return event;
  }
};

// Console suppression for tests
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Warning: ReactDOM.render is deprecated')
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});