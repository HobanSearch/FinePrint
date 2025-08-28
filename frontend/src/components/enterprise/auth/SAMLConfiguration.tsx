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
  SAMLConfiguration as SAMLConfig, 
  SSOProvider, 
  OrganizationRole 
} from '../../../types/enterprise'
import { 
  Shield, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Copy, 
  Download,
  TestTube,
  Save,
  Trash2,
  Eye,
  EyeOff
} from 'lucide-react'

const samlConfigSchema = z.object({
  entityId: z.string().min(1, 'Entity ID is required'),
  ssoUrl: z.string().url('Invalid SSO URL'),
  x509Certificate: z.string().min(1, 'X.509 Certificate is required'),
  signatureAlgorithm: z.enum(['sha1', 'sha256']),
  nameIdFormat: z.string().min(1, 'Name ID format is required'),
  attributeMapping: z.object({
    email: z.string().min(1, 'Email attribute is required'),
    firstName: z.string().min(1, 'First name attribute is required'),
    lastName: z.string().min(1, 'Last name attribute is required'),
    role: z.string().optional(),
    department: z.string().optional()
  }),
  encryptAssertions: z.boolean(),
  signRequests: z.boolean(),
  autoProvision: z.boolean(),
  defaultRole: z.nativeEnum(OrganizationRole),
  domainRestriction: z.array(z.string()).optional()
})

type SAMLConfigForm = z.infer<typeof samlConfigSchema>

interface SAMLConfigurationProps {
  provider?: SSOProvider
  onSave: (config: SAMLConfig) => Promise<void>
  onDelete?: () => Promise<void>
  onTest?: () => Promise<{ success: boolean; error?: string }>
}

