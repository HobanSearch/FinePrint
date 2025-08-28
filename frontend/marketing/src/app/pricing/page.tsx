import { Metadata } from 'next'
import { PricingSection } from '@/components/sections/PricingSection'
import { FAQ } from '@/components/sections/FAQ'

export const metadata: Metadata = {
  title: 'Pricing | Fine Print AI',
  description: 'Simple, transparent pricing for Fine Print AI. Free tier available, Pro at $9.99/month, Business at $49.99/month.',
}

export default function PricingPage() {
  return (
    <main className="pt-16">
      <PricingSection />
      <FAQ />
    </main>
  )
}