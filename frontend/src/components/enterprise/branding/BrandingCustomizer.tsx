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
import { OrganizationBranding } from '../../../types/enterprise'
import { 
  Palette, 
  Upload, 
  Eye, 
  Monitor, 
  Smartphone, 
  Tablet, 
  Globe, 
  Image, 
  Type, 
  Layout, 
  Settings, 
  Save, 
  RefreshCw, 
  Download, 
  Copy, 
  Check,
  X,
  AlertTriangle,
  Paintbrush,
  Css3,
  FileText,
  Mail,
  Link,
  ExternalLink
} from 'lucide-react'

const brandingSchema = z.object({
  logoUrl: z.string().url('Invalid logo URL').optional().or(z.literal('')),
  primaryColor: z.string().regex(/^#[0-9A-F]{6}$/i, 'Invalid hex color'),
  secondaryColor: z.string().regex(/^#[0-9A-F]{6}$/i, 'Invalid hex color'),
  customCSS: z.string().optional(),
  customDomain: z.string().optional(),
  companyName: z.string().min(1, 'Company name is required'),
  supportEmail: z.string().email('Invalid email address'),
  privacyPolicyUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
  termsOfServiceUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
  customFavicon: z.string().url('Invalid favicon URL').optional().or(z.literal('')),
  loginPageBackground: z.string().url('Invalid background URL').optional().or(z.literal(''))
})

type BrandingForm = z.infer<typeof brandingSchema>

interface ColorPreset {
  name: string
  primary: string
  secondary: string
  description: string
}

const colorPresets: ColorPreset[] = [
  { name: 'Professional Blue', primary: '#3B82F6', secondary: '#64748B', description: 'Clean and professional' },
  { name: 'Corporate Navy', primary: '#1E40AF', secondary: '#475569', description: 'Traditional corporate' },
  { name: 'Modern Purple', primary: '#8B5CF6', secondary: '#6B7280', description: 'Contemporary and vibrant' },
  { name: 'Elegant Teal', primary: '#14B8A6', secondary: '#52525B', description: 'Sophisticated and calming' },
  { name: 'Bold Orange', primary: '#F97316', secondary: '#71717A', description: 'Energetic and modern' },
  { name: 'Classic Green', primary: '#059669', secondary: '#6B7280', description: 'Trustworthy and stable' }
]

export const BrandingCustomizer: React.FC = () => {
  const { enterprise } = useStore()
  const [activeTab, setActiveTab] = useState<'colors' | 'assets' | 'content' | 'css' | 'preview'>('colors')
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop')
  const [uploading, setUploading] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    setValue,
    watch,
    reset
  } = useForm<BrandingForm>({
    resolver: zodResolver(brandingSchema),
    defaultValues: {
      primaryColor: '#3B82F6',
      secondaryColor: '#64748B',
      companyName: 'Your Company',
      supportEmail: 'support@yourcompany.com'
    }
  })

  const watchedValues = watch()

  useEffect(() => {
    if (enterprise.currentOrganization?.branding) {
      const branding = enterprise.currentOrganization.branding
      reset({
        logoUrl: branding.logoUrl || '',
        primaryColor: branding.primaryColor,
        secondaryColor: branding.secondaryColor,
        customCSS: branding.customCSS || '',
        customDomain: branding.customDomain || '',
        companyName: branding.companyName,
        supportEmail: branding.supportEmail,
        privacyPolicyUrl: branding.privacyPolicyUrl || '',
        termsOfServiceUrl: branding.termsOfServiceUrl || '',
        customFavicon: branding.customFavicon || '',
        loginPageBackground: branding.loginPageBackground || ''
      })
    }
  }, [enterprise.currentOrganization?.branding, reset])

  const onSubmit = async (data: BrandingForm) => {
    if (!enterprise.currentOrganization) return

    setIsLoading(true)
    try {
      await enterprise.updateOrganization(enterprise.currentOrganization.id, {
        branding: {
          ...data,
          logoUrl: data.logoUrl || undefined,
          customCSS: data.customCSS || undefined,
          customDomain: data.customDomain || undefined,
          privacyPolicyUrl: data.privacyPolicyUrl || undefined,
          termsOfServiceUrl: data.termsOfServiceUrl || undefined,
          customFavicon: data.customFavicon || undefined,
          loginPageBackground: data.loginPageBackground || undefined
        }
      })
    } catch (error) {
      console.error('Failed to update branding:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const uploadFile = async (file: File, type: 'logo' | 'favicon' | 'background') => {
    setUploading(true)
    try {
      // This would typically upload to a CDN or file storage service
      const formData = new FormData()
      formData.append('file', file)
      formData.append('type', type)
      formData.append('organizationId', enterprise.currentOrganization?.id || '')

      // Simulate file upload
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Mock uploaded URL
      const mockUrl = `https://cdn.example.com/${type}/${Date.now()}-${file.name}`
      
      if (type === 'logo') setValue('logoUrl', mockUrl)
      if (type === 'favicon') setValue('customFavicon', mockUrl)
      if (type === 'background') setValue('loginPageBackground', mockUrl)
      
    } catch (error) {
      console.error('Upload failed:', error)
    } finally {
      setUploading(false)
    }
  }

  const applyColorPreset = (preset: ColorPreset) => {
    setValue('primaryColor', preset.primary)
    setValue('secondaryColor', preset.secondary)
  }

  const generateCSS = () => {
    return `/* Custom Branding Styles */
:root {
  --primary-color: ${watchedValues.primaryColor};
  --secondary-color: ${watchedValues.secondaryColor};
  --primary-rgb: ${hexToRgb(watchedValues.primaryColor)};
  --secondary-rgb: ${hexToRgb(watchedValues.secondaryColor)};
}

/* Primary color variants */
.bg-primary { background-color: var(--primary-color); }
.text-primary { color: var(--primary-color); }
.border-primary { border-color: var(--primary-color); }

/* Secondary color variants */
.bg-secondary { background-color: var(--secondary-color); }
.text-secondary { color: var(--secondary-color); }
.border-secondary { border-color: var(--secondary-color); }

/* Buttons */
.btn-primary {
  background-color: var(--primary-color);
  border-color: var(--primary-color);
  color: white;
}

.btn-primary:hover {
  background-color: rgba(var(--primary-rgb), 0.9);
  border-color: rgba(var(--primary-rgb), 0.9);
}

/* Links */
a {
  color: var(--primary-color);
}

a:hover {
  color: rgba(var(--primary-rgb), 0.8);
}

/* Custom logo styling */
.brand-logo {
  max-height: 40px;
  width: auto;
}

/* Login page background */
.login-page {
  ${watchedValues.loginPageBackground ? 
    `background-image: url('${watchedValues.loginPageBackground}');
     background-size: cover;
     background-position: center;` : 
    'background: linear-gradient(135deg, var(--primary-color), var(--secondary-color));'
  }
}

${watchedValues.customCSS || ''}
`
  }

  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result ? 
      `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : 
      '0, 0, 0'
  }

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text)
    setCopied(type)
    setTimeout(() => setCopied(null), 2000)
  }

  const exportBrandingConfig = () => {
    const config = {
      branding: watchedValues,
      css: generateCSS(),
      exportedAt: new Date().toISOString()
    }
    
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${enterprise.currentOrganization?.slug || 'organization'}-branding.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (enterprise.isLoading) {
    return <LoadingPage message="Loading branding settings..." />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Palette className="h-6 w-6 text-blue-500" />
          <h2 className="text-2xl font-bold text-gray-900">
            Brand Customization
          </h2>
        </div>
        <div className="flex space-x-2">
          <Button
            variant="outline"
            onClick={exportBrandingConfig}
            className="flex items-center space-x-2"
          >
            <Download className="h-4 w-4" />
            <span>Export Config</span>
          </Button>
          <Button
            onClick={handleSubmit(onSubmit)}
            disabled={isLoading || !isDirty}
            className="flex items-center space-x-2"
          >
            <Save className="h-4 w-4" />
            <span>{isLoading ? 'Saving...' : 'Save Changes'}</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Settings Panel */}
        <div className="lg:col-span-2 space-y-6">
          {/* Tab Navigation */}
          <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
            {[
              { id: 'colors', label: 'Colors', icon: Palette },
              { id: 'assets', label: 'Assets', icon: Image },
              { id: 'content', label: 'Content', icon: FileText },
              { id: 'css', label: 'Custom CSS', icon: Css3 },
              { id: 'preview', label: 'Preview', icon: Eye }
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id as any)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === id
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </button>
            ))}
          </div>

          {/* Colors Tab */}
          {activeTab === 'colors' && (
            <div className="space-y-6">
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Color Scheme</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Primary Color *
                    </label>
                    <div className="flex items-center space-x-3">
                      <input
                        type="color"
                        {...register('primaryColor')}
                        className="h-10 w-16 rounded border border-gray-300"
                      />
                      <Input
                        {...register('primaryColor')}
                        placeholder="#3B82F6"
                        className="flex-1"
                        error={errors.primaryColor?.message}
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Secondary Color *
                    </label>
                    <div className="flex items-center space-x-3">
                      <input
                        type="color"
                        {...register('secondaryColor')}
                        className="h-10 w-16 rounded border border-gray-300"
                      />
                      <Input
                        {...register('secondaryColor')}
                        placeholder="#64748B"
                        className="flex-1"
                        error={errors.secondaryColor?.message}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-md font-medium text-gray-900 mb-3">Color Presets</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {colorPresets.map((preset) => (
                      <div
                        key={preset.name}
                        className="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-gray-50"
                        onClick={() => applyColorPreset(preset)}
                      >
                        <div className="flex items-center space-x-3">
                          <div className="flex space-x-1">
                            <div
                              className="w-6 h-6 rounded"
                              style={{ backgroundColor: preset.primary }}
                            />
                            <div
                              className="w-6 h-6 rounded"
                              style={{ backgroundColor: preset.secondary }}
                            />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{preset.name}</p>
                            <p className="text-sm text-gray-500">{preset.description}</p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation()
                            applyColorPreset(preset)
                          }}
                        >
                          Apply
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* Assets Tab */}
          {activeTab === 'assets' && (
            <div className="space-y-6">
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Brand Assets</h3>
                
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Company Logo
                    </label>
                    <div className="flex items-center space-x-4">
                      {watchedValues.logoUrl && (
                        <div className="flex-shrink-0">
                          <img
                            src={watchedValues.logoUrl}
                            alt="Company Logo"
                            className="h-12 w-auto rounded border"
                          />
                        </div>
                      )}
                      <div className="flex-1">
                        <Input
                          {...register('logoUrl')}
                          placeholder="https://example.com/logo.png"
                          error={errors.logoUrl?.message}
                        />
                      </div>
                      <div>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0], 'logo')}
                          className="hidden"
                          id="logo-upload"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          disabled={uploading}
                          onClick={() => document.getElementById('logo-upload')?.click()}
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          Upload
                        </Button>
                      </div>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      Recommended: SVG or PNG, max 200px height
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Custom Favicon
                    </label>
                    <div className="flex items-center space-x-4">
                      {watchedValues.customFavicon && (
                        <div className="flex-shrink-0">
                          <img
                            src={watchedValues.customFavicon}
                            alt="Favicon"
                            className="h-8 w-8 rounded border"
                          />
                        </div>
                      )}
                      <div className="flex-1">
                        <Input
                          {...register('customFavicon')}
                          placeholder="https://example.com/favicon.ico"
                          error={errors.customFavicon?.message}
                        />
                      </div>
                      <div>
                        <input
                          type="file"
                          accept="image/*,.ico"
                          onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0], 'favicon')}
                          className="hidden"
                          id="favicon-upload"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          disabled={uploading}
                          onClick={() => document.getElementById('favicon-upload')?.click()}
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          Upload
                        </Button>
                      </div>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      Recommended: ICO or PNG, 32x32px
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Login Page Background
                    </label>
                    <div className="flex items-center space-x-4">
                      {watchedValues.loginPageBackground && (
                        <div className="flex-shrink-0">
                          <img
                            src={watchedValues.loginPageBackground}
                            alt="Background"
                            className="h-16 w-24 object-cover rounded border"
                          />
                        </div>
                      )}
                      <div className="flex-1">
                        <Input
                          {...register('loginPageBackground')}
                          placeholder="https://example.com/background.jpg"
                          error={errors.loginPageBackground?.message}
                        />
                      </div>
                      <div>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0], 'background')}
                          className="hidden"
                          id="background-upload"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          disabled={uploading}
                          onClick={() => document.getElementById('background-upload')?.click()}
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          Upload
                        </Button>
                      </div>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      Recommended: JPG or PNG, 1920x1080px minimum
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* Content Tab */}
          {activeTab === 'content' && (
            <div className="space-y-6">
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Company Information</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Company Name *
                    </label>
                    <Input
                      {...register('companyName')}
                      placeholder="Your Company Name"
                      error={errors.companyName?.message}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Support Email *
                    </label>
                    <Input
                      type="email"
                      {...register('supportEmail')}
                      placeholder="support@yourcompany.com"
                      error={errors.supportEmail?.message}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Custom Domain
                    </label>
                    <Input
                      {...register('customDomain')}
                      placeholder="app.yourcompany.com"
                      error={errors.customDomain?.message}
                    />
                    <p className="text-sm text-gray-500 mt-1">
                      Custom domain for white-label deployment
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Privacy Policy URL
                    </label>
                    <Input
                      type="url"
                      {...register('privacyPolicyUrl')}
                      placeholder="https://yourcompany.com/privacy"
                      error={errors.privacyPolicyUrl?.message}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Terms of Service URL
                    </label>
                    <Input
                      type="url"
                      {...register('termsOfServiceUrl')}
                      placeholder="https://yourcompany.com/terms"
                      error={errors.termsOfServiceUrl?.message}
                    />
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* Custom CSS Tab */}
          {activeTab === 'css' && (
            <div className="space-y-6">
              <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Custom CSS</h3>
                  <div className="flex space-x-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(generateCSS(), 'css')}
                    >
                      {copied === 'css' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      {copied === 'css' ? 'Copied' : 'Copy Generated CSS'}
                    </Button>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Generated CSS Variables
                    </label>
                    <textarea
                      value={generateCSS()}
                      readOnly
                      rows={12}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-50 font-mono text-sm"
                    />
                    <p className="text-sm text-gray-500 mt-1">
                      This CSS is automatically generated from your color scheme
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Additional Custom CSS
                    </label>
                    <textarea
                      {...register('customCSS')}
                      rows={8}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                      placeholder="/* Add your custom CSS here */
.custom-header {
  font-weight: bold;
  color: var(--primary-color);
}

.custom-button {
  background: linear-gradient(45deg, var(--primary-color), var(--secondary-color));
}"
                    />
                    <p className="text-sm text-gray-500 mt-1">
                      Add custom CSS to further customize the appearance
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* Preview Tab */}
          {activeTab === 'preview' && (
            <div className="space-y-6">
              <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Live Preview</h3>
                  <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
                    {[
                      { id: 'desktop', icon: Monitor, label: 'Desktop' },
                      { id: 'tablet', icon: Tablet, label: 'Tablet' },
                      { id: 'mobile', icon: Smartphone, label: 'Mobile' }
                    ].map(({ id, icon: Icon, label }) => (
                      <button
                        key={id}
                        onClick={() => setPreviewDevice(id as any)}
                        className={`flex items-center space-x-2 px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                          previewDevice === id
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="hidden sm:inline">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Preview iframe would go here */}
                <div className={`bg-gray-100 rounded-lg p-4 ${
                  previewDevice === 'desktop' ? 'h-96' :
                  previewDevice === 'tablet' ? 'h-80 max-w-md mx-auto' :
                  'h-96 max-w-sm mx-auto'
                }`}>
                  <div 
                    className="w-full h-full rounded-lg flex items-center justify-center text-white"
                    style={{ 
                      background: watchedValues.loginPageBackground ? 
                        `url('${watchedValues.loginPageBackground}') center/cover` :
                        `linear-gradient(135deg, ${watchedValues.primaryColor}, ${watchedValues.secondaryColor})`
                    }}
                  >
                    <div className="text-center">
                      {watchedValues.logoUrl && (
                        <img
                          src={watchedValues.logoUrl}
                          alt="Logo"
                          className="h-12 w-auto mx-auto mb-4"
                        />
                      )}
                      <h1 className="text-2xl font-bold mb-2">{watchedValues.companyName}</h1>
                      <p className="text-sm opacity-90">Welcome to Fine Print AI</p>
                      <div className="mt-6 space-y-2">
                        <div
                          className="px-4 py-2 rounded-lg inline-block"
                          style={{ backgroundColor: watchedValues.primaryColor }}
                        >
                          Sign In
                        </div>
                        <div className="text-xs opacity-75">
                          Need help? Contact {watchedValues.supportEmail}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 text-center">
                  <p className="text-sm text-gray-500">
                    This is a preview of how your branding will appear on the login page
                  </p>
                </div>
              </Card>
            </div>
          )}
        </div>

        {/* Preview Panel */}
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Preview</h3>
            
            {/* Color Swatches */}
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Color Palette</p>
                <div className="flex space-x-3">
                  <div className="text-center">
                    <div
                      className="w-12 h-12 rounded-lg border-2 border-gray-200"
                      style={{ backgroundColor: watchedValues.primaryColor }}
                    />
                    <p className="text-xs text-gray-500 mt-1">Primary</p>
                  </div>
                  <div className="text-center">
                    <div
                      className="w-12 h-12 rounded-lg border-2 border-gray-200"
                      style={{ backgroundColor: watchedValues.secondaryColor }}
                    />
                    <p className="text-xs text-gray-500 mt-1">Secondary</p>
                  </div>
                </div>
              </div>

              {/* Logo Preview */}
              {watchedValues.logoUrl && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Logo</p>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <img
                      src={watchedValues.logoUrl}
                      alt="Logo Preview"
                      className="h-8 w-auto"
                    />
                  </div>
                </div>
              )}

              {/* Button Samples */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Button Styles</p>
                <div className="space-y-2">
                  <button
                    className="w-full px-4 py-2 rounded-lg text-white text-sm font-medium"
                    style={{ backgroundColor: watchedValues.primaryColor }}
                  >
                    Primary Button
                  </button>
                  <button
                    className="w-full px-4 py-2 rounded-lg text-sm font-medium border"
                    style={{ 
                      borderColor: watchedValues.primaryColor,
                      color: watchedValues.primaryColor
                    }}
                  >
                    Secondary Button
                  </button>
                </div>
              </div>

              {/* Typography Sample */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Typography</p>
                <div className="space-y-1">
                  <h4 
                    className="text-lg font-bold"
                    style={{ color: watchedValues.primaryColor }}
                  >
                    {watchedValues.companyName}
                  </h4>
                  <p className="text-sm" style={{ color: watchedValues.secondaryColor }}>
                    Welcome to Fine Print AI
                  </p>
                  <a 
                    href="#" 
                    className="text-sm underline"
                    style={{ color: watchedValues.primaryColor }}
                  >
                    Learn more
                  </a>
                </div>
              </div>
            </div>
          </Card>

          {/* Domain Settings */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Domain Configuration</h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Current Domain</label>
                <div className="flex items-center space-x-2 mt-1">
                  <Globe className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-600">
                    {watchedValues.customDomain || 'app.fineprintai.com'}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(watchedValues.customDomain || 'app.fineprintai.com', 'domain')}
                  >
                    {copied === 'domain' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </Button>
                </div>
              </div>

              {watchedValues.customDomain && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-start space-x-2">
                    <AlertTriangle className="h-4 w-4 text-blue-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-blue-800">DNS Configuration Required</p>
                      <p className="text-xs text-blue-600 mt-1">
                        Point your domain's CNAME record to our servers to activate custom domain.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Links */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Important Links</h3>
            
            <div className="space-y-3">
              {watchedValues.privacyPolicyUrl && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">Privacy Policy</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(watchedValues.privacyPolicyUrl, '_blank')}
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>
              )}
              
              {watchedValues.termsOfServiceUrl && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">Terms of Service</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(watchedValues.termsOfServiceUrl, '_blank')}
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>
              )}
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">Support Email</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.open(`mailto:${watchedValues.supportEmail}`, '_blank')}
                >
                  <Mail className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}