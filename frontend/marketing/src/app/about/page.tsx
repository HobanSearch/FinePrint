import { Metadata } from 'next'
import { motion } from 'framer-motion'
import { Shield, Users, Target, Heart } from 'lucide-react'

export const metadata: Metadata = {
  title: 'About Us | Fine Print AI',
  description: 'Learn about Fine Print AI\'s mission to protect digital rights through AI-powered legal document analysis.',
}

const values = [
  {
    icon: Shield,
    title: 'Privacy First',
    description: 'We believe privacy is a fundamental right. All document processing happens locally on your device.',
  },
  {
    icon: Users,
    title: 'User Empowerment',
    description: 'We empower users to understand complex legal documents and make informed decisions.',
  },
  {
    icon: Target,
    title: 'Transparency',
    description: 'We\'re committed to transparent practices in our own operations and helping expose hidden terms.',
  },
  {
    icon: Heart,
    title: 'Accessibility',
    description: 'Legal understanding should be accessible to everyone, regardless of their background.',
  },
]

const team = [
  {
    name: 'Alex Johnson',
    role: 'CEO & Co-founder',
    bio: 'Former privacy lawyer with a passion for making legal documents accessible.',
  },
  {
    name: 'Sarah Lee',
    role: 'CTO & Co-founder',
    bio: 'AI researcher focused on natural language processing and privacy-preserving ML.',
  },
  {
    name: 'Michael Chen',
    role: 'Head of Product',
    bio: 'Product designer dedicated to creating intuitive experiences for complex problems.',
  },
  {
    name: 'Emily Rodriguez',
    role: 'Head of Legal',
    bio: 'Consumer rights advocate with expertise in digital privacy law.',
  },
]

export default function AboutPage() {
  return (
    <main className="pt-16">
      {/* Hero Section */}
      <section className="py-20 bg-gradient-to-br from-primary-50 to-accent-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-4xl sm:text-5xl font-bold text-gray-900">
              Our Mission
            </h1>
            <p className="mt-6 text-xl text-gray-600 max-w-3xl mx-auto">
              We're building a world where everyone can understand and protect their digital rights, 
              one document at a time.
            </p>
          </div>
        </div>
      </section>

      {/* Story Section */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Our Story</h2>
            <div className="prose prose-lg text-gray-600">
              <p>
                Fine Print AI was born from a simple observation: most people click "I Agree" 
                without reading the terms they're accepting. In an increasingly digital world, 
                this means unknowingly giving away rights and privacy.
              </p>
              <p>
                Our founders, a privacy lawyer and an AI researcher, saw an opportunity to use 
                technology to solve this problem. By combining advanced language models with 
                legal expertise, we created a tool that can analyze complex documents in seconds 
                and explain them in plain English.
              </p>
              <p>
                What sets us apart is our commitment to privacy. While others send your documents 
                to the cloud, we process everything locally on your device. Your sensitive 
                information never leaves your control.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="py-20 bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900">Our Values</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {values.map((value) => {
              const Icon = value.icon
              return (
                <div key={value.title} className="text-center">
                  <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Icon className="h-8 w-8 text-primary-600" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">{value.title}</h3>
                  <p className="text-gray-600">{value.description}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Team Section */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900">Meet Our Team</h2>
            <p className="mt-4 text-xl text-gray-600">
              Passionate about protecting your digital rights
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {team.map((member) => (
              <div key={member.name} className="text-center">
                <div className="w-32 h-32 bg-gradient-to-br from-primary-400 to-accent-400 rounded-full mx-auto mb-4 flex items-center justify-center text-white text-3xl font-bold">
                  {member.name.split(' ').map(n => n[0]).join('')}
                </div>
                <h3 className="text-xl font-semibold text-gray-900">{member.name}</h3>
                <p className="text-primary-600 mb-2">{member.role}</p>
                <p className="text-gray-600 text-sm">{member.bio}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}