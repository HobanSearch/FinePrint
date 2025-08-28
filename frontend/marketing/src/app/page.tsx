import { Metadata } from 'next'
import { HeroSection } from '@/components/sections/HeroSection'
import { PrivacyScoresSection } from '@/components/sections/PrivacyScoresSection'
import { HowItWorksSection } from '@/components/sections/HowItWorksSection'
import { FeaturesSection } from '@/components/sections/FeaturesSection'
import { DemoSection } from '@/components/sections/DemoSection'
import { PricingSection } from '@/components/sections/PricingSection'
import { TestimonialsSection } from '@/components/sections/TestimonialsSection'
import { CTASection } from '@/components/sections/CTASection'

export const metadata: Metadata = {
  title: 'Fine Print AI - The Guardian of Your Digital Rights',
  description: 'AI-powered legal document analysis. Instantly understand Terms of Service, Privacy Policies, and EULAs. Protect your digital rights with privacy-first, local AI processing.',
}

export default function HomePage() {
  return (
    <>
      <HeroSection />
      <PrivacyScoresSection />
      <HowItWorksSection />
      <FeaturesSection />
      <DemoSection />
      <PricingSection />
      <TestimonialsSection />
      <CTASection />
    </>
  )
}