'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { Calendar, Clock, ArrowRight, Tag } from 'lucide-react'
import { formatDate } from '@/lib/utils'

// Mock blog posts data
const blogPosts = [
  {
    slug: 'understanding-privacy-policies',
    title: 'Understanding Privacy Policies: A Complete Guide',
    excerpt: 'Learn how to decode complex privacy policies and understand what companies really do with your data.',
    date: new Date('2024-01-15'),
    readTime: '8 min read',
    category: 'Privacy',
    featured: true,
  },
  {
    slug: 'hidden-fees-in-terms-of-service',
    title: 'The Hidden Fees Lurking in Terms of Service',
    excerpt: 'Discover the most common hidden fees and charges buried in legal documents and how to spot them.',
    date: new Date('2024-01-10'),
    readTime: '6 min read',
    category: 'Consumer Rights',
    featured: false,
  },
  {
    slug: 'class-action-waivers-explained',
    title: 'Class Action Waivers: What You Need to Know',
    excerpt: 'Understanding how class action waivers work and why they matter for your legal rights.',
    date: new Date('2024-01-05'),
    readTime: '10 min read',
    category: 'Legal Rights',
    featured: true,
  },
  {
    slug: 'ai-privacy-analysis-technology',
    title: 'How AI is Revolutionizing Privacy Analysis',
    excerpt: 'Explore how artificial intelligence helps consumers understand complex legal documents.',
    date: new Date('2024-01-01'),
    readTime: '7 min read',
    category: 'Technology',
    featured: false,
  },
  {
    slug: 'gdpr-ccpa-consumer-rights',
    title: 'GDPR vs CCPA: Your Data Rights Explained',
    excerpt: 'A comprehensive comparison of major privacy regulations and what they mean for you.',
    date: new Date('2023-12-28'),
    readTime: '12 min read',
    category: 'Privacy',
    featured: false,
  },
  {
    slug: 'social-media-privacy-2024',
    title: 'Social Media Privacy in 2024: What Changed?',
    excerpt: 'Analysis of the latest changes to social media privacy policies and their impact.',
    date: new Date('2023-12-20'),
    readTime: '9 min read',
    category: 'Privacy',
    featured: false,
  },
]

const categories = [
  { name: 'All', count: blogPosts.length },
  { name: 'Privacy', count: 3 },
  { name: 'Legal Rights', count: 1 },
  { name: 'Consumer Rights', count: 1 },
  { name: 'Technology', count: 1 },
]

export function BlogList() {
  const featuredPost = blogPosts.find(post => post.featured)
  const regularPosts = blogPosts.filter(post => !post.featured)

  return (
    <section className="py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Categories */}
        <div className="mb-12">
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <button
                key={category.name}
                className="px-4 py-2 rounded-full text-sm font-medium transition-all hover:bg-primary-100 hover:text-primary-700 border border-gray-300"
              >
                {category.name} ({category.count})
              </button>
            ))}
          </div>
        </div>

        {/* Featured Post */}
        {featuredPost && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16"
          >
            <Link href={`/blog/${featuredPost.slug}`}>
              <div className="bg-gradient-to-br from-primary-50 to-accent-50 rounded-2xl p-8 lg:p-12 hover:shadow-lg transition-shadow">
                <div className="flex items-center gap-4 mb-4">
                  <span className="px-3 py-1 bg-primary-100 text-primary-700 rounded-full text-sm font-medium">
                    Featured
                  </span>
                  <span className="flex items-center text-sm text-gray-600">
                    <Tag className="h-4 w-4 mr-1" />
                    {featuredPost.category}
                  </span>
                </div>
                <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
                  {featuredPost.title}
                </h2>
                <p className="text-lg text-gray-600 mb-6">
                  {featuredPost.excerpt}
                </p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <span className="flex items-center">
                      <Calendar className="h-4 w-4 mr-1" />
                      {formatDate(featuredPost.date)}
                    </span>
                    <span className="flex items-center">
                      <Clock className="h-4 w-4 mr-1" />
                      {featuredPost.readTime}
                    </span>
                  </div>
                  <span className="text-primary-600 font-medium group inline-flex items-center">
                    Read more
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </div>
              </div>
            </Link>
          </motion.div>
        )}

        {/* Regular Posts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {regularPosts.map((post, index) => (
            <motion.article
              key={post.slug}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
            >
              <Link href={`/blog/${post.slug}`}>
                <div className="p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-medium text-primary-600 bg-primary-50 px-2 py-1 rounded">
                      {post.category}
                    </span>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3 line-clamp-2">
                    {post.title}
                  </h3>
                  <p className="text-gray-600 mb-4 line-clamp-3">
                    {post.excerpt}
                  </p>
                  <div className="flex items-center justify-between text-sm text-gray-500">
                    <span className="flex items-center">
                      <Calendar className="h-4 w-4 mr-1" />
                      {formatDate(post.date)}
                    </span>
                    <span className="flex items-center">
                      <Clock className="h-4 w-4 mr-1" />
                      {post.readTime}
                    </span>
                  </div>
                </div>
              </Link>
            </motion.article>
          ))}
        </div>

        {/* Newsletter CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
          className="mt-16 bg-gray-50 rounded-2xl p-8 text-center"
        >
          <h3 className="text-2xl font-bold text-gray-900 mb-4">
            Stay Updated on Digital Privacy
          </h3>
          <p className="text-gray-600 mb-6 max-w-2xl mx-auto">
            Get weekly insights on privacy, legal updates, and tips to protect yourself online.
          </p>
          <form className="max-w-md mx-auto flex gap-4">
            <input
              type="email"
              placeholder="Enter your email"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <button
              type="submit"
              className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              Subscribe
            </button>
          </form>
        </motion.div>
      </div>
    </section>
  )
}