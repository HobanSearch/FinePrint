import React from 'react'
import { motion } from 'framer-motion'
import { 
  ShieldCheckIcon,
  SparklesIcon,
  UserGroupIcon,
  AcademicCapIcon,
  GlobeAltIcon,
  HeartIcon
} from '@heroicons/react/24/outline'

const About: React.FC = () => {
  const values = [
    {
      icon: ShieldCheckIcon,
      title: 'Privacy First',
      description: 'We process everything locally with AI models that never send your data to external servers.'
    },
    {
      icon: SparklesIcon,
      title: 'Innovation',
      description: 'Leveraging cutting-edge AI technology to make legal documents accessible to everyone.'
    },
    {
      icon: UserGroupIcon,
      title: 'User Empowerment',
      description: 'Giving individuals and businesses the tools to understand what they agree to.'
    },
    {
      icon: AcademicCapIcon,
      title: 'Education',
      description: 'Making complex legal language understandable through clear explanations and insights.'
    },
    {
      icon: GlobeAltIcon,
      title: 'Accessibility',
      description: 'Breaking down barriers to legal understanding for people worldwide.'
    },
    {
      icon: HeartIcon,
      title: 'Trust',
      description: 'Building transparent relationships with our users through honest, reliable service.'
    }
  ]

  const team = [
    {
      name: 'Sarah Chen',
      role: 'CEO & Co-Founder',
      bio: 'Former legal tech consultant with 10+ years experience in AI applications.',
      image: 'https://ui-avatars.com/api/?name=Sarah+Chen&background=6366f1&color=fff'
    },
    {
      name: 'Michael Rodriguez',
      role: 'CTO & Co-Founder',
      bio: 'AI researcher specializing in NLP and document analysis systems.',
      image: 'https://ui-avatars.com/api/?name=Michael+Rodriguez&background=6366f1&color=fff'
    },
    {
      name: 'Emma Thompson',
      role: 'Head of Legal',
      bio: 'Licensed attorney with expertise in consumer protection and digital rights.',
      image: 'https://ui-avatars.com/api/?name=Emma+Thompson&background=6366f1&color=fff'
    },
    {
      name: 'David Kim',
      role: 'Head of Engineering',
      bio: 'Full-stack engineer passionate about building accessible technology.',
      image: 'https://ui-avatars.com/api/?name=David+Kim&background=6366f1&color=fff'
    }
  ]

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative py-20 bg-gradient-to-b from-indigo-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              About Fine Print AI
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              We're on a mission to democratize legal document understanding through 
              AI technology, making it accessible, affordable, and privacy-preserving.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Mission Section */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
            >
              <h2 className="text-3xl font-bold text-gray-900 mb-6">Our Mission</h2>
              <p className="text-gray-600 mb-4">
                Every day, millions of people click "I Agree" without understanding the legal 
                documents they're accepting. Hidden clauses, complex jargon, and deliberately 
                obscure language create an unfair playing field.
              </p>
              <p className="text-gray-600 mb-4">
                Fine Print AI was founded to change this. We believe everyone deserves to 
                understand what they're agreeing to, whether it's a terms of service, 
                employment contract, or rental agreement.
              </p>
              <p className="text-gray-600">
                Using advanced AI technology, we analyze legal documents in seconds, 
                identifying problematic clauses and explaining them in plain English. 
                Our goal is simple: empower people to make informed decisions.
              </p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
              className="relative"
            >
              <div className="aspect-w-16 aspect-h-9 rounded-lg overflow-hidden shadow-xl">
                <img
                  src="https://images.unsplash.com/photo-1559136555-9303baea8ebd?ixlib=rb-4.0.3"
                  alt="Team collaboration"
                  className="w-full h-full object-cover"
                />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Our Values</h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              These core values guide everything we do at Fine Print AI.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {values.map((value, index) => (
              <motion.div
                key={value.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                viewport={{ once: true }}
                className="bg-white p-6 rounded-lg shadow-md"
              >
                <div className="flex items-center mb-4">
                  <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
                    <value.icon className="h-6 w-6 text-indigo-600" />
                  </div>
                  <h3 className="ml-4 text-xl font-semibold text-gray-900">{value.title}</h3>
                </div>
                <p className="text-gray-600">{value.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Team Section */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Meet Our Team</h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Passionate experts working to make legal documents understandable for everyone.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {team.map((member, index) => (
              <motion.div
                key={member.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                viewport={{ once: true }}
                className="text-center"
              >
                <img
                  src={member.image}
                  alt={member.name}
                  className="w-32 h-32 rounded-full mx-auto mb-4"
                />
                <h3 className="text-lg font-semibold text-gray-900">{member.name}</h3>
                <p className="text-sm text-indigo-600 mb-2">{member.role}</p>
                <p className="text-sm text-gray-600">{member.bio}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-indigo-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl font-bold text-white mb-4">
              Ready to Take Control?
            </h2>
            <p className="text-xl text-indigo-100 mb-8 max-w-2xl mx-auto">
              Join thousands of users who are already protecting themselves with Fine Print AI.
            </p>
            <a
              href="/auth/signup"
              className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-indigo-600 bg-white hover:bg-indigo-50 transition-colors"
            >
              Get Started Free
            </a>
          </motion.div>
        </div>
      </section>
    </div>
  )
}

export default About