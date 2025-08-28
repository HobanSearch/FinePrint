import { PageDetector } from '@/lib/page-detector'

describe('PageDetector', () => {
  describe('detect', () => {
    it('should detect terms of service pages by URL', () => {
      const result = PageDetector.detect(
        'https://example.com/terms-of-service',
        'Terms of Service',
        ''
      )

      expect(result.isTermsPage).toBe(true)
      expect(result.documentType).toBe('terms')
      expect(result.confidence).toBeGreaterThan(0.5)
    })

    it('should detect privacy policy pages by URL', () => {
      const result = PageDetector.detect(
        'https://example.com/privacy-policy',
        'Privacy Policy',
        ''
      )

      expect(result.isPrivacyPage).toBe(true)
      expect(result.documentType).toBe('privacy')
      expect(result.confidence).toBeGreaterThan(0.5)
    })

    it('should detect terms pages by content', () => {
      const content = `
        By using this service, you agree to these terms of service.
        These terms govern your use of our website and services.
        Violation of these terms may result in termination of your account.
      `

      const result = PageDetector.detect(
        'https://example.com/legal',
        'Legal Terms',
        content
      )

      expect(result.isTermsPage).toBe(true)
      expect(result.confidence).toBeGreaterThan(0.3)
    })

    it('should detect privacy pages by content', () => {
      const content = `
        We collect personal information when you use our services.
        This privacy policy explains how we use your personal data.
        We may share your information with third parties as described below.
      `

      const result = PageDetector.detect(
        'https://example.com/privacy',
        'Privacy Notice',
        content
      )

      expect(result.isPrivacyPage).toBe(true)
      expect(result.confidence).toBeGreaterThan(0.3)
    })

    it('should not detect regular pages as legal documents', () => {
      const result = PageDetector.detect(
        'https://example.com/about',
        'About Us',
        'We are a great company that provides excellent services.'
      )

      expect(result.isTermsPage).toBe(false)
      expect(result.isPrivacyPage).toBe(false)
      expect(result.confidence).toBeLessThan(0.3)
    })

    it('should handle empty content gracefully', () => {
      const result = PageDetector.detect(
        'https://example.com/terms',
        '',
        ''
      )

      expect(result).toBeDefined()
      expect(typeof result.confidence).toBe('number')
      expect(Array.isArray(result.indicators)).toBe(true)
    })
  })

  describe('detectSPA', () => {
    it('should detect SPA legal documents with strong content indicators', () => {
      const content = `
        By using this application, you agree to these terms.
        We collect and process your personal information as described in this privacy policy.
        These terms of service govern your use of our platform.
      `

      const result = PageDetector.detectSPA(
        'https://app.example.com/#/legal',
        'Legal Information',
        content
      )

      expect(result.confidence).toBeGreaterThan(0.3)
      expect(result.indicators).toContain('Strong content indicators for SPA')
    })
  })

  describe('hasContentChanged', () => {
    it('should detect content changes', () => {
      const oldContent = 'Original terms of service content'
      const newContent = 'Updated terms of service content'

      const hasChanged = PageDetector.hasContentChanged(oldContent, newContent)
      expect(hasChanged).toBe(true)
    })

    it('should not detect changes in identical content', () => {
      const content = 'Same terms of service content'

      const hasChanged = PageDetector.hasContentChanged(content, content)
      expect(hasChanged).toBe(false)
    })
  })

  describe('getPageReadiness', () => {
    it('should calculate page readiness correctly', () => {
      const content = `
        <html>
          <head><title>Terms of Service</title></head>
          <body>
            <h1>Terms of Service</h1>
            <p>By using our service, you agree to these terms.</p>
            <p>Last updated: January 1, 2024</p>
            ${Array(60).fill('<p>Additional content paragraph.</p>').join('\n')}
          </body>
        </html>
      `

      const readiness = PageDetector.getPageReadiness(content)
      expect(readiness).toBeGreaterThan(0.5)
      expect(readiness).toBeLessThanOrEqual(1)
    })

    it('should return low readiness for minimal content', () => {
      const content = '<p>Short content</p>'

      const readiness = PageDetector.getPageReadiness(content)
      expect(readiness).toBeLessThan(0.5)
    })
  })
})