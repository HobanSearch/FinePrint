'use client'

import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronUp, ChevronDown, Info, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

// Extended data for all 50 sites
const allSites = [
  { rank: 1, name: 'Facebook', score: 3.2, rating: 'poor', issues: 47, dataSharing: 'extensive', tracking: 'invasive', rights: 'limited' },
  { rank: 2, name: 'Google', score: 4.1, rating: 'fair', issues: 38, dataSharing: 'broad', tracking: 'comprehensive', rights: 'moderate' },
  { rank: 3, name: 'Amazon', score: 5.8, rating: 'fair', issues: 29, dataSharing: 'moderate', tracking: 'extensive', rights: 'fair' },
  { rank: 4, name: 'Netflix', score: 7.2, rating: 'good', issues: 12, dataSharing: 'limited', tracking: 'minimal', rights: 'good' },
  { rank: 5, name: 'Apple', score: 8.1, rating: 'good', issues: 8, dataSharing: 'minimal', tracking: 'limited', rights: 'strong' },
  { rank: 6, name: 'Microsoft', score: 6.5, rating: 'fair', issues: 21, dataSharing: 'moderate', tracking: 'moderate', rights: 'fair' },
  { rank: 7, name: 'Twitter/X', score: 3.8, rating: 'poor', issues: 42, dataSharing: 'extensive', tracking: 'heavy', rights: 'weak' },
  { rank: 8, name: 'Instagram', score: 3.5, rating: 'poor', issues: 45, dataSharing: 'extensive', tracking: 'invasive', rights: 'limited' },
  { rank: 9, name: 'TikTok', score: 2.9, rating: 'poor', issues: 52, dataSharing: 'excessive', tracking: 'pervasive', rights: 'minimal' },
  { rank: 10, name: 'LinkedIn', score: 5.2, rating: 'fair', issues: 31, dataSharing: 'broad', tracking: 'moderate', rights: 'moderate' },
  // Add more sites...
  { rank: 11, name: 'Spotify', score: 6.8, rating: 'good', issues: 18, dataSharing: 'limited', tracking: 'minimal', rights: 'good' },
  { rank: 12, name: 'Discord', score: 7.5, rating: 'good', issues: 15, dataSharing: 'minimal', tracking: 'limited', rights: 'strong' },
  { rank: 13, name: 'Reddit', score: 6.2, rating: 'fair', issues: 24, dataSharing: 'moderate', tracking: 'moderate', rights: 'fair' },
  { rank: 14, name: 'YouTube', score: 4.3, rating: 'fair', issues: 35, dataSharing: 'broad', tracking: 'extensive', rights: 'moderate' },
  { rank: 15, name: 'WhatsApp', score: 5.9, rating: 'fair', issues: 27, dataSharing: 'moderate', tracking: 'limited', rights: 'fair' },
]

type SortKey = 'rank' | 'name' | 'score' | 'issues'
type SortDirection = 'asc' | 'desc'

export function DetailedScoresTable() {
  const [sortKey, setSortKey] = useState<SortKey>('rank')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [expandedRow, setExpandedRow] = useState<number | null>(null)

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }

  const sortedSites = [...allSites].sort((a, b) => {
    const multiplier = sortDirection === 'asc' ? 1 : -1
    
    switch (sortKey) {
      case 'rank':
        return (a.rank - b.rank) * multiplier
      case 'name':
        return a.name.localeCompare(b.name) * multiplier
      case 'score':
        return (a.score - b.score) * multiplier
      case 'issues':
        return (a.issues - b.issues) * multiplier
      default:
        return 0
    }
  })

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

  const getRatingColor = (rating: string) => {
    switch (rating) {
      case 'good':
        return 'text-success-600'
      case 'fair':
        return 'text-warning-600'
      case 'poor':
        return 'text-danger-600'
      default:
        return 'text-gray-600'
    }
  }

  return (
    <section className="py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    onClick={() => handleSort('rank')}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  >
                    <div className="flex items-center">
                      Rank
                      {sortKey === 'rank' && (
                        sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('name')}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  >
                    <div className="flex items-center">
                      Website
                      {sortKey === 'name' && (
                        sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('score')}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  >
                    <div className="flex items-center">
                      Score
                      {sortKey === 'score' && (
                        sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />
                      )}
                    </div>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rating
                  </th>
                  <th
                    onClick={() => handleSort('issues')}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  >
                    <div className="flex items-center">
                      Issues
                      {sortKey === 'issues' && (
                        sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />
                      )}
                    </div>
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedSites.map((site, index) => {
                  const Icon = getRatingIcon(site.rating)
                  return (
                    <React.Fragment key={site.rank}>
                      <motion.tr
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: index * 0.02 }}
                        className="hover:bg-gray-50"
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          #{site.rank}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{site.name}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <span className="text-lg font-semibold text-gray-900">
                              {site.score.toFixed(1)}
                            </span>
                            <span className="ml-1 text-sm text-gray-500">/10</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className={cn('flex items-center', getRatingColor(site.rating))}>
                            <Icon className="h-5 w-5 mr-1" />
                            <span className="text-sm font-medium capitalize">{site.rating}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {site.issues} issues
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => setExpandedRow(expandedRow === site.rank ? null : site.rank)}
                            className="text-primary-600 hover:text-primary-900"
                          >
                            <Info className="h-5 w-5" />
                          </button>
                        </td>
                      </motion.tr>
                      {expandedRow === site.rank && (
                        <tr>
                          <td colSpan={6} className="px-6 py-4 bg-gray-50">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div>
                                <h4 className="font-medium text-gray-900 mb-1">Data Sharing</h4>
                                <p className="text-sm text-gray-600 capitalize">{site.dataSharing}</p>
                              </div>
                              <div>
                                <h4 className="font-medium text-gray-900 mb-1">Tracking</h4>
                                <p className="text-sm text-gray-600 capitalize">{site.tracking}</p>
                              </div>
                              <div>
                                <h4 className="font-medium text-gray-900 mb-1">User Rights</h4>
                                <p className="text-sm text-gray-600 capitalize">{site.rights}</p>
                              </div>
                            </div>
                            <div className="mt-4">
                              <a
                                href={`/analysis/${site.name.toLowerCase()}`}
                                className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                              >
                                View full analysis →
                              </a>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-8 text-center text-sm text-gray-600">
          <p>
            Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
          <p className="mt-2">
            Privacy scores are based on our AI analysis of terms of service and privacy policies. 
            <a href="/methodology" className="text-primary-600 hover:text-primary-700 ml-1">
              Learn about our methodology
            </a>
          </p>
        </div>
      </div>
    </section>
  )
}