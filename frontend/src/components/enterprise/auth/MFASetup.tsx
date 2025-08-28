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
  MFAConfiguration, 
  UserMFAStatus, 
  MFAMethod,
  OrganizationRole 
} from '../../../types/enterprise'
import { 
  Shield, 
  Smartphone, 
  Mail, 
  Key, 
  QrCode,
  Copy,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Download,
  RefreshCw,
  Settings,
  Users,
  Trash2
} from 'lucide-react'

const totpSetupSchema = z.object({
  verificationCode: z.string().length(6, 'Verification code must be 6 digits')
})

const smsSetupSchema = z.object({
  phoneNumber: z.string().min(10, 'Valid phone number required'),
  verificationCode: z.string().length(6, 'Verification code must be 6 digits')
})

const mfaConfigSchema = z.object({
  enabled: z.boolean(),
  requiredForRoles: z.array(z.nativeEnum(OrganizationRole)),
  gracePeriod: z.number().min(0).max(168), // Max 1 week
  backupCodes: z.boolean(),
  trustedDevices: z.boolean(),
  rememberDuration: z.number().min(1).max(30) // Max 30 days
})

type TOTPSetupForm = z.infer<typeof totpSetupSchema>
type SMSSetupForm = z.infer<typeof smsSetupSchema>
type MFAConfigForm = z.infer<typeof mfaConfigSchema>

interface MFASetupProps {
  isAdmin?: boolean
}

