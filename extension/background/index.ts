import { sendToContentScript } from "@plasmohq/messaging"
import { Storage } from "@plasmohq/storage"

import { getApiClient, initializeApiClient } from "@/lib/api-client"
import { ExtensionStorage } from "@/lib/storage"
import { PageDetector } from "@/lib/page-detector"
import type { 
  ExtensionSettings, 
  PageAnalysisState, 
  ContextMenuAction,
  NotificationData,
  AnalysisProgress
} from "@/types"

const storage = new Storage()

// Initialize extension on startup
chrome.runtime.onStartup.addListener(async () => {
  await initializeExtension()
})

chrome.runtime.onInstalled.addListener(async (details) => {
  await initializeExtension()
  
  if (details.reason === 'install') {
    // Show welcome notification
    await showNotification({
      id: 'welcome',
      type: 'update-available',
      title: 'Fine Print AI Installed',
      message: 'Extension is ready to analyze legal documents',
      priority: 'normal',
      timestamp: Date.now()
    })
    
    // Open options page
    chrome.tabs.create({ url: chrome.runtime.getURL('options.html') })
  }
})

// Message handlers
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleMessage(request, sender).then(sendResponse).catch(console.error)
  return true // Keep message channel open for async response
})

// Tab activation handler
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  await updateBadgeForTab(activeInfo.tabId)
})

// Tab update handler
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    await handleTabUpdate(tabId, tab.url, tab.title || '')
  }
})

// Context menu click handler
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  await handleContextMenuClick(info, tab)
})

// Notification click handler
chrome.notifications.onClicked.addListener(async (notificationId) => {
  await handleNotificationClick(notificationId)
})

async function initializeExtension() {
  console.log('Initializing Fine Print AI extension...')
  
  try {
    // Initialize API client
    await initializeApiClient()
    
    // Setup context menus
    await setupContextMenus()
    
    // Clear old cache entries
    await cleanupCache()
    
    console.log('Extension initialized successfully')
  } catch (error) {
    console.error('Failed to initialize extension:', error)
  }
}

async function handleMessage(request: any, sender: chrome.runtime.MessageSender) {
  const { name, body } = request
  
  switch (name) {
    case 'startAnalysis':
      return await startAnalysis(body, sender.tab?.id)
    
    case 'getAnalysis':
      return await getAnalysisForUrl(body.url)
    
    case 'updateSettings':
      return await updateSettings(body)
    
    case 'testConnection':
      return await testApiConnection()
    
    case 'exportData':
      return await exportExtensionData()
    
    case 'importData':
      return await importExtensionData(body)
    
    default:
      throw new Error(`Unknown message: ${name}`)
  }
}

