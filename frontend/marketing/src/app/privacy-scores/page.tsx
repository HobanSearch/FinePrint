import { Metadata } from 'next'
import { PrivacyScoresSection } from '@/components/sections/PrivacyScoresSection'
import { DetailedScoresTable } from '@/components/sections/DetailedScoresTable'

export const metadata: Metadata = {
  title: 'Privacy Scores for Top 50 Sites | Fine Print AI',
  description: 'Comprehensive privacy analysis and scores for the top 50 most popular websites. See how your favorite sites handle your data.',
}

export default function PrivacyScoresPage() {
  return (
    <main className="pt-16">
      <section className="py-20 bg-gradient-to-br from-primary-50 to-accent-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-4xl sm:text-5xl font-bold text-gray-900">
              Privacy Scores for Top 50 Sites
            </h1>
            <p className="mt-6 text-xl text-gray-600 max-w-3xl mx-auto">
              We've analyzed the terms of service and privacy policies of the most popular websites 
              to help you understand how they handle your data and rights.
            </p>
          </div>
        </div>
      </section>
      
      <DetailedScoresTable />
    </main>
  )
}