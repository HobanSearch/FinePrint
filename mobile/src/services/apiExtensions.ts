import { apiClient } from './api'

// App Store API endpoints
export const appStoreEndpoints = {
  search: (query: string, platform?: 'ios' | 'android', limit?: number) =>
    apiClient.get('/apps/search', { 
      params: { q: query, platform, limit } 
    }),
  
  getMetadata: (appId: string, platform: 'ios' | 'android') =>
    apiClient.get(`/apps/${platform}/${appId}`),
  
  analyze: (appId: string, platform: 'ios' | 'android', documents?: string[]) =>
    apiClient.post(`/apps/${platform}/${appId}/analyze`, { documents }),
  
  getAnalysis: (analysisId: string) =>
    apiClient.get(`/apps/analysis/${analysisId}`),
  
  getPopular: (platform?: 'ios' | 'android', limit?: number) =>
    apiClient.get('/apps/popular', { 
      params: { platform, limit } 
    })
}

// Leaderboard API endpoints
export const leaderboardEndpoints = {
  topSafe: (limit?: number) =>
    apiClient.get('/leaderboard/top-safe', { params: { limit } }),
  
  worstOffenders: (limit?: number) =>
    apiClient.get('/leaderboard/worst-offenders', { params: { limit } }),
  
  categories: () => apiClient.get('/leaderboard/categories'),
  
  categoryLeaderboard: (category: string, type?: 'best' | 'worst', limit?: number) =>
    apiClient.get(`/leaderboard/category/${encodeURIComponent(category)}`, { 
      params: { type, limit } 
    }),
  
  trending: (limit?: number) =>
    apiClient.get('/leaderboard/trending', { params: { limit } }),
  
  stats: () => apiClient.get('/leaderboard/stats')
}