export const SAMLConfiguration: React.FC<SAMLConfigurationProps> = ({
  provider,
  onSave,
  onDelete,
  onTest
}) => {
  const { enterprise } = useStore()
  const [isLoading, setIsLoading] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null)
  const [showCertificate, setShowCertificate] = useState(false)
  const [metadataUrl, setMetadataUrl] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    setValue,
    watch,
    reset
  } = useForm<SAMLConfigForm>({
    resolver: zodResolver(samlConfigSchema),
    defaultValues: {
      signatureAlgorithm: 'sha256',
      nameIdFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
      encryptAssertions: true,
      signRequests: true,
      autoProvision: true,
      defaultRole: OrganizationRole.VIEWER,
      attributeMapping: {
        email: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
        firstName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
        lastName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname'
      }
    }
  })

  useEffect(() => {
    if (provider?.configuration && provider.type === 'saml') {
      const config = provider.configuration as SAMLConfig
      reset({
        entityId: config.entityId,
        ssoUrl: config.ssoUrl,
        x509Certificate: config.x509Certificate,
        signatureAlgorithm: config.signatureAlgorithm,
        nameIdFormat: config.nameIdFormat,
        attributeMapping: config.attributeMapping,
        encryptAssertions: config.encryptAssertions,
        signRequests: config.signRequests,
        autoProvision: config.autoProvision,
        defaultRole: config.defaultRole,
        domainRestriction: config.domainRestriction || []
      })
    }
  }, [provider, reset])

  useEffect(() => {
    // Generate metadata URL for SP
    if (enterprise.currentOrganization) {
      const baseUrl = window.location.origin
      const orgSlug = enterprise.currentOrganization.slug
      setMetadataUrl(`${baseUrl}/auth/saml/${orgSlug}/metadata`)
    }
  }, [enterprise.currentOrganization])

  const onSubmit = async (data: SAMLConfigForm) => {
    setIsLoading(true)
    try {
      await onSave({
        enabled: true,
        ...data
      })
      setTestResult(null)
    } catch (error) {
      console.error('Failed to save SAML configuration:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleTest = async () => {
    if (!onTest) return

    setIsLoading(true)
    try {
      const result = await onTest()
      setTestResult(result)
    } catch (error) {
      setTestResult({
        success: false,
        error: 'Test failed to execute'
      })
    } finally {
      setIsLoading(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    // You could add a toast notification here
  }

  const downloadMetadata = () => {
    // This would typically fetch the SP metadata from the server
    const link = document.createElement('a')
    link.href = metadataUrl
    link.download = 'sp-metadata.xml'
    link.click()
  }

  const importFromMetadata = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const parser = new DOMParser()
      const xmlDoc = parser.parseFromString(text, 'text/xml')
      
      // Parse metadata and populate form
      const entityDescriptor = xmlDoc.querySelector('EntityDescriptor')
      const ssoDescriptor = xmlDoc.querySelector('IDPSSODescriptor')
      const ssoService = xmlDoc.querySelector('SingleSignOnService[Binding*="HTTP-POST"]')
      const certificate = xmlDoc.querySelector('X509Certificate')

      if (entityDescriptor && ssoService && certificate) {
        setValue('entityId', entityDescriptor.getAttribute('entityID') || '')
        setValue('ssoUrl', ssoService.getAttribute('Location') || '')
        setValue('x509Certificate', certificate.textContent?.trim() || '')
      }
    } catch (error) {
      console.error('Failed to parse metadata:', error)
    }
  }

  if (enterprise.isLoading) {
    return <LoadingPage message="Loading SAML configuration..." />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Shield className="h-6 w-6 text-blue-500" />
          <h2 className="text-2xl font-bold text-gray-900">
            SAML 2.0 Configuration
          </h2>
          {provider && (
            <Badge 
              variant={provider.enabled ? 'success' : 'secondary'}
              className="ml-2"
            >
              {provider.enabled ? 'Enabled' : 'Disabled'}
            </Badge>
          )}
        </div>
        <div className="flex space-x-3">
          {provider && onTest && (
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={isLoading}
              className="flex items-center space-x-2"
            >
              <TestTube className="h-4 w-4" />
              <span>Test Connection</span>
            </Button>
          )}
          {provider && onDelete && (
            <Button
              variant="destructive"
              onClick={onDelete}
              disabled={isLoading}
              className="flex items-center space-x-2"
            >
              <Trash2 className="h-4 w-4" />
              <span>Delete</span>
            </Button>
          )}
        </div>
      </div>

      {/* Test Result */}
      {testResult && (
        <Card className={`p-4 border-l-4 ${
          testResult.success 
            ? 'border-green-500 bg-green-50' 
            : 'border-red-500 bg-red-50'
        }`}>
          <div className="flex items-center space-x-3">
            {testResult.success ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : (
              <XCircle className="h-5 w-5 text-red-500" />
            )}
            <div>
              <p className={`font-medium ${
                testResult.success ? 'text-green-800' : 'text-red-800'
              }`}>
                {testResult.success ? 'Connection Successful' : 'Connection Failed'}
              </p>
              {testResult.error && (
                <p className="text-sm text-red-600 mt-1">{testResult.error}</p>
              )}
            </div>
          </div>
        </Card>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Service Provider Information */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Service Provider Information
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                SP Entity ID
              </label>
              <div className="flex items-center space-x-2">
                <Input
                  value={`urn:fineprintai:saml:${enterprise.currentOrganization?.slug || 'org'}`}
                  disabled
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(`urn:fineprintai:saml:${enterprise.currentOrganization?.slug || 'org'}`)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                SP Metadata URL
              </label>
              <div className="flex items-center space-x-2">
                <Input
                  value={metadataUrl}
                  disabled
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(metadataUrl)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={downloadMetadata}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* Identity Provider Configuration */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Identity Provider Configuration
            </h3>
            <div>
              <input
                type="file"
                accept=".xml"
                onChange={importFromMetadata}
                className="hidden"
                id="metadata-upload"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => document.getElementById('metadata-upload')?.click()}
              >
                Import from Metadata
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                IdP Entity ID *
              </label>
              <Input
                {...register('entityId')}
                placeholder="https://your-idp.example.com/saml/metadata"
                error={errors.entityId?.message}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                SSO URL *
              </label>
              <Input
                {...register('ssoUrl')}
                placeholder="https://your-idp.example.com/saml/sso"
                error={errors.ssoUrl?.message}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                X.509 Certificate *
              </label>
              <div className="relative">
                <textarea
                  {...register('x509Certificate')}
                  rows={showCertificate ? 10 : 3}
                  className={`w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm ${
                    !showCertificate ? 'text-transparent' : ''
                  }`}
                  placeholder="-----BEGIN CERTIFICATE-----&#10;MIIDXTCCAkWgAwIBAgIJAKoK/OvMjP...&#10;-----END CERTIFICATE-----"
                  style={!showCertificate ? { 
                    backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 1.5em, #ddd 1.5em, #ddd calc(1.5em + 1px))'
                  } : {}}
                />
                <button
                  type="button"
                  onClick={() => setShowCertificate(!showCertificate)}
                  className="absolute top-2 right-2 p-1 rounded hover:bg-gray-100"
                >
                  {showCertificate ? (
                    <EyeOff className="h-4 w-4 text-gray-500" />
                  ) : (
                    <Eye className="h-4 w-4 text-gray-500" />
                  )}
                </button>
              </div>
              {errors.x509Certificate && (
                <p className="mt-1 text-sm text-red-600">{errors.x509Certificate.message}</p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Signature Algorithm
                </label>
                <select
                  {...register('signatureAlgorithm')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="sha256">SHA-256 (Recommended)</option>
                  <option value="sha1">SHA-1 (Legacy)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Name ID Format
                </label>
                <select
                  {...register('nameIdFormat')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">
                    Email Address
                  </option>
                  <option value="urn:oasis:names:tc:SAML:2.0:nameid-format:persistent">
                    Persistent
                  </option>
                  <option value="urn:oasis:names:tc:SAML:2.0:nameid-format:transient">
                    Transient
                  </option>
                </select>
              </div>
            </div>
          </div>
        </Card>

        {/* Attribute Mapping */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Attribute Mapping
          </h3>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Attribute *
                </label>
                <Input
                  {...register('attributeMapping.email')}
                  placeholder="http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"
                  error={errors.attributeMapping?.email?.message}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  First Name Attribute *
                </label>
                <Input
                  {...register('attributeMapping.firstName')}
                  placeholder="http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname"
                  error={errors.attributeMapping?.firstName?.message}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Last Name Attribute *
                </label>
                <Input
                  {...register('attributeMapping.lastName')}
                  placeholder="http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname"
                  error={errors.attributeMapping?.lastName?.message}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Role Attribute (Optional)
                </label>
                <Input
                  {...register('attributeMapping.role')}
                  placeholder="http://schemas.microsoft.com/ws/2008/06/identity/claims/role"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Department Attribute (Optional)
              </label>
              <Input
                {...register('attributeMapping.department')}
                placeholder="http://schemas.xmlsoap.org/ws/2005/05/identity/claims/department"
              />
            </div>
          </div>
        </Card>

        {/* Security Settings */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Security Settings
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-700">
                  Encrypt Assertions
                </label>
                <p className="text-sm text-gray-500">
                  Require SAML assertions to be encrypted
                </p>
              </div>
              <input
                type="checkbox"
                {...register('encryptAssertions')}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-700">
                  Sign Requests
                </label>
                <p className="text-sm text-gray-500">
                  Sign outgoing SAML requests
                </p>
              </div>
              <input
                type="checkbox"
                {...register('signRequests')}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
            </div>
          </div>
        </Card>

        {/* User Provisioning */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            User Provisioning
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-700">
                  Auto-provision Users
                </label>
                <p className="text-sm text-gray-500">
                  Automatically create accounts for new users
                </p>
              </div>
              <input
                type="checkbox"
                {...register('autoProvision')}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Default Role for New Users
              </label>
              <select
                {...register('defaultRole')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {Object.values(OrganizationRole).map(role => (
                  <option key={role} value={role}>
                    {role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Card>

        {/* Domain Restrictions */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Domain Restrictions (Optional)
          </h3>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Allowed Email Domains
            </label>
            <Input
              placeholder="example.com, company.org (comma-separated)"
              onChange={(e) => {
                const domains = e.target.value.split(',').map(d => d.trim()).filter(Boolean)
                setValue('domainRestriction', domains)
              }}
            />
            <p className="text-sm text-gray-500 mt-1">
              Leave empty to allow all domains. Users with email addresses from other domains will be rejected.
            </p>
          </div>
        </Card>

        {/* Actions */}
        <div className="flex items-center justify-between">
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
              Reset Changes
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !isDirty}
              className="flex items-center space-x-2"
            >
              <Save className="h-4 w-4" />
              <span>{isLoading ? 'Saving...' : 'Save Configuration'}</span>
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}