import { useEffect, useState } from "react"
import { useStorage } from "@plasmohq/storage/hook"
import { sendToBackground } from "@plasmohq/messaging"
import {
  AlertTriangle,
  Bell,
  CheckCircle,
  Download,
  Eye,
  Globe,
  Key,
  Monitor,
  Moon,
  Save,
  Shield,
  Sun,
  Upload,
  Zap
} from "lucide-react"

import type { ExtensionSettings, StorageData } from "@/types"

interface OptionsState {
  isSaving: boolean
  saveStatus?: 'success' | 'error'
  connectionStatus?: 'testing' | 'success' | 'error'
  storageUsage?: { bytesInUse: number; quota: number }
}

export default function OptionsIndex() {
  const [settings, setSettings] = useStorage<ExtensionSettings>("settings")
  const [state, setState] = useState<OptionsState>({
    isSaving: false
  })

  useEffect(() => {
    loadStorageUsage()
  }, [])

  const loadStorageUsage = async () => {
    try {
      const usage = await chrome.storage.sync.getBytesInUse()
      setState(prev => ({
        ...prev,
        storageUsage: {
          bytesInUse: usage,
          quota: chrome.storage.sync.QUOTA_BYTES
        }
      }))
    } catch (error) {
      console.error("Failed to load storage usage:", error)
    }
  }

  const updateSetting = async <K extends keyof ExtensionSettings>(
    key: K,
    value: ExtensionSettings[K]
  ) => {
    if (!settings) return

    const updated = { ...settings, [key]: value }
    setSettings(updated)

    // Save to background
    try {
      await sendToBackground({
        name: "updateSettings",
        body: { [key]: value }
      })
    } catch (error) {
      console.error("Failed to update setting:", error)
    }
  }

  const testConnection = async () => {
    setState(prev => ({ ...prev, connectionStatus: 'testing' }))

    try {
      const isConnected = await sendToBackground({
        name: "testConnection",
        body: {}
      })

      setState(prev => ({
        ...prev,
        connectionStatus: isConnected ? 'success' : 'error'
      }))

      setTimeout(() => {
        setState(prev => ({ ...prev, connectionStatus: undefined }))
      }, 3000)
    } catch (error) {
      console.error("Connection test failed:", error)
      setState(prev => ({ ...prev, connectionStatus: 'error' }))
    }
  }

  const exportData = async () => {
    try {
      const data = await sendToBackground({
        name: "exportData",
        body: {}
      })

      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json'
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `fineprint-extension-data-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error("Failed to export data:", error)
    }
  }

  const importData = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const data = JSON.parse(text) as StorageData

      await sendToBackground({
        name: "importData",
        body: data
      })

      // Refresh settings
      if (data.settings) {
        setSettings(data.settings)
      }

      setState(prev => ({ ...prev, saveStatus: 'success' }))
      setTimeout(() => {
        setState(prev => ({ ...prev, saveStatus: undefined }))
      }, 3000)
    } catch (error) {
      console.error("Failed to import data:", error)
      setState(prev => ({ ...prev, saveStatus: 'error' }))
    }
  }

  if (!settings) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-8 px-4">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center space-x-3">
            <Shield className="w-8 h-8 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Fine Print AI Settings</h1>
              <p className="text-gray-600">Configure your legal document analysis preferences</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Settings */}
          <div className="lg:col-span-2 space-y-6">
            {/* General Settings */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <Zap className="w-5 h-5 mr-2" />
                General Settings
              </h2>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Enable Extension</label>
                    <p className="text-xs text-gray-500">Turn on/off Fine Print AI analysis</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.enabled}
                      onChange={(e) => updateSetting('enabled', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Auto-Analyze Pages</label>
                    <p className="text-xs text-gray-500">Automatically analyze detected legal documents</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.autoAnalyze}
                      onChange={(e) => updateSetting('autoAnalyze', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Highlight Findings</label>
                    <p className="text-xs text-gray-500">Show highlights directly on web pages</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.highlightFindings}
                      onChange={(e) => updateSetting('highlightFindings', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Show Notifications</label>
                    <p className="text-xs text-gray-500">Receive alerts for high-risk documents</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.showNotifications}
                      onChange={(e) => updateSetting('showNotifications', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-2">
                    Analysis Threshold
                  </label>
                  <select
                    value={settings.analysisThreshold}
                    onChange={(e) => updateSetting('analysisThreshold', e.target.value as any)}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="low">Low - Analyze all potential issues</option>
                    <option value="medium">Medium - Focus on significant issues</option>
                    <option value="high">High - Only critical issues</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Controls the sensitivity of issue detection
                  </p>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-2">
                    <Monitor className="w-4 h-4 inline mr-1" />
                    Theme
                  </label>
                  <div className="flex space-x-2">
                    {[
                      { value: 'light', label: 'Light', icon: Sun },
                      { value: 'dark', label: 'Dark', icon: Moon },
                      { value: 'auto', label: 'Auto', icon: Monitor }
                    ].map(({ value, label, icon: Icon }) => (
                      <button
                        key={value}
                        onClick={() => updateSetting('theme', value as any)}
                        className={`flex-1 flex items-center justify-center space-x-2 p-2 rounded-lg border transition-colors ${
                          settings.theme === value
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="text-sm">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* API Configuration */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <Globe className="w-5 h-5 mr-2" />
                API Configuration
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-2">
                    API Endpoint
                  </label>
                  <input
                    type="url"
                    value={settings.apiEndpoint || ''}
                    onChange={(e) => updateSetting('apiEndpoint', e.target.value)}
                    placeholder="http://localhost:8000"
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    URL of your Fine Print AI API server
                  </p>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-2">
                    API Key
                  </label>
                  <div className="flex space-x-2">
                    <input
                      type="password"
                      value={settings.apiKey || ''}
                      onChange={(e) => updateSetting('apiKey', e.target.value)}
                      placeholder="Enter your API key"
                      className="flex-1 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <button
                      onClick={testConnection}
                      disabled={state.connectionStatus === 'testing'}
                      className={`px-4 py-2 rounded-lg transition-colors ${
                        state.connectionStatus === 'success'
                          ? 'bg-green-100 text-green-700'
                          : state.connectionStatus === 'error'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                      } disabled:opacity-50`}
                    >
                      {state.connectionStatus === 'testing' ? (
                        <span className="flex items-center">
                          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                          Testing
                        </span>
                      ) : state.connectionStatus === 'success' ? (
                        <span className="flex items-center">
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Connected
                        </span>
                      ) : state.connectionStatus === 'error' ? (
                        <span className="flex items-center">
                          <AlertTriangle className="w-4 h-4 mr-2" />
                          Failed
                        </span>
                      ) : (
                        'Test'
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Required for analysis functionality
                  </p>
                </div>
              </div>
            </div>

            {/* Data Management */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <Key className="w-5 h-5 mr-2" />
                Data Management
              </h2>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-gray-700">Export Settings & Data</span>
                    <p className="text-xs text-gray-500">Download your extension data as JSON</p>
                  </div>
                  <button
                    onClick={exportData}
                    className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>Export</span>
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-gray-700">Import Settings & Data</span>
                    <p className="text-xs text-gray-500">Restore from a previous export</p>
                  </div>
                  <label className="flex items-center space-x-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors cursor-pointer">
                    <Upload className="w-4 h-4" />
                    <span>Import</span>
                    <input
                      type="file"
                      accept=".json"
                      onChange={importData}
                      className="hidden"
                    />
                  </label>
                </div>

                {state.saveStatus && (
                  <div className={`p-3 rounded-lg ${
                    state.saveStatus === 'success'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {state.saveStatus === 'success' ? (
                      <span className="flex items-center">
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Data imported successfully
                      </span>
                    ) : (
                      <span className="flex items-center">
                        <AlertTriangle className="w-4 h-4 mr-2" />
                        Failed to import data
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Storage Usage */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Storage Usage</h3>
              
              {state.storageUsage && (
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Used</span>
                    <span className="font-medium">
                      {formatBytes(state.storageUsage.bytesInUse)}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full"
                      style={{
                        width: `${(state.storageUsage.bytesInUse / state.storageUsage.quota) * 100}%`
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>0</span>
                    <span>{formatBytes(state.storageUsage.quota)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
              
              <div className="space-y-3">
                <button
                  onClick={() => chrome.tabs.create({ url: 'chrome://extensions/?id=' + chrome.runtime.id })}
                  className="w-full text-left p-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="font-medium text-sm text-gray-900">Extension Details</div>
                  <div className="text-xs text-gray-500">View permissions and info</div>
                </button>
                
                <button
                  onClick={() => chrome.tabs.create({ url: 'https://github.com/company/fineprintai' })}
                  className="w-full text-left p-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="font-medium text-sm text-gray-900">Documentation</div>
                  <div className="text-xs text-gray-500">Learn more about features</div>
                </button>
                
                <button
                  onClick={() => chrome.tabs.create({ url: 'https://github.com/company/fineprintai/issues' })}
                  className="w-full text-left p-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="font-medium text-sm text-gray-900">Report Issue</div>
                  <div className="text-xs text-gray-500">Found a bug or have feedback?</div>
                </button>
              </div>
            </div>

            {/* Extension Info */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Extension Info</h3>
              
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Version</span>
                  <span className="font-medium">1.0.0</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Build</span>
                  <span className="font-medium">Production</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Updated</span>
                  <span className="font-medium">Today</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}