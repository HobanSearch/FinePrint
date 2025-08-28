import Script from 'next/script'

export function JsonLd() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Fine Print AI',
    description: 'AI-powered legal document analysis. Instantly understand Terms of Service, Privacy Policies, and EULAs.',
    url: 'https://fineprint.ai',
    logo: 'https://fineprint.ai/logo.png',
    sameAs: [
      'https://twitter.com/fineprintai',
      'https://linkedin.com/company/fineprintai',
      'https://github.com/fineprintai',
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: '',
      contactType: 'customer support',
      email: 'support@fineprint.ai',
      areaServed: 'Worldwide',
      availableLanguage: ['English'],
    },
  }

  return (
    <Script
      id="json-ld"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  )
}