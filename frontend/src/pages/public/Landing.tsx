import React from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { 
  Shield, 
  FileSearch, 
  Zap, 
  Users, 
  CheckCircle, 
  ArrowRight,
  Star,
  AlertTriangle
} from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Card, CardContent } from '../../components/ui/Card'
import { DualLeaderboard } from '../../components/leaderboard/DualLeaderboard'

const features = [
  {
    icon: Shield,
    title: 'AI-Powered Analysis',
    description: 'Advanced AI algorithms analyze complex legal documents to identify potential risks and unfavorable terms.'
  },
  {
    icon: FileSearch,
    title: 'Comprehensive Scanning',
    description: 'Scan terms of service, privacy policies, contracts, and other legal documents for hidden clauses.'
  },
  {
    icon: Zap,
    title: 'Instant Results',
    description: 'Get detailed analysis results in minutes, not hours. Save time and make informed decisions quickly.'
  },
  {
    icon: Users,
    title: 'Expert Insights',
    description: 'Benefit from legal expertise built into our AI models, trained on thousands of legal documents.'
  }
]

const testimonials = [
  {
    name: 'Sarah Chen',
    role: 'Small Business Owner',
    content: 'Fine Print AI saved me from signing a contract with hidden penalties. Worth every penny!',
    rating: 5
  },
  {
    name: 'Michael Rodriguez',
    role: 'Freelance Designer',
    content: 'I never understood legal jargon before. This tool makes everything crystal clear.',
    rating: 5
  },
  {
    name: 'Emma Thompson',
    role: 'Startup Founder',
    content: 'Essential tool for any business. Helps us avoid costly legal mistakes.',
    rating: 5
  }
]

export default function Landing() {
  const handleAnalyzeWebsite = (domain: string) => {
    // Navigate to analysis page with the domain
    // For now, we'll just log it - can be expanded later
    console.log('Analyze website:', domain)
    // Example: navigate('/analyze?url=' + encodeURIComponent('https://' + domain))
  }

  return (
    <div className="space-y-0">
      {/* Hero Section */}
      <section className="relative pt-20 pb-16 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
            >
              <h1 className="text-4xl md:text-6xl font-bold text-foreground mb-6">
                Don't Get Trapped by
                <span className="text-guardian block">Fine Print</span>
              </h1>
              <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
                AI-powered analysis of terms of service, privacy policies, and legal documents. 
                Understand what you're agreeing to before you sign.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="flex flex-col sm:flex-row gap-4 justify-center"
            >
              <Button size="lg" asChild>
                <Link to="/auth/signup">
                  Get Started Free
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button variant="outline" size="lg" asChild>
                <Link to="/about">Learn More</Link>
              </Button>
            </motion.div>

            {/* Trust indicators */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="mt-12 flex items-center justify-center space-x-8 text-sm text-muted-foreground"
            >
              <div className="flex items-center space-x-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span>No Credit Card Required</span>
              </div>
              <div className="flex items-center space-x-2">
                <Shield className="h-4 w-4 text-blue-500" />
                <span>Enterprise-Grade Security</span>
              </div>
              <div className="flex items-center space-x-2">
                <Star className="h-4 w-4 text-yellow-500" />
                <span>Trusted by 10,000+ Users</span>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Background decoration */}
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-gradient-to-br from-guardian/5 to-sage/5 rounded-full blur-3xl" />
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
            >
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
                Powerful Features
              </h2>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                Everything you need to understand and protect yourself from unfavorable legal terms.
              </p>
            </motion.div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                viewport={{ once: true }}
              >
                <Card className="h-full hover:shadow-lg transition-shadow duration-300">
                  <CardContent className="p-6 text-center">
                    <div className="inline-flex items-center justify-center w-12 h-12 bg-guardian/10 rounded-lg mb-4">
                      <feature.icon className="h-6 w-6 text-guardian" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">
                      {feature.title}
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      {feature.description}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-16 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
            >
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
                How It Works
              </h2>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                Simple, fast, and reliable document analysis in three easy steps.
              </p>
            </motion.div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: '1',
                title: 'Upload Document',
                description: 'Upload your document, paste text, or provide a URL to the terms you want analyzed.',
                icon: FileSearch
              },
              {
                step: '2',
                title: 'AI Analysis',
                description: 'Our AI analyzes the document for potential risks, unfavorable terms, and hidden clauses.',
                icon: Zap
              },
              {
                step: '3',
                title: 'Get Results',
                description: 'Receive detailed insights, risk assessments, and actionable recommendations.',
                icon: CheckCircle
              }
            ].map((item, index) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.2 }}
                viewport={{ once: true }}
                className="text-center"
              >
                <div className="inline-flex items-center justify-center w-16 h-16 bg-guardian text-white rounded-full text-2xl font-bold mb-4">
                  {item.step}
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">
                  {item.title}
                </h3>
                <p className="text-muted-foreground">
                  {item.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Live Risk Analysis Leaderboard */}
      <DualLeaderboard
        popularLimit={10}
        worstLimit={10}
        onAnalyze={handleAnalyzeWebsite}
      />

      {/* Testimonials Section */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
            >
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
                What Our Users Say
              </h2>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                Join thousands of satisfied users who protect themselves with Fine Print AI.
              </p>
            </motion.div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <motion.div
                key={testimonial.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                viewport={{ once: true }}
              >
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center mb-4">
                      {[...Array(testimonial.rating)].map((_, i) => (
                        <Star key={i} className="h-4 w-4 text-yellow-400 fill-current" />
                      ))}
                    </div>
                    <p className="text-muted-foreground mb-4 italic">
                      "{testimonial.content}"
                    </p>
                    <div>
                      <p className="font-semibold text-foreground">
                        {testimonial.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {testimonial.role}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-gradient-to-r from-guardian to-sage">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-white"
          >
            <AlertTriangle className="h-16 w-16 mx-auto mb-6 text-white/90" />
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Don't Sign Blindly
            </h2>
            <p className="text-xl mb-8 text-white/90 max-w-2xl mx-auto">
              Every day, people agree to terms they don't understand. 
              Protect yourself with AI-powered legal analysis.
            </p>
            <Button 
              size="lg" 
              variant="secondary"
              asChild
              className="bg-white text-guardian hover:bg-white/90"
            >
              <Link to="/auth/signup">
                Start Protecting Yourself Today
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </motion.div>
        </div>
      </section>
    </div>
  )
}