import { Metadata } from 'next'
import { BlogList } from '@/components/sections/BlogList'

export const metadata: Metadata = {
  title: 'Blog | Fine Print AI',
  description: 'Insights on digital privacy, legal documents, and protecting your rights online.',
}

export default function BlogPage() {
  return (
    <main className="pt-16">
      <section className="py-20 bg-gradient-to-br from-primary-50 to-accent-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-4xl sm:text-5xl font-bold text-gray-900">
              Fine Print AI Blog
            </h1>
            <p className="mt-6 text-xl text-gray-600 max-w-3xl mx-auto">
              Insights on digital privacy, legal documents, and protecting your rights online
            </p>
          </div>
        </div>
      </section>
      
      <BlogList />
    </main>
  )
}