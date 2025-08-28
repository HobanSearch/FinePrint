'use client'

import { motion } from 'framer-motion'
import { Star, Quote } from 'lucide-react'

const testimonials = [
  {
    name: 'Sarah Chen',
    role: 'Privacy Advocate',
    company: 'Digital Rights Foundation',
    content: 'Fine Print AI has revolutionized how we educate people about digital privacy. The instant analysis helps users understand complex legal documents in seconds.',
    rating: 5,
    image: '/testimonials/sarah.jpg',
  },
  {
    name: 'Michael Rodriguez',
    role: 'Software Developer',
    company: 'TechStart Inc.',
    content: 'As a developer, I appreciate the local processing approach. It\'s fast, secure, and the API integration was seamless. This is how privacy-first tools should be built.',
    rating: 5,
    image: '/testimonials/michael.jpg',
  },
  {
    name: 'Emily Thompson',
    role: 'Legal Consultant',
    company: 'Thompson Law',
    content: 'I recommend Fine Print AI to all my clients. It catches things even experienced lawyers might miss, and the plain English explanations are invaluable.',
    rating: 5,
    image: '/testimonials/emily.jpg',
  },
  {
    name: 'David Park',
    role: 'Product Manager',
    company: 'Startup Ventures',
    content: 'We use Fine Print AI to review all our vendor agreements. It\'s saved us from several problematic contracts and helped negotiate better terms.',
    rating: 5,
    image: '/testimonials/david.jpg',
  },
  {
    name: 'Lisa Wang',
    role: 'Consumer Rights Activist',
    company: 'Consumer Watch',
    content: 'This tool empowers consumers to understand what they\'re agreeing to. The risk scoring and pattern detection are game-changers for digital rights.',
    rating: 5,
    image: '/testimonials/lisa.jpg',
  },
  {
    name: 'James Miller',
    role: 'IT Director',
    company: 'SecureNet Solutions',
    content: 'The enterprise features and on-premise deployment option made Fine Print AI the perfect choice for our security-conscious organization.',
    rating: 5,
    image: '/testimonials/james.jpg',
  },
]

export function TestimonialsSection() {
  return (
    <section className="py-20 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
            Trusted by Privacy-Conscious Users
          </h2>
          <p className="mt-4 text-xl text-gray-600 max-w-3xl mx-auto">
            See what our users are saying about Fine Print AI
          </p>
        </motion.div>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={testimonial.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="bg-gray-50 rounded-2xl p-8 relative"
            >
              {/* Quote icon */}
              <Quote className="absolute top-6 right-6 h-8 w-8 text-gray-200" />

              {/* Rating */}
              <div className="flex space-x-1 mb-4">
                {[...Array(testimonial.rating)].map((_, i) => (
                  <Star key={i} className="h-5 w-5 fill-warning-400 text-warning-400" />
                ))}
              </div>

              {/* Content */}
              <p className="text-gray-700 leading-relaxed mb-6">
                "{testimonial.content}"
              </p>

              {/* Author */}
              <div className="flex items-center">
                <div className="w-12 h-12 bg-gradient-to-br from-primary-400 to-accent-400 rounded-full flex items-center justify-center text-white font-semibold">
                  {testimonial.name.split(' ').map(n => n[0]).join('')}
                </div>
                <div className="ml-4">
                  <div className="font-semibold text-gray-900">{testimonial.name}</div>
                  <div className="text-sm text-gray-600">
                    {testimonial.role} at {testimonial.company}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-16 bg-gradient-to-br from-primary-50 to-accent-50 rounded-2xl p-8 lg:p-12"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-4xl font-bold text-gray-900">50K+</div>
              <div className="mt-2 text-gray-600">Active Users</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-gray-900">1M+</div>
              <div className="mt-2 text-gray-600">Documents Analyzed</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-gray-900">4.9/5</div>
              <div className="mt-2 text-gray-600">Average Rating</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-gray-900">98%</div>
              <div className="mt-2 text-gray-600">Accuracy Rate</div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}