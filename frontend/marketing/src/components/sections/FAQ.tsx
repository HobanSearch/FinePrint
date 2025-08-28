'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const faqs = [
  {
    question: 'How does Fine Print AI protect my privacy?',
    answer: 'All document analysis happens locally on your device using advanced AI models. Your documents never leave your device and we never store or have access to any of your data. This is core to our privacy-first approach.',
  },
  {
    question: 'What types of documents can I analyze?',
    answer: 'Fine Print AI can analyze Terms of Service, Privacy Policies, End User License Agreements (EULAs), and other legal documents. You can paste text, provide a URL, or upload PDF files.',
  },
  {
    question: 'How accurate is the analysis?',
    answer: 'Our AI models achieve 98% accuracy in detecting problematic clauses and patterns. We continuously improve our models based on legal expert feedback and new pattern discoveries.',
  },
  {
    question: 'Can I use Fine Print AI for business contracts?',
    answer: 'While Fine Print AI excels at consumer-facing legal documents, it can provide insights on business contracts. However, we always recommend consulting with a legal professional for important business agreements.',
  },
  {
    question: 'Is there a limit to document size?',
    answer: 'Free users can analyze documents up to 50,000 characters. Pro and Business users have no document size limits. Most terms of service and privacy policies fall well within the free tier limit.',
  },
  {
    question: 'Can I cancel my subscription anytime?',
    answer: 'Yes! You can cancel your subscription at any time from your account settings. You\'ll continue to have access until the end of your billing period, and you can always downgrade to the free tier.',
  },
  {
    question: 'Do you offer team or enterprise plans?',
    answer: 'Yes! Our Business plan includes up to 10 team members, and we offer custom Enterprise solutions for larger organizations with specific needs like on-premise deployment and custom AI training.',
  },
  {
    question: 'How do I get support?',
    answer: 'Free users get email support, Pro users get priority email support, and Business users get priority phone support. Enterprise customers receive 24/7 dedicated support.',
  },
]

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <section className="py-20 bg-white">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl font-bold text-gray-900">
            Frequently Asked Questions
          </h2>
          <p className="mt-4 text-xl text-gray-600">
            Everything you need to know about Fine Print AI
          </p>
        </motion.div>

        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.05 }}
              className="border border-gray-200 rounded-lg overflow-hidden"
            >
              <button
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <span className="text-lg font-medium text-gray-900">
                  {faq.question}
                </span>
                <ChevronDown
                  className={cn(
                    'h-5 w-5 text-gray-500 transition-transform',
                    openIndex === index && 'rotate-180'
                  )}
                />
              </button>
              {openIndex === index && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="px-6 pb-4"
                >
                  <p className="text-gray-600">{faq.answer}</p>
                </motion.div>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}