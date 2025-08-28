import Link from 'next/link'
import { Mail, Twitter, Linkedin, Github } from 'lucide-react'
import { NewsletterForm } from '@/components/NewsletterForm'

const footerLinks = {
  product: [
    { name: 'Features', href: '/#features' },
    { name: 'Privacy Scores', href: '/privacy-scores' },
    { name: 'Pricing', href: '/pricing' },
    { name: 'Demo', href: '/demo' },
  ],
  company: [
    { name: 'About', href: '/about' },
    { name: 'Blog', href: '/blog' },
    { name: 'Careers', href: '/careers' },
    { name: 'Press', href: '/press' },
  ],
  resources: [
    { name: 'Documentation', href: '/docs' },
    { name: 'API Reference', href: '/api' },
    { name: 'Support', href: '/support' },
    { name: 'Status', href: 'https://status.fineprint.ai' },
  ],
  legal: [
    { name: 'Privacy Policy', href: '/legal/privacy' },
    { name: 'Terms of Service', href: '/legal/terms' },
    { name: 'Cookie Policy', href: '/legal/cookies' },
    { name: 'Security', href: '/security' },
  ],
}

const socialLinks = [
  { name: 'Twitter', href: 'https://twitter.com/fineprintai', icon: Twitter },
  { name: 'LinkedIn', href: 'https://linkedin.com/company/fineprintai', icon: Linkedin },
  { name: 'GitHub', href: 'https://github.com/fineprintai', icon: Github },
  { name: 'Email', href: 'mailto:hello@fineprint.ai', icon: Mail },
]

export function Footer() {
  return (
    <footer className="bg-gray-50 border-t border-gray-200">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Newsletter Section */}
        <div className="py-12 lg:py-16">
          <div className="mx-auto max-w-2xl text-center">
            <h3 className="text-2xl font-bold text-gray-900">
              Stay informed about your digital rights
            </h3>
            <p className="mt-3 text-gray-600">
              Get weekly insights on privacy, legal updates, and tips to protect yourself online.
            </p>
            <div className="mt-6">
              <NewsletterForm />
            </div>
          </div>
        </div>

        {/* Links Section */}
        <div className="border-t border-gray-200 py-12">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            <div>
              <h4 className="text-sm font-semibold text-gray-900">Product</h4>
              <ul className="mt-4 space-y-3">
                {footerLinks.product.map((link) => (
                  <li key={link.name}>
                    <Link
                      href={link.href}
                      className="text-sm text-gray-600 hover:text-primary-600 transition-colors"
                    >
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-900">Company</h4>
              <ul className="mt-4 space-y-3">
                {footerLinks.company.map((link) => (
                  <li key={link.name}>
                    <Link
                      href={link.href}
                      className="text-sm text-gray-600 hover:text-primary-600 transition-colors"
                    >
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-900">Resources</h4>
              <ul className="mt-4 space-y-3">
                {footerLinks.resources.map((link) => (
                  <li key={link.name}>
                    <Link
                      href={link.href}
                      className="text-sm text-gray-600 hover:text-primary-600 transition-colors"
                    >
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-900">Legal</h4>
              <ul className="mt-4 space-y-3">
                {footerLinks.legal.map((link) => (
                  <li key={link.name}>
                    <Link
                      href={link.href}
                      className="text-sm text-gray-600 hover:text-primary-600 transition-colors"
                    >
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="border-t border-gray-200 py-8">
          <div className="flex flex-col items-center justify-between space-y-4 md:flex-row md:space-y-0">
            <div className="flex items-center space-x-2">
              <div className="relative w-8 h-8">
                <div className="absolute inset-0 bg-gradient-to-br from-primary-500 to-accent-500 rounded-lg" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-white font-bold text-sm">FP</span>
                </div>
              </div>
              <span className="text-sm text-gray-600">
                © {new Date().getFullYear()} Fine Print AI. All rights reserved.
              </span>
            </div>
            <div className="flex space-x-6">
              {socialLinks.map((link) => {
                const Icon = link.icon
                return (
                  <a
                    key={link.name}
                    href={link.href}
                    className="text-gray-400 hover:text-primary-600 transition-colors"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span className="sr-only">{link.name}</span>
                    <Icon className="h-5 w-5" />
                  </a>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}