export const MFASetup: React.FC<MFASetupProps> = ({ isAdmin = false }) => {
  const { enterprise } = useStore()
  const [activeTab, setActiveTab] = useState<'user' | 'admin'>('user')
  const [setupMethod, setSetupMethod] = useState<'totp' | 'sms' | null>(null)
  const [qrCodeData, setQrCodeData] = useState<string | null>(null)
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [verificationStep, setVerificationStep] = useState(false)

  const {
    register: registerTOTP,
    handleSubmit: handleSubmitTOTP,
    formState: { errors: totpErrors },
    reset: resetTOTP
  } = useForm<TOTPSetupForm>({
    resolver: zodResolver(totpSetupSchema)
  })

  const {
    register: registerSMS,
    handleSubmit: handleSubmitSMS,
    formState: { errors: smsErrors },
    reset: resetSMS
  } = useForm<SMSSetupForm>({
    resolver: zodResolver(smsSetupSchema)
  })

  const {
    register: registerConfig,
    handleSubmit: handleSubmitConfig,
    formState: { errors: configErrors, isDirty },
    setValue: setConfigValue,
    watch: watchConfig,
    reset: resetConfig
  } = useForm<MFAConfigForm>({
    resolver: zodResolver(mfaConfigSchema),
    defaultValues: {
      enabled: false,
      requiredForRoles: [],
      gracePeriod: 24,
      backupCodes: true,
      trustedDevices: true,
      rememberDuration: 7
    }
  })

  useEffect(() => {
    if (isAdmin) {
      setActiveTab('admin')
    }
    enterprise.fetchMFAConfig()
  }, [isAdmin])

  useEffect(() => {
    if (enterprise.mfaConfig) {
      resetConfig({
        enabled: enterprise.mfaConfig.enabled,
        requiredForRoles: enterprise.mfaConfig.requiredForRoles,
        gracePeriod: enterprise.mfaConfig.gracePeriod,
        backupCodes: enterprise.mfaConfig.backupCodes,
        trustedDevices: enterprise.mfaConfig.trustedDevices,
        rememberDuration: enterprise.mfaConfig.rememberDuration
      })
    }
  }, [enterprise.mfaConfig, resetConfig])

  const startMFASetup = async (method: 'totp' | 'sms') => {
    setIsLoading(true)
    setSetupMethod(method)
    
    try {
      const result = await enterprise.setupMFA(method)
      
      if (method === 'totp' && result.qrCode) {
        setQrCodeData(result.qrCode)
      }
      
      if (result.backupCodes) {
        setBackupCodes(result.backupCodes)
      }
      
      setVerificationStep(true)
    } catch (error) {
      console.error('MFA setup failed:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const verifyTOTP = async (data: TOTPSetupForm) => {
    setIsLoading(true)
    try {
      await enterprise.verifyMFA(data.verificationCode, 'totp')
      setVerificationStep(false)
      setSetupMethod(null)
      setQrCodeData(null)
      resetTOTP()
      await enterprise.fetchMFAConfig()
    } catch (error) {
      console.error('TOTP verification failed:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const verifySMS = async (data: SMSSetupForm) => {
    setIsLoading(true)
    try {
      await enterprise.verifyMFA(data.verificationCode, 'sms')
      setVerificationStep(false)
      setSetupMethod(null)
      resetSMS()
      await enterprise.fetchMFAConfig()
    } catch (error) {
      console.error('SMS verification failed:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const disableMFA = async () => {
    if (confirm('Are you sure you want to disable multi-factor authentication? This will make your account less secure.')) {
      setIsLoading(true)
      try {
        await enterprise.disableMFA()
        setSetupMethod(null)
        setVerificationStep(false)
        setQrCodeData(null)
        setBackupCodes([])
      } catch (error) {
        console.error('Failed to disable MFA:', error)
      } finally {
        setIsLoading(false)
      }
    }
  }

  const updateMFAConfig = async (data: MFAConfigForm) => {
    setIsLoading(true)
    try {
      const methods: MFAMethod[] = [
        { type: 'totp', enabled: true, priority: 1 },
        { type: 'sms', enabled: true, priority: 2 }
      ]
      
      await enterprise.updateMFAConfig({
        ...data,
        methods
      })
    } catch (error) {
      console.error('Failed to update MFA configuration:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const copyBackupCodes = () => {
    const text = backupCodes.join('\n')
    navigator.clipboard.writeText(text)
  }

  const downloadBackupCodes = () => {
    const text = `Fine Print AI - Multi-Factor Authentication Backup Codes\n\n${backupCodes.map((code, i) => `${i + 1}. ${code}`).join('\n')}\n\nStore these codes in a safe place. Each code can only be used once.`
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'mfa-backup-codes.txt'
    link.click()
    URL.revokeObjectURL(url)
  }

  if (enterprise.isLoading && !enterprise.mfaConfig) {
    return <LoadingPage message="Loading MFA configuration..." />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Shield className="h-6 w-6 text-blue-500" />
          <h2 className="text-2xl font-bold text-gray-900">
            Multi-Factor Authentication
          </h2>
        </div>
        {isAdmin && (
          <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setActiveTab('user')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'user'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              User Setup
            </button>
            <button
              onClick={() => setActiveTab('admin')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'admin'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Organization Policy
            </button>
          </div>
        )}
      </div>

      {activeTab === 'user' && (
        <div className="space-y-6">
          {/* Current Status */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Current MFA Status
              </h3>
              <Badge 
                variant={enterprise.userMfaStatus?.enabled ? 'success' : 'secondary'}
              >
                {enterprise.userMfaStatus?.enabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>

            {enterprise.userMfaStatus?.enabled ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {enterprise.userMfaStatus.methods.map((method, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center space-x-3">
                        {method.type === 'totp' && <Smartphone className="h-5 w-5 text-blue-500" />}
                        {method.type === 'sms' && <Mail className="h-5 w-5 text-green-500" />}
                        <div>
                          <p className="font-medium text-gray-900">
                            {method.type === 'totp' ? 'Authenticator App' : 'SMS'}
                          </p>
                          {method.lastUsed && (
                            <p className="text-sm text-gray-500">
                              Last used: {new Date(method.lastUsed).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </div>
                      <Badge variant={method.verified ? 'success' : 'warning'}>
                        {method.verified ? 'Active' : 'Pending'}
                      </Badge>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">
                      Backup codes remaining: {enterprise.userMfaStatus.backupCodes}
                    </p>
                    <p className="text-sm text-gray-600">
                      Trusted devices: {enterprise.userMfaStatus.trustedDevices.length}
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    onClick={disableMFA}
                    disabled={isLoading}
                  >
                    Disable MFA
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
                <p className="text-gray-600 mb-6">
                  Multi-factor authentication is not enabled for your account.
                  Enable it now to add an extra layer of security.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button
                    onClick={() => startMFASetup('totp')}
                    disabled={isLoading}
                    className="flex items-center space-x-2"
                  >
                    <Smartphone className="h-4 w-4" />
                    <span>Setup Authenticator App</span>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => startMFASetup('sms')}
                    disabled={isLoading}
                    className="flex items-center space-x-2"
                  >
                    <Mail className="h-4 w-4" />
                    <span>Setup SMS</span>
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {/* TOTP Setup */}
          {setupMethod === 'totp' && verificationStep && (
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Setup Authenticator App
              </h3>
              <div className="space-y-6">
                <div className="text-center">
                  <p className="text-sm text-gray-600 mb-4">
                    Scan this QR code with your authenticator app:
                  </p>
                  {qrCodeData && (
                    <div className="inline-block p-4 bg-white rounded-lg shadow-sm border">
                      <div dangerouslySetInnerHTML={{ __html: qrCodeData }} />
                    </div>
                  )}
                </div>

                <form onSubmit={handleSubmitTOTP(verifyTOTP)} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Enter the 6-digit code from your authenticator app:
                    </label>
                    <Input
                      {...registerTOTP('verificationCode')}
                      placeholder="123456"
                      maxLength={6}
                      className="text-center text-lg tracking-widest"
                      error={totpErrors.verificationCode?.message}
                    />
                  </div>
                  <div className="flex space-x-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setSetupMethod(null)
                        setVerificationStep(false)
                        setQrCodeData(null)
                      }}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={isLoading}>
                      {isLoading ? 'Verifying...' : 'Verify & Enable'}
                    </Button>
                  </div>
                </form>
              </div>
            </Card>
          )}

          {/* SMS Setup */}
          {setupMethod === 'sms' && verificationStep && (
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Setup SMS Authentication
              </h3>
              <form onSubmit={handleSubmitSMS(verifySMS)} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone Number:
                  </label>
                  <Input
                    {...registerSMS('phoneNumber')}
                    placeholder="+1 (555) 123-4567"
                    error={smsErrors.phoneNumber?.message}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Verification Code:
                  </label>
                  <Input
                    {...registerSMS('verificationCode')}
                    placeholder="123456"
                    maxLength={6}
                    className="text-center text-lg tracking-widest"
                    error={smsErrors.verificationCode?.message}
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Enter the 6-digit code sent to your phone
                  </p>
                </div>
                <div className="flex space-x-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setSetupMethod(null)
                      setVerificationStep(false)
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isLoading}>
                    {isLoading ? 'Verifying...' : 'Verify & Enable'}
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {/* Backup Codes */}
          {backupCodes.length > 0 && (
            <Card className="p-6 border-yellow-200 bg-yellow-50">
              <div className="flex items-center space-x-3 mb-4">
                <Key className="h-5 w-5 text-yellow-600" />
                <h3 className="text-lg font-semibold text-yellow-800">
                  Backup Codes
                </h3>
              </div>
              <div className="space-y-4">
                <p className="text-sm text-yellow-700">
                  Save these backup codes in a safe place. Each code can only be used once
                  to access your account if you lose access to your primary MFA method.
                </p>
                <div className="grid grid-cols-2 gap-2 font-mono text-sm bg-white p-4 rounded border">
                  {backupCodes.map((code, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <span>{code}</span>
                    </div>
                  ))}
                </div>
                <div className="flex space-x-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copyBackupCodes}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Codes
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={downloadBackupCodes}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {activeTab === 'admin' && isAdmin && (
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">
              Organization MFA Policy
            </h3>
            
            <form onSubmit={handleSubmitConfig(updateMFAConfig)} className="space-y-6">
              {/* Enable MFA */}
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-700">
                    Enable MFA for Organization
                  </label>
                  <p className="text-sm text-gray-500">
                    Allow users to enable multi-factor authentication
                  </p>
                </div>
                <input
                  type="checkbox"
                  {...registerConfig('enabled')}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
              </div>

              {watchConfig('enabled') && (
                <>
                  {/* Required Roles */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      Require MFA for Roles
                    </label>
                    <div className="space-y-2">
                      {Object.values(OrganizationRole).map(role => (
                        <div key={role} className="flex items-center">
                          <input
                            type="checkbox"
                            value={role}
                            {...registerConfig('requiredForRoles')}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <label className="ml-2 text-sm text-gray-700">
                            {role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Grace Period */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Grace Period (hours)
                    </label>
                    <Input
                      type="number"
                      min="0"
                      max="168"
                      {...registerConfig('gracePeriod', { valueAsNumber: true })}
                      error={configErrors.gracePeriod?.message}
                    />
                    <p className="text-sm text-gray-500 mt-1">
                      How long users have to set up MFA after it becomes required (0-168 hours)
                    </p>
                  </div>

                  {/* Backup Options */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-sm font-medium text-gray-700">
                          Allow Backup Codes
                        </label>
                        <p className="text-sm text-gray-500">
                          Users can generate backup codes for emergency access
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        {...registerConfig('backupCodes')}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-sm font-medium text-gray-700">
                          Allow Trusted Devices
                        </label>
                        <p className="text-sm text-gray-500">
                          Users can mark devices as trusted to reduce MFA prompts
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        {...registerConfig('trustedDevices')}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                    </div>
                  </div>

                  {/* Remember Duration */}
                  {watchConfig('trustedDevices') && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Remember Device Duration (days)
                      </label>
                      <Input
                        type="number"
                        min="1"
                        max="30"
                        {...registerConfig('rememberDuration', { valueAsNumber: true })}
                        error={configErrors.rememberDuration?.message}
                      />
                      <p className="text-sm text-gray-500 mt-1">
                        How long to remember trusted devices (1-30 days)
                      </p>
                    </div>
                  )}
                </>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between pt-6 border-t">
                <div className="text-sm text-gray-500">
                  {isDirty && '* You have unsaved changes'}
                </div>
                <div className="flex space-x-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => resetConfig()}
                    disabled={isLoading || !isDirty}
                  >
                    Reset
                  </Button>
                  <Button
                    type="submit"
                    disabled={isLoading || !isDirty}
                  >
                    {isLoading ? 'Saving...' : 'Save Policy'}
                  </Button>
                </div>
              </div>
            </form>
          </Card>

          {/* MFA Statistics */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              MFA Adoption Statistics
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {/* This would come from actual data */}
                  68%
                </div>
                <div className="text-sm text-gray-600">Users with MFA</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  24
                </div>
                <div className="text-sm text-gray-600">Active Today</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600">
                  3
                </div>
                <div className="text-sm text-gray-600">Pending Setup</div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}