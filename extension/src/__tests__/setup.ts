import '@testing-library/jest-dom'

// Mock Chrome APIs
const mockChrome = {
  runtime: {
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
    sendMessage: jest.fn(),
    openOptionsPage: jest.fn(),
    getURL: jest.fn((path: string) => `chrome-extension://mock-id/${path}`),
    id: 'mock-extension-id',
  },
  storage: {
    sync: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue({}),
      remove: jest.fn().mockResolvedValue({}),
      clear: jest.fn().mockResolvedValue({}),
      getBytesInUse: jest.fn().mockResolvedValue(0),
      QUOTA_BYTES: 102400,
    },
    local: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue({}),
      remove: jest.fn().mockResolvedValue({}),
      clear: jest.fn().mockResolvedValue({}),
    },
    onChanged: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
  },
  tabs: {
    query: jest.fn().mockResolvedValue([
      { id: 1, url: 'https://example.com', title: 'Example' }
    ]),
    get: jest.fn().mockResolvedValue({
      id: 1,
      url: 'https://example.com',
      title: 'Example'
    }),
    sendMessage: jest.fn().mockResolvedValue({}),
    create: jest.fn(),
    update: jest.fn(),
    onActivated: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
    onUpdated: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
  },
  action: {
    setBadgeText: jest.fn(),
    setBadgeBackgroundColor: jest.fn(),
    openPopup: jest.fn(),
  },
  contextMenus: {
    create: jest.fn(),
    removeAll: jest.fn(),
    onClicked: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
  },
  notifications: {
    create: jest.fn(),
    onClicked: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
  },
  scripting: {
    executeScript: jest.fn(),
  },
}

// Make chrome available globally
;(global as any).chrome = mockChrome

// Mock fetch
global.fetch = jest.fn()

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
})

// Mock clipboard API
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: jest.fn().mockResolvedValue(undefined),
    readText: jest.fn().mockResolvedValue(''),
  },
})

// Suppress console warnings during tests
const originalConsoleWarn = console.warn
beforeAll(() => {
  console.warn = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('React Router Future Flag Warning')
    ) {
      return
    }
    originalConsoleWarn(...args)
  }
})

afterAll(() => {
  console.warn = originalConsoleWarn
})