async function startAnalysis(data: any, tabId?: number): Promise<PageAnalysisState> {
  const { url, title, content, detection } = data
  
  try {
    // Check if analysis is enabled
    const settings = await ExtensionStorage.getSettings()
    if (!settings.enabled) {
      throw new Error('Extension is disabled')
    }

    // Check cache first
    const cached = await ExtensionStorage.getCacheEntry(url)
    if (cached && !shouldReanalyze(cached)) {
      if (tabId) {
        await sendToContentScript({
          name: 'ANALYSIS_COMPLETE',
          body: cached
        }, { tabId })
      }
      return cached
    }

    // Send progress update
    if (tabId) {
      await sendAnalysisProgress(tabId, {
        stage: 'detecting',
        progress: 10,
        message: 'Detecting document type...'
      })
    }

    // Verify this is a legal document
    if (!detection.isTermsPage && !detection.isPrivacyPage) {
      throw new Error('Not a legal document')
    }

    // Initialize analysis state
    const analysisState: PageAnalysisState = {
      url,
      isAnalyzing: true,
      isTermsPage: detection.isTermsPage,
      isPrivacyPage: detection.isPrivacyPage,
      documentType: detection.documentType as any,
      findings: [],
      lastAnalyzed: Date.now()
    }

    // Update progress
    if (tabId) {
      await sendAnalysisProgress(tabId, {
        stage: 'analyzing',
        progress: 30,
        message: 'Analyzing document content...'
      })
    }

    // Call API for analysis
    const apiClient = getApiClient()
    const analysisResult = await apiClient.quickAnalyze(url, content)

    // Update progress
    if (tabId) {
      await sendAnalysisProgress(tabId, {
        stage: 'highlighting',
        progress: 80,
        message: 'Preparing highlights...'
      })
    }

    // Process findings
    const findings = analysisResult.findings.map(finding => ({
      id: finding.id,
      category: finding.category,
      title: finding.title,
      description: finding.description,
      severity: finding.severity,
      confidenceScore: finding.confidenceScore || 0,
      textExcerpt: finding.textExcerpt || '',
      positionStart: finding.positionStart || 0,
      positionEnd: finding.positionEnd || 0,
      recommendation: finding.recommendation || '',
      impactExplanation: finding.impactExplanation || '',
      highlighted: false
    }))

    // Update analysis state
    analysisState.isAnalyzing = false
    analysisState.analysisId = analysisResult.id
    analysisState.riskScore = analysisResult.overallRiskScore
    analysisState.findings = findings

    // Cache the result
    await ExtensionStorage.setCacheEntry(url, analysisState, generateContentHash(content))

    // Update badge
    if (tabId) {
      await updateBadgeForAnalysis(tabId, analysisState)
      await sendAnalysisProgress(tabId, {
        stage: 'complete',
        progress: 100,
        message: 'Analysis complete'
      })
      
      // Send final result
      await sendToContentScript({
        name: 'ANALYSIS_COMPLETE',
        body: analysisState
      }, { tabId })
    }

    // Show notification for high-risk findings
    if (analysisState.riskScore && analysisState.riskScore >= 70) {
      await showNotification({
        id: `high-risk-${url}`,
        type: 'high-risk-found',
        title: 'High Risk Document Detected',
        message: `Risk score: ${analysisState.riskScore}/100 with ${findings.length} issues found`,
        url,
        priority: 'high',
        timestamp: Date.now()
      })
    }

    return analysisState

  } catch (error) {
    console.error('Analysis failed:', error)
    
    const errorState: PageAnalysisState = {
      url,
      isAnalyzing: false,
      isTermsPage: detection?.isTermsPage || false,
      isPrivacyPage: detection?.isPrivacyPage || false,
      findings: [],
      error: error instanceof Error ? error.message : 'Analysis failed'
    }

    if (tabId) {
      await sendToContentScript({
        name: 'ANALYSIS_ERROR',
        body: errorState
      }, { tabId })
    }

    return errorState
  }
}

async function sendAnalysisProgress(tabId: number, progress: AnalysisProgress) {
  try {
    await sendToContentScript({
      name: 'ANALYSIS_PROGRESS',
      body: progress
    }, { tabId })
  } catch (error) {
    console.error('Failed to send progress update:', error)
  }
}

async function getAnalysisForUrl(url: string): Promise<PageAnalysisState | null> {
  return await ExtensionStorage.getCacheEntry(url)
}

async function updateSettings(newSettings: Partial<ExtensionSettings>) {
  await ExtensionStorage.setSettings(newSettings)
  
  // Update API client if needed
  if (newSettings.apiEndpoint || newSettings.apiKey) {
    const client = getApiClient()
    if (newSettings.apiEndpoint) {
      client.setBaseUrl(newSettings.apiEndpoint)
    }
    // Note: userId would need to be provided separately
  }
  
  return await ExtensionStorage.getSettings()
}

async function setupContextMenus() {
  // Clear existing context menus
  chrome.contextMenus.removeAll()

  const contextMenus: ContextMenuAction[] = [
    {
      id: 'analyze-page',
      title: 'Analyze with Fine Print AI',
      contexts: ['page'],
      action: async (info, tab) => {
        if (tab?.id) {
          await sendToContentScript({
            name: 'START_MANUAL_ANALYSIS',
            body: {}
          }, { tabId: tab.id })
        }
      }
    },
    {
      id: 'analyze-selection',
      title: 'Analyze selected text',
      contexts: ['selection'],
      action: async (info, tab) => {
        if (tab?.id && info.selectionText) {
          await analyzeSelection(info.selectionText, tab.id)
        }
      }
    }
  ]

  for (const menu of contextMenus) {
    chrome.contextMenus.create({
      id: menu.id,
      title: menu.title,
      contexts: menu.contexts
    })
  }
}

async function handleContextMenuClick(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) {
  switch (info.menuItemId) {
    case 'analyze-page':
      if (tab?.id) {
        await sendToContentScript({
          name: 'START_MANUAL_ANALYSIS',
          body: {}
        }, { tabId: tab.id })
      }
      break
    
    case 'analyze-selection':
      if (tab?.id && info.selectionText) {
        await analyzeSelection(info.selectionText, tab.id)
      }
      break
  }
}

