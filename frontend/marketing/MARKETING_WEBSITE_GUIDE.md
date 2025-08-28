# Fine Print AI Marketing Website

A high-performance marketing website built with Next.js 14, TypeScript, and Tailwind CSS, featuring server-side rendering for optimal SEO and Core Web Vitals performance.

## Architecture Overview

### Technology Stack
- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript 5.0
- **Styling**: Tailwind CSS 3.4
- **Animations**: Framer Motion 11
- **UI Components**: Radix UI primitives
- **Forms**: React Hook Form + Zod validation
- **Icons**: Lucide React

### Project Structure
```
marketing/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── layout.tsx         # Root layout with metadata
│   │   ├── page.tsx           # Home page
│   │   ├── about/             # About page
│   │   ├── pricing/           # Pricing page
│   │   ├── privacy-scores/    # Privacy scores page
│   │   ├── demo/              # Interactive demo
│   │   └── blog/              # Blog section
│   ├── components/
│   │   ├── layout/            # Layout components (Navbar, Footer)
│   │   ├── sections/          # Page sections
│   │   └── ui/                # Reusable UI components
│   ├── lib/                   # Utility functions
│   ├── hooks/                 # Custom React hooks
│   └── styles/                # Global styles
├── public/                    # Static assets
├── next.config.mjs           # Next.js configuration
└── tailwind.config.ts        # Tailwind configuration
```

## Key Features

### 1. SEO Optimization
- Server-side rendering for all pages
- Dynamic meta tags and OpenGraph data
- Structured data (JSON-LD) for organization
- Automatic sitemap generation
- Robots.txt configuration
- Canonical URLs

### 2. Performance Optimization
- Lighthouse score target: >95
- First Contentful Paint: <1.5s
- Time to Interactive: <3s
- Image optimization with Next.js Image
- Font optimization with Next Font
- Code splitting by route
- Lazy loading for below-fold content

### 3. Landing Page Sections
- **Hero**: Animated hero with CTAs and trust indicators
- **Privacy Scores**: Top 50 sites privacy analysis showcase
- **How It Works**: 3-step process visualization
- **Features**: Comprehensive feature grid
- **Demo**: Interactive analysis demonstration
- **Pricing**: Tiered pricing with comparison
- **Testimonials**: Social proof section
- **CTA**: Final conversion section

### 4. Additional Pages
- **/about**: Company mission, values, and team
- **/privacy-scores**: Detailed analysis table with sorting
- **/pricing**: Extended pricing information with FAQ
- **/demo**: Live demo interface with sample documents
- **/blog**: SEO-optimized blog with categories

## Development Guide

### Setup
```bash
cd frontend/marketing
npm install
npm run dev
```

### Environment Variables
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

Key variables:
- `NEXT_PUBLIC_APP_URL`: Production URL
- `NEXT_PUBLIC_GTM_ID`: Google Tag Manager ID
- `NEXT_PUBLIC_API_URL`: Backend API URL

### Build & Deploy
```bash
# Production build
npm run build

# Start production server
npm run start

# Type checking
npm run type-check

# Linting
npm run lint
```

## Component Architecture

### Design System Integration
All components follow the Model-inspired design system with:
- Consistent color palette (primary, accent, semantic colors)
- Typography scale using Inter and Cabinet Grotesk
- Spacing system based on Tailwind defaults
- Animation patterns using Framer Motion

### Key Components

#### Button Component
```tsx
<Button variant="gradient" size="lg">
  Get Started
</Button>
```
Variants: default, destructive, outline, secondary, ghost, link, gradient

#### Newsletter Form
Self-contained component with validation and submission handling:
```tsx
<NewsletterForm />
```

#### Section Components
All major sections are modular and can be reused:
```tsx
<HeroSection />
<PrivacyScoresSection />
<PricingSection />
```

## Performance Optimizations

### 1. Image Optimization
- Use Next.js Image component for automatic optimization
- Serve images in modern formats (WebP, AVIF)
- Implement responsive images with srcset

### 2. Font Loading
```tsx
const inter = Inter({ 
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap', // Prevents FOIT
})
```

### 3. Code Splitting
- Route-based splitting automatic with App Router
- Dynamic imports for heavy components:
```tsx
const DemoInterface = dynamic(() => import('./DemoInterface'))
```

### 4. Caching Headers
Configured in `next.config.mjs`:
- Static assets: max-age=31536000
- HTML pages: s-maxage=60, stale-while-revalidate

## SEO Implementation

### 1. Metadata API
Each page exports metadata:
```tsx
export const metadata: Metadata = {
  title: 'Page Title | Fine Print AI',
  description: 'Page description',
}
```

### 2. Structured Data
Organization schema in JsonLd component:
```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Fine Print AI",
  ...
}
```

### 3. Social Media
OpenGraph and Twitter cards configured in root layout

## Analytics & Tracking

### Google Tag Manager
Integrated via Analytics component:
- Page view tracking
- Custom events for conversions
- E-commerce tracking for pricing

### Performance Monitoring
- Core Web Vitals tracking
- Real user monitoring (RUM)
- Error tracking integration ready

## Testing Strategy

### Unit Tests
```bash
npm run test
```
- Component testing with Vitest
- React Testing Library for interactions
- Mock API responses

### E2E Tests
```bash
npm run test:e2e
```
- Playwright for cross-browser testing
- Critical user journeys
- Visual regression tests

## Deployment

### Vercel (Recommended)
1. Connect GitHub repository
2. Set environment variables
3. Deploy with automatic previews

### Self-Hosted
1. Build: `npm run build`
2. Use `npm run start` or deploy `.next` folder
3. Configure reverse proxy (NGINX)

## Maintenance

### Content Updates
- Blog posts: Add to `blogPosts` array in BlogList.tsx
- Privacy scores: Update data in PrivacyScoresSection.tsx
- Testimonials: Edit TestimonialsSection.tsx

### Performance Monitoring
- Regular Lighthouse audits
- Monitor Core Web Vitals in production
- A/B test conversion elements

### Security Headers
Configured in next.config.mjs:
- Strict-Transport-Security
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Referrer-Policy

## Future Enhancements

1. **Internationalization**: Add multi-language support
2. **A/B Testing**: Implement feature flags for testing
3. **Progressive Web App**: Add offline support
4. **Advanced Analytics**: Heatmaps and session recording
5. **CMS Integration**: Headless CMS for blog content

## Support

For questions or issues:
- Check Next.js documentation
- Review component examples in Storybook
- Contact the development team