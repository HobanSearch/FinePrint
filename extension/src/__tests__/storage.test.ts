import { ExtensionStorage, DEFAULT_SETTINGS } from '@/lib/storage'

// Mock chrome.storage
const mockStorageSync = {
  get: jest.fn(),
  set: jest.fn(),
  remove: jest.fn(),
  clear: jest.fn(),
}

const mockStorageLocal = {
  get: jest.fn(),
  set: jest.fn(),
  remove: jest.fn(),
  clear: jest.fn(),
}

// Mock Plasmo Storage
jest.mock('@plasmohq/storage', () => ({
  Storage: jest.fn().mockImplementation(({ area }) => {
    if (area === 'sync') {
      return {
        get: mockStorageSync.get,
        set: mockStorageSync.set,
        remove: mockStorageSync.remove,
        clear: mockStorageSync.clear,
        watch: jest.fn(),
      }
    } else {
      return {
        get: mockStorageLocal.get,
        set: mockStorageLocal.set,
        remove: mockStorageLocal.remove,
        clear: mockStorageLocal.clear,
      }
    }
  }),
}))

describe('ExtensionStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('getSettings', () => {
    it('should return default settings when no stored settings exist', async () => {
      mockStorageSync.get.mockResolvedValue(undefined)

      const settings = await ExtensionStorage.getSettings()

      expect(settings).toEqual(DEFAULT_SETTINGS)
      expect(mockStorageSync.get).toHaveBeenCalledWith('settings')
    })

    it('should merge stored settings with defaults', async () => {
      const storedSettings = { enabled: false, theme: 'dark' }
      mockStorageSync.get.mockResolvedValue(storedSettings)

      const settings = await ExtensionStorage.getSettings()

      expect(settings).toEqual({
        ...DEFAULT_SETTINGS,
        ...storedSettings,
      })
    })
  })

  describe('setSettings', () => {
    it('should update settings and broadcast changes', async () => {
      const currentSettings = DEFAULT_SETTINGS
      const newSettings = { enabled: false }
      
      mockStorageSync.get.mockResolvedValue(currentSettings)
      mockStorageSync.set.mockResolvedValue(undefined)

      // Mock broadcastMessage
      jest.spyOn(ExtensionStorage, 'broadcastMessage').mockResolvedValue(undefined)

      await ExtensionStorage.setSettings(newSettings)

      expect(mockStorageSync.set).toHaveBeenCalledWith('settings', {
        ...currentSettings,
        ...newSettings,
      })
      expect(ExtensionStorage.broadcastMessage).toHaveBeenCalledWith({
        type: 'SETTINGS_UPDATED',
        payload: { ...currentSettings, ...newSettings },
      })
    })
  })

  describe('updateSetting', () => {
    it('should update a single setting', async () => {
      mockStorageSync.get.mockResolvedValue(DEFAULT_SETTINGS)
      mockStorageSync.set.mockResolvedValue(undefined)
      jest.spyOn(ExtensionStorage, 'broadcastMessage').mockResolvedValue(undefined)

      await ExtensionStorage.updateSetting('theme', 'dark')

      expect(mockStorageSync.set).toHaveBeenCalledWith('settings', {
        ...DEFAULT_SETTINGS,
        theme: 'dark',
      })
    })
  })

  describe('cache management', () => {
    it('should get empty cache when none exists', async () => {
      mockStorageLocal.get.mockResolvedValue(undefined)

      const cache = await ExtensionStorage.getCache()

      expect(cache).toEqual({})
      expect(mockStorageLocal.get).toHaveBeenCalledWith('analysisCache')
    })

    it('should set cache entry', async () => {
      const mockCache = {}
      mockStorageLocal.get.mockResolvedValue(mockCache)
      mockStorageLocal.set.mockResolvedValue(undefined)

      const url = 'https://example.com/terms'
      const result = { riskScore: 75, findings: [] }
      const hash = 'abc123'

      await ExtensionStorage.setCacheEntry(url, result, hash)

      expect(mockStorageLocal.set).toHaveBeenCalledWith('analysisCache', {
        [url]: {
          result,
          timestamp: expect.any(Number),
          hash,
        },
      })
    })

    it('should limit cache size to 100 entries', async () => {
      // Create a cache with 101 entries
      const largeCacheEntries = Array.from({ length: 101 }, (_, i) => [
        `https://example${i}.com`,
        { result: {}, timestamp: Date.now() - i * 1000, hash: `hash${i}` }
      ])
      const largeCache = Object.fromEntries(largeCacheEntries)

      mockStorageLocal.get.mockResolvedValue(largeCache)
      mockStorageLocal.set.mockResolvedValue(undefined)

      await ExtensionStorage.setCacheEntry('https://new.com', {}, 'newhash')

      const setCall = mockStorageLocal.set.mock.calls[0]
      const updatedCache = setCall[1]
      
      expect(Object.keys(updatedCache).length).toBe(100)
    })

    it('should get valid cache entry', async () => {
      const url = 'https://example.com/terms'
      const result = { riskScore: 75 }
      const cache = {
        [url]: {
          result,
          timestamp: Date.now() - 1000, // 1 second ago
          hash: 'abc123',
        },
      }

      mockStorageLocal.get.mockResolvedValue(cache)

      const cachedResult = await ExtensionStorage.getCacheEntry(url)

      expect(cachedResult).toEqual(result)
    })

    it('should return null for expired cache entry', async () => {
      const url = 'https://example.com/terms'
      const cache = {
        [url]: {
          result: { riskScore: 75 },
          timestamp: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
          hash: 'abc123',
        },
      }

      mockStorageLocal.get.mockResolvedValue(cache)
      mockStorageLocal.set.mockResolvedValue(undefined)

      const cachedResult = await ExtensionStorage.getCacheEntry(url)

      expect(cachedResult).toBeNull()
      // Should also remove expired entry
      expect(mockStorageLocal.set).toHaveBeenCalledWith('analysisCache', {})
    })
  })

  describe('user credentials', () => {
    it('should set user credentials', async () => {
      mockStorageSync.set.mockResolvedValue(undefined)

      await ExtensionStorage.setUserCredentials('test-api-key', 'test-user-id')

      expect(mockStorageSync.set).toHaveBeenCalledWith('apiKey', 'test-api-key')
      expect(mockStorageSync.set).toHaveBeenCalledWith('userId', 'test-user-id')
      expect(mockStorageSync.set).toHaveBeenCalledWith('lastSync', expect.any(Number))
    })

    it('should get user credentials', async () => {
      const credentials = { apiKey: 'test-key', userId: 'test-user' }
      mockStorageSync.get
        .mockResolvedValueOnce(credentials.apiKey)
        .mockResolvedValueOnce(credentials.userId)

      const result = await ExtensionStorage.getUserCredentials()

      expect(result).toEqual(credentials)
    })

    it('should clear user credentials', async () => {
      mockStorageSync.remove.mockResolvedValue(undefined)

      await ExtensionStorage.clearUserCredentials()

      expect(mockStorageSync.remove).toHaveBeenCalledWith('apiKey')
      expect(mockStorageSync.remove).toHaveBeenCalledWith('userId')
      expect(mockStorageSync.remove).toHaveBeenCalledWith('lastSync')
    })
  })

  describe('data export/import', () => {
    it('should export all data', async () => {
      const settings = { ...DEFAULT_SETTINGS, enabled: false }
      const cache = { 'https://example.com': { result: {}, timestamp: Date.now(), hash: 'abc' } }
      const lastSync = Date.now()
      const userId = 'test-user'
      const apiToken = 'test-token'

      jest.spyOn(ExtensionStorage, 'getSettings').mockResolvedValue(settings)
      jest.spyOn(ExtensionStorage, 'getCache').mockResolvedValue(cache)
      mockStorageSync.get
        .mockResolvedValueOnce(lastSync)  // lastSync
        .mockResolvedValueOnce(userId)    // userId
        .mockResolvedValueOnce(apiToken)  // apiKey

      const exportedData = await ExtensionStorage.exportData()

      expect(exportedData).toEqual({
        settings,
        cache,
        lastSync,
        userId,
        apiToken,
      })
    })

    it('should import data', async () => {
      const importData = {
        settings: { ...DEFAULT_SETTINGS, theme: 'dark' },
        userId: 'imported-user',
        apiToken: 'imported-token',
      }

      jest.spyOn(ExtensionStorage, 'setSettings').mockResolvedValue(undefined)
      mockStorageLocal.set.mockResolvedValue(undefined)
      mockStorageSync.set.mockResolvedValue(undefined)

      await ExtensionStorage.importData(importData)

      expect(ExtensionStorage.setSettings).toHaveBeenCalledWith(importData.settings)
      expect(mockStorageSync.set).toHaveBeenCalledWith('userId', importData.userId)
      expect(mockStorageSync.set).toHaveBeenCalledWith('apiKey', importData.apiToken)
    })
  })
})