async function analyzeSelection(text: string, tabId: number) {
  try {
    const apiClient = getApiClient()
    const result = await apiClient.quickAnalyze('selection', text)
    
    await sendToContentScript({
      name: 'SELECTION_ANALYSIS_COMPLETE',
      body: result
    }, { tabId })
  } catch (error) {
    console.error('Selection analysis failed:', error)
  }
}

async function handleTabUpdate(tabId: number, url: string, title: string) {
  const settings = await ExtensionStorage.getSettings()
  if (!settings.enabled) return

  // Quick check if this might be a legal document
  const preliminaryDetection = PageDetector.detect(url, title, '')
  
  if (preliminaryDetection.confidence > 0.3) {
    // Update badge to indicate potential legal document
    await chrome.action.setBadgeText({
      tabId,
      text: '?'
    })
    await chrome.action.setBadgeBackgroundColor({
      tabId,
      color: '#f59e0b'
    })
  } else {
    // Clear badge
    await chrome.action.setBadgeText({ tabId, text: '' })
  }
}

async function updateBadgeForTab(tabId: number) {
  try {
    const tab = await chrome.tabs.get(tabId)
    if (!tab.url) return

    const analysis = await getAnalysisForUrl(tab.url)
    if (analysis) {
      await updateBadgeForAnalysis(tabId, analysis)
    }
  } catch (error) {
    console.error('Failed to update badge:', error)
  }
}

async function updateBadgeForAnalysis(tabId: number, analysis: PageAnalysisState) {
  if (analysis.riskScore !== null && analysis.riskScore !== undefined) {
    const riskLevel = analysis.riskScore >= 70 ? 'HIGH' : 
                     analysis.riskScore >= 40 ? 'MED' : 'LOW'
    
    await chrome.action.setBadgeText({
      tabId,
      text: riskLevel
    })
    
    const color = analysis.riskScore >= 70 ? '#dc2626' :
                  analysis.riskScore >= 40 ? '#f59e0b' : '#22c55e'
    
    await chrome.action.setBadgeBackgroundColor({
      tabId,
      color
    })
  } else if (analysis.findings.length > 0) {
    await chrome.action.setBadgeText({
      tabId,
      text: analysis.findings.length.toString()
    })
    await chrome.action.setBadgeBackgroundColor({
      tabId,
      color: '#3b82f6'
    })
  }
}

async function showNotification(notification: NotificationData) {
  const settings = await ExtensionStorage.getSettings()
  if (!settings.showNotifications) return

  await chrome.notifications.create(notification.id, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('assets/icon.png'),
    title: notification.title,
    message: notification.message,
    priority: notification.priority === 'high' ? 2 : 
             notification.priority === 'low' ? 0 : 1
  })
}

async function handleNotificationClick(notificationId: string) {
  // Handle notification clicks (e.g., open relevant tab or popup)
  if (notificationId.startsWith('high-risk-')) {
    const url = notificationId.replace('high-risk-', '')
    const tabs = await chrome.tabs.query({ url })
    if (tabs.length > 0) {
      await chrome.tabs.update(tabs[0].id, { active: true })
    }
  }
}

async function testApiConnection(): Promise<boolean> {
  try {
    const apiClient = getApiClient()
    return await apiClient.healthCheck()
  } catch {
    return false
  }
}

async function exportExtensionData() {
  return await ExtensionStorage.exportData()
}

async function importExtensionData(data: any) {
  await ExtensionStorage.importData(data)
  return { success: true }
}

async function cleanupCache() {
  // Remove cache entries older than 7 days
  const cache = await ExtensionStorage.getCache()
  const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000)
  
  const cleaned = Object.fromEntries(
    Object.entries(cache).filter(([, entry]) => entry.timestamp > weekAgo)
  )
  
  await ExtensionStorage.clearCache()
  for (const [url, entry] of Object.entries(cleaned)) {
    await ExtensionStorage.setCacheEntry(url, entry.result, entry.hash)
  }
}

function shouldReanalyze(cached: PageAnalysisState): boolean {
  if (!cached.lastAnalyzed) return true
  
  // Reanalyze if cached for more than 24 hours
  const dayAgo = Date.now() - (24 * 60 * 60 * 1000)
  return cached.lastAnalyzed < dayAgo
}

function generateContentHash(content: string): string {
  // Simple hash function for content comparison
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return hash.toString()
}

// Keep service worker alive
chrome.runtime.onConnect.addListener((port) => {
  port.onDisconnect.addListener(() => {
    console.log('Port disconnected')
  })
})

console.log('Fine Print AI background script loaded')