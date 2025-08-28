'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { ArrowRight, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

// Placeholder data for top sites
const topSites = [
  { name: 'Facebook', score: 3.2, rating: 'poor', issues: 47 },
  { name: 'Google', score: 4.1, rating: 'fair', issues: 38 },
  { name: 'Amazon', score: 5.8, rating: 'fair', issues: 29 },
  { name: 'Netflix', score: 7.2, rating: 'good', issues: 12 },
  { name: 'Apple', score: 8.1, rating: 'good', issues: 8 },
  { name: 'Microsoft', score: 6.5, rating: 'fair', issues: 21 },
  { name: 'Twitter/X', score: 3.8, rating: 'poor', issues: 42 },
  { name: 'Instagram', score: 3.5, rating: 'poor', issues: 45 },
  { name: 'TikTok', score: 2.9, rating: 'poor', issues: 52 },
  { name: 'LinkedIn', score: 5.2, rating: 'fair', issues: 31 },
  { name: 'Spotify', score: 6.8, rating: 'good', issues: 18 },
  { name: 'Discord', score: 7.5, rating: 'good', issues: 15 },
]

const getRatingColor = (rating: string) => {
  switch (rating) {
    case 'good':
      return 'text-success-600 bg-success-50 border-success-200'
    case 'fair':
      return 'text-warning-600 bg-warning-50 border-warning-200'
    case 'poor':
      return 'text-danger-600 bg-danger-50 border-danger-200'
    default:
      return 'text-gray-600 bg-gray-50 border-gray-200'
  }
}

const getRatingIcon = (rating: string) => {
  switch (rating) {
    case 'good':
      return CheckCircle
    case 'fair':
      return AlertTriangle
    case 'poor':
      return XCircle
    default:
      return AlertTriangle
  }
}

export function PrivacyScoresSection() {
  return (
    <section className="py-20 bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
            Privacy Scores for Top 50 Sites
          </h2>
          <p className="mt-4 text-xl text-gray-600 max-w-3xl mx-auto">
            See how popular websites stack up when it comes to protecting your privacy and rights
          </p>
        </motion.div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {topSites.map((site, index) => {
            const Icon = getRatingIcon(site.rating)
            return (
              <motion.div
                key={site.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.05 }}
                className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{site.name}</h3>
                    <div className="mt-2 flex items-center space-x-2">
                      <span className="text-2xl font-bold text-gray-900">
                        {site.score.toFixed(1)}
                      </span>
                      <span className="text-sm text-gray-500">/10</span>
                    </div>
                  </div>
                  <div
                    className={cn(
                      'flex items-center space-x-1 px-3 py-1 rounded-full border',
                      getRatingColor(site.rating)
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-sm font-medium capitalize">{site.rating}</span>
                  </div>
                </div>
                <div className="mt-4 flex items-center text-sm text-gray-600">
                  <AlertTriangle className="h-4 w-4 mr-1 text-danger-500" />
                  {site.issues} privacy issues found
                </div>
              </motion.div>
            )
          })}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-12 text-center"
        >
          <Link
            href="/privacy-scores"
            className="inline-flex items-center text-primary-600 hover:text-primary-700 font-medium group"
          >
            View all 50 sites with detailed analysis
            <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
          </Link>
        </motion.div>
      </div>
    </section>
  )
}