import React, { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '../../ui/Button'
import { Input } from '../../ui/Input'
import { Card } from '../../ui/Card'
import { Badge } from '../../ui/Badge'
import { LoadingPage } from '../../ui/LoadingPage'
import { useStore } from '../../../stores'
import { 
  UserSession, 
  SessionSettings, 
  TrustedDevice 
} from '../../../types/enterprise'
import { 
  Shield, 
  Monitor, 
  Smartphone, 
  MapPin, 
  Clock, 
  AlertTriangle, 
  X, 
  Eye, 
  Trash2, 
  Settings, 
  Lock, 
  Unlock,
  Globe,
  Wifi,
  Activity,
  UserCheck,
  Users,
  CheckCircle,
  XCircle,
  RefreshCw,
  Download,
  Filter,
  Search
} from 'lucide-react'

const sessionSettingsSchema = z.object({
  maxConcurrentSessions: z.number().min(1).max(20),
  idleTimeout: z.number().min(5).max(480), // 5 minutes to 8 hours
  absoluteTimeout: z.number().min(60).max(1440), // 1 hour to 24 hours
  requireSecureCookies: z.boolean(),
  ipBinding: z.boolean(),
  userAgentBinding: z.boolean(),
  notifyOnNewSession: z.boolean()
})

type SessionSettingsForm = z.infer<typeof sessionSettingsSchema>

interface SessionManagerProps {
  isAdmin?: boolean
}

export const SessionManager: React.FC<SessionManagerProps> = ({ isAdmin = false }) => {
  const { enterprise, auth } = useStore()
  const [activeTab, setActiveTab] = useState<'sessions' | 'devices' | 'settings'>('sessions')
  const [selectedSession, setSelectedSession] = useState<UserSession | null>(null)
  const [filterLocation, setFilterLocation] = useState('')
  const [filterDevice, setFilterDevice] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    setValue,
    reset
  } = useForm<SessionSettingsForm>({
    resolver: zodResolver(sessionSettingsSchema),
    defaultValues: {
      maxConcurrentSessions: 5,
      idleTimeout: 30,
      absoluteTimeout: 480,
      requireSecureCookies: true,
      ipBinding: false,
      userAgentBinding: true,
      notifyOnNewSession: true
    }
  })

  useEffect(() => {
    enterprise.fetchActiveSessions()
    if (isAdmin && enterprise.currentOrganization) {
      // Load organization session settings
      const settings = enterprise.currentOrganization.settings.sessionSettings
      if (settings) {
        reset({
          maxConcurrentSessions: settings.maxConcurrentSessions,
          idleTimeout: settings.idleTimeout,
          absoluteTimeout: settings.absoluteTimeout,
          requireSecureCookies: settings.requireSecureCookies,
          ipBinding: settings.ipBinding,
          userAgentBinding: settings.userAgentBinding,
          notifyOnNewSession: settings.notifyOnNewSession
        })
      }
    }
  }, [isAdmin, enterprise.currentOrganization, reset])

  const terminateSession = async (sessionId: string) => {
    if (confirm('Are you sure you want to terminate this session?')) {
      setIsLoading(true)
      try {
        await enterprise.terminateSession(sessionId)
      } catch (error) {
        console.error('Failed to terminate session:', error)
      } finally {
        setIsLoading(false)
      }
    }
  }

  const terminateAllSessions = async () => {
    if (confirm('Are you sure you want to terminate all other sessions? This will log you out from all other devices.')) {
      setIsLoading(true)
      try {
        await enterprise.terminateAllSessions()
      } catch (error) {
        console.error('Failed to terminate all sessions:', error)
      } finally {
        setIsLoading(false)
      }
    }
  }

  const updateSessionSettings = async (data: SessionSettingsForm) => {
    if (!enterprise.currentOrganization) return

    setIsLoading(true)
    try {
      await enterprise.updateOrganization(enterprise.currentOrganization.id, {
        settings: {
          ...enterprise.currentOrganization.settings,
          sessionSettings: data
        }
      })
    } catch (error) {
      console.error('Failed to update session settings:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const getDeviceIcon = (deviceType: string) => {
    switch (deviceType.toLowerCase()) {
      case 'mobile':
        return <Smartphone className="h-5 w-5" />
      case 'tablet':
        return <Monitor className="h-5 w-5" />
      default:
        return <Monitor className="h-5 w-5" />
    }
  }

  const getBrowserIcon = (browser: string) => {
    const browserLower = browser.toLowerCase()
    if (browserLower.includes('chrome')) return '🔵'
    if (browserLower.includes('firefox')) return '🦊'
    if (browserLower.includes('safari')) return '🧭'
    if (browserLower.includes('edge')) return '🌐'
    return '🌐'
  }

  const getLocationFlag = (country: string) => {
    // This would typically use a country code to flag emoji mapping
    const countryFlags: Record<string, string> = {
      'United States': '🇺🇸',
      'Canada': '🇨🇦',
      'United Kingdom': '🇬🇧',
      'Germany': '🇩🇪',
      'France': '🇫🇷',
      'Japan': '🇯🇵',
      'Australia': '🇦🇺'
    }
    return countryFlags[country] || '🌍'
  }

  const getSessionRiskLevel = (session: UserSession) => {
    let risk = 0
    
    // Check for unusual location
    if (session.location && session.location.country !== 'United States') risk += 1
    
    // Check for mobile device
    if (session.deviceInfo.device.toLowerCase().includes('mobile')) risk += 1
    
    // Check session age
    const sessionAge = Date.now() - new Date(session.createdAt).getTime()
    if (sessionAge > 7 * 24 * 60 * 60 * 1000) risk += 2 // Older than 7 days
    
    // Check for suspicious user agent
    if (!session.userAgent || session.userAgent.length < 50) risk += 2
    
    if (risk >= 4) return { level: 'high', color: 'text-red-600 bg-red-100' }
    if (risk >= 2) return { level: 'medium', color: 'text-yellow-600 bg-yellow-100' }
    return { level: 'low', color: 'text-green-600 bg-green-100' }
  }

  const filteredSessions = enterprise.activeSessions.filter(session => {
    const matchesLocation = !filterLocation || 
      (session.location?.country.toLowerCase().includes(filterLocation.toLowerCase()) ||
       session.location?.city.toLowerCase().includes(filterLocation.toLowerCase()))
    
    const matchesDevice = !filterDevice ||
      session.deviceInfo.browser.toLowerCase().includes(filterDevice.toLowerCase()) ||
      session.deviceInfo.os.toLowerCase().includes(filterDevice.toLowerCase()) ||
      session.deviceInfo.device.toLowerCase().includes(filterDevice.toLowerCase())
    
    return matchesLocation && matchesDevice
  })

  if (enterprise.isLoading && enterprise.activeSessions.length === 0) {
    return <LoadingPage message="Loading session information..." />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Shield className="h-6 w-6 text-blue-500" />
          <h2 className="text-2xl font-bold text-gray-900">
            Session Management
          </h2>
        </div>
        <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setActiveTab('sessions')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'sessions'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Active Sessions
          </button>
          <button
            onClick={() => setActiveTab('devices')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'devices'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Trusted Devices
          </button>
          {isAdmin && (
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'settings'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Settings
            </button>
          )}
        </div>
      </div>

      {/* Active Sessions Tab */}
      {activeTab === 'sessions' && (
        <div className="space-y-6">
          {/* Session Overview */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card className="p-6">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-blue-100 text-blue-600">
                  <Activity className="h-6 w-6" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Sessions</p>
                  <p className="text-2xl font-bold text-gray-900">{enterprise.activeSessions.length}</p>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-green-100 text-green-600">
                  <CheckCircle className="h-6 w-6" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Current Session</p>
                  <p className="text-2xl font-bold text-green-600">1</p>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-yellow-100 text-yellow-600">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">High Risk</p>
                  <p className="text-2xl font-bold text-yellow-600">
                    {enterprise.activeSessions.filter(s => getSessionRiskLevel(s).level === 'high').length}
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-purple-100 text-purple-600">
                  <Globe className="h-6 w-6" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Locations</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {new Set(enterprise.activeSessions.map(s => s.location?.country).filter(Boolean)).size}
                  </p>
                </div>
              </div>
            </Card>
          </div>

          {/* Filters & Actions */}
          <Card className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
              <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4">
                <div className="flex items-center space-x-2">
                  <Search className="h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Filter by location..."
                    value={filterLocation}
                    onChange={(e) => setFilterLocation(e.target.value)}
                    className="w-48"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <Filter className="h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Filter by device..."
                    value={filterDevice}
                    onChange={(e) => setFilterDevice(e.target.value)}
                    className="w-48"
                  />
                </div>
              </div>
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  onClick={() => enterprise.fetchActiveSessions()}
                  disabled={isLoading}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
                <Button
                  variant="destructive"
                  onClick={terminateAllSessions}
                  disabled={isLoading}
                >
                  <X className="h-4 w-4 mr-2" />
                  Terminate All Others
                </Button>
              </div>
            </div>
          </Card>

          {/* Sessions List */}
          <div className="space-y-4">
            {filteredSessions.map((session) => {
              const risk = getSessionRiskLevel(session)
              const isCurrentSession = session.isCurrent

              return (
                <Card
                  key={session.id}
                  className={`p-6 ${isCurrentSession ? 'border-green-200 bg-green-50' : ''}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-4">
                      <div className="flex-shrink-0">
                        <div className={`p-3 rounded-lg ${
                          isCurrentSession ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {getDeviceIcon(session.deviceInfo.device)}
                        </div>
                      </div>

                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {session.deviceInfo.device} • {session.deviceInfo.os}
                          </h3>
                          {isCurrentSession && (
                            <Badge variant="success">Current Session</Badge>
                          )}
                          <Badge className={risk.color}>
                            {risk.level} risk
                          </Badge>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
                          <div className="flex items-center space-x-2">
                            <span className="text-lg">{getBrowserIcon(session.deviceInfo.browser)}</span>
                            <span>{session.deviceInfo.browser}</span>
                          </div>

                          <div className="flex items-center space-x-2">
                            <Wifi className="h-4 w-4" />
                            <span>{session.ipAddress}</span>
                          </div>

                          {session.location && (
                            <div className="flex items-center space-x-2">
                              <span className="text-lg">{getLocationFlag(session.location.country)}</span>
                              <span>{session.location.city}, {session.location.country}</span>
                            </div>
                          )}

                          <div className="flex items-center space-x-2">
                            <Clock className="h-4 w-4" />
                            <span>
                              Last active: {new Date(session.lastActivityAt).toLocaleString()}
                            </span>
                          </div>

                          <div className="flex items-center space-x-2">
                            <Activity className="h-4 w-4" />
                            <span>
                              Created: {new Date(session.createdAt).toLocaleString()}
                            </span>
                          </div>

                          <div className="flex items-center space-x-2">
                            <AlertTriangle className="h-4 w-4" />
                            <span>
                              Expires: {new Date(session.expiresAt).toLocaleString()}
                            </span>
                          </div>
                        </div>

                        {session.userAgent && (
                          <div className="mt-3 p-2 bg-gray-100 rounded text-xs text-gray-600 font-mono">
                            {session.userAgent}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedSession(session)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {!isCurrentSession && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => terminateSession(session.id)}
                          disabled={isLoading}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              )
            })}

            {filteredSessions.length === 0 && (
              <div className="text-center py-12">
                <Monitor className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">
                  {enterprise.activeSessions.length === 0 ? 'No active sessions' : 'No sessions match the current filters'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Trusted Devices Tab */}
      {activeTab === 'devices' && (
        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Trusted Devices</h3>
              <Button
                variant="outline"
                onClick={() => {/* Refresh trusted devices */}}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>

            <div className="space-y-4">
              {enterprise.userMfaStatus?.trustedDevices.map((device) => (
                <div key={device.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-4">
                    <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
                      <Monitor className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{device.name}</p>
                      <p className="text-sm text-gray-500">
                        Added {new Date(device.addedAt).toLocaleDateString()}
                      </p>
                      <p className="text-sm text-gray-500">
                        Last used {new Date(device.lastUsed).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant="success">Trusted</Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {/* Remove trusted device */}}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )) || (
                <div className="text-center py-12">
                  <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No trusted devices found</p>
                  <p className="text-sm text-gray-500 mt-2">
                    Devices will appear here when you mark them as trusted during MFA setup
                  </p>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && isAdmin && (
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">
              Organization Session Settings
            </h3>

            <form onSubmit={handleSubmit(updateSessionSettings)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Max Concurrent Sessions
                  </label>
                  <Input
                    type="number"
                    min="1"
                    max="20"
                    {...register('maxConcurrentSessions', { valueAsNumber: true })}
                    error={errors.maxConcurrentSessions?.message}
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Maximum number of simultaneous sessions per user
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Idle Timeout (minutes)
                  </label>
                  <Input
                    type="number"
                    min="5"
                    max="480"
                    {...register('idleTimeout', { valueAsNumber: true })}
                    error={errors.idleTimeout?.message}
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Session expires after this period of inactivity
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Absolute Timeout (minutes)
                  </label>
                  <Input
                    type="number"
                    min="60"
                    max="1440"
                    {...register('absoluteTimeout', { valueAsNumber: true })}
                    error={errors.absoluteTimeout?.message}
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Session expires after this period regardless of activity
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      Require Secure Cookies
                    </label>
                    <p className="text-sm text-gray-500">
                      Only send cookies over HTTPS connections
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    {...register('requireSecureCookies')}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      IP Address Binding
                    </label>
                    <p className="text-sm text-gray-500">
                      Bind sessions to specific IP addresses (may cause issues with mobile users)
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    {...register('ipBinding')}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      User Agent Binding
                    </label>
                    <p className="text-sm text-gray-500">
                      Bind sessions to specific browser user agents
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    {...register('userAgentBinding')}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      Notify on New Session
                    </label>
                    <p className="text-sm text-gray-500">
                      Send email notifications when users log in from new devices
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    {...register('notifyOnNewSession')}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-6 border-t">
                <div className="text-sm text-gray-500">
                  {isDirty && '* You have unsaved changes'}
                </div>
                <div className="flex space-x-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => reset()}
                    disabled={isLoading || !isDirty}
                  >
                    Reset
                  </Button>
                  <Button
                    type="submit"
                    disabled={isLoading || !isDirty}
                  >
                    {isLoading ? 'Saving...' : 'Save Settings'}
                  </Button>
                </div>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Session Details Modal */}
      {selectedSession && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Session Details</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedSession(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-500">Session ID</p>
                  <p className="text-sm text-gray-900 font-mono">{selectedSession.id}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Status</p>
                  <Badge variant={selectedSession.status === 'active' ? 'success' : 'secondary'}>
                    {selectedSession.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Created</p>
                  <p className="text-sm text-gray-900">{new Date(selectedSession.createdAt).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Last Activity</p>
                  <p className="text-sm text-gray-900">{new Date(selectedSession.lastActivityAt).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Expires</p>
                  <p className="text-sm text-gray-900">{new Date(selectedSession.expiresAt).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">IP Address</p>
                  <p className="text-sm text-gray-900 font-mono">{selectedSession.ipAddress}</p>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-500 mb-2">Device Information</p>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-900">
                    <strong>Device:</strong> {selectedSession.deviceInfo.device}
                  </p>
                  <p className="text-sm text-gray-900">
                    <strong>OS:</strong> {selectedSession.deviceInfo.os}
                  </p>
                  <p className="text-sm text-gray-900">
                    <strong>Browser:</strong> {selectedSession.deviceInfo.browser}
                  </p>
                  <p className="text-sm text-gray-900">
                    <strong>Fingerprint:</strong> {selectedSession.deviceInfo.fingerprint}
                  </p>
                </div>
              </div>

              {selectedSession.location && (
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-2">Location</p>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-900">
                      <strong>Country:</strong> {selectedSession.location.country}
                    </p>
                    <p className="text-sm text-gray-900">
                      <strong>Region:</strong> {selectedSession.location.region}
                    </p>
                    <p className="text-sm text-gray-900">
                      <strong>City:</strong> {selectedSession.location.city}
                    </p>
                  </div>
                </div>
              )}

              <div>
                <p className="text-sm font-medium text-gray-500 mb-2">User Agent</p>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-700 font-mono break-all">
                    {selectedSession.userAgent}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <Button
                variant="outline"
                onClick={() => setSelectedSession(null)}
              >
                Close
              </Button>
              {!selectedSession.isCurrent && (
                <Button
                  variant="destructive"
                  onClick={() => {
                    terminateSession(selectedSession.id)
                    setSelectedSession(null)
                  }}
                  disabled={isLoading}
                >
                  Terminate Session
                </Button>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}