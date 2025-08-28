import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { cn } from '@/lib/utils'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { Analytics } from '@/components/Analytics'
import { JsonLd } from '@/components/JsonLd'

const inter = Inter({ 
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://fineprint.ai'),
  title: {
    default: 'Fine Print AI - The Guardian of Your Digital Rights',
    template: '%s | Fine Print AI',
  },
  description: 'AI-powered legal document analysis. Instantly understand Terms of Service, Privacy Policies, and EULAs. Protect your digital rights with privacy-first, local AI processing.',
  keywords: ['legal document analysis', 'terms of service analyzer', 'privacy policy reader', 'EULA checker', 'AI legal assistant', 'digital rights protection'],
  authors: [{ name: 'Fine Print AI' }],
  creator: 'Fine Print AI',
  publisher: 'Fine Print AI',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    title: 'Fine Print AI - The Guardian of Your Digital Rights',
    description: 'AI-powered legal document analysis. Instantly understand Terms of Service, Privacy Policies, and EULAs.',
    url: 'https://fineprint.ai',
    siteName: 'Fine Print AI',
    images: [
      {
        url: 'https://fineprint.ai/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Fine Print AI - Protecting Your Digital Rights',
      }
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Fine Print AI - The Guardian of Your Digital Rights',
    description: 'AI-powered legal document analysis. Instantly understand Terms of Service, Privacy Policies, and EULAs.',
    images: ['https://fineprint.ai/twitter-image.png'],
    creator: '@fineprintai',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    google: 'google-site-verification-code',
    yandex: 'yandex-verification-code',
    yahoo: 'yahoo-verification-code',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={cn(inter.variable, 'scroll-smooth')}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="manifest" href="/site.webmanifest" />
        <link rel="mask-icon" href="/safari-pinned-tab.svg" color="#0ea5e9" />
        <meta name="msapplication-TileColor" content="#0ea5e9" />
        <meta name="theme-color" content="#ffffff" />
      </head>
      <body className={cn(
        'min-h-screen bg-white font-sans text-gray-900 antialiased',
        'selection:bg-primary-200 selection:text-primary-900'
      )}>
        <JsonLd />
        <Navbar />
        <main className="flex min-h-screen flex-col">
          {children}
        </main>
        <Footer />
        <Analytics />
      </body>
    </html>
  )
}