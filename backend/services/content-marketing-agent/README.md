# Content Marketing Agent

An autonomous content marketing system for Fine Print AI that handles content creation, distribution, analytics, and lead generation with AI-powered optimization.

## Features

### 🤖 AI-Powered Content Creation
- Multi-format content generation (blog posts, social media, emails, whitepapers)
- Legal industry expertise and Fine Print AI brand voice
- SEO optimization and keyword research
- Content variations for different platforms
- Automated A/B testing of content variations

### 📱 Multi-Channel Distribution
- Automated publishing to LinkedIn, Twitter, Facebook, Medium
- Email campaign management (SendGrid, Mailchimp)
- Content scheduling and recurring posts
- Platform-specific content adaptation
- Cross-platform content syndication

### 📊 Performance Analytics
- Real-time content performance tracking
- ROI analysis and campaign optimization
- Audience engagement insights
- Competitor analysis and benchmarking
- Predictive performance modeling

### 🎯 Campaign Management
- Autonomous campaign generation
- Multi-goal campaign optimization (awareness, leads, conversions)
- Budget allocation and performance monitoring
- Content calendar management
- Campaign A/B testing and optimization

### 💼 Lead Generation
- AI-powered lead magnet creation
- Landing page personalization
- Email nurturing sequences
- Lead scoring and qualification
- Hot lead identification

### 🔍 SEO Optimization
- Automated keyword research
- Content optimization for search engines
- Competitor keyword analysis
- SEO performance tracking
- Featured snippet optimization

## Architecture

The Content Marketing Agent is built as a microservice following the existing Fine Print AI architecture:

```
content-marketing-agent/
├── src/
│   ├── config/           # Configuration management
│   ├── routes/           # API endpoints
│   ├── services/         # Core business logic
│   ├── types/           # TypeScript type definitions
│   ├── utils/           # Utility functions
│   └── workers/         # Background job processing
├── __tests__/           # Test suites
└── docs/               # API documentation
```

### Core Services

1. **Content Creation Engine** - AI-powered content generation
2. **Brand Voice Manager** - Consistent brand voice enforcement
3. **SEO Optimizer** - Search engine optimization
4. **Distribution Engine** - Multi-platform publishing
5. **Analytics Engine** - Performance tracking and insights
6. **Campaign Manager** - Campaign automation and optimization
7. **Lead Generation Engine** - Lead capture and nurturing

## API Endpoints

### Content Management
- `POST /api/v1/content/create` - Create new content
- `GET /api/v1/content/:id` - Retrieve content
- `PUT /api/v1/content/:id` - Update content
- `POST /api/v1/content/:id/validate` - Validate brand voice
- `POST /api/v1/content/:id/variations` - Generate variations

### Campaign Management
- `POST /api/v1/campaigns` - Create campaign
- `POST /api/v1/campaigns/autonomous` - Generate autonomous campaign
- `POST /api/v1/campaigns/:id/optimize` - Optimize campaign
- `GET /api/v1/campaigns/:id/performance` - Get performance metrics

### Analytics
- `GET /api/v1/analytics/content/:id/performance` - Content performance
- `GET /api/v1/analytics/campaigns/:id/roi` - ROI analysis
- `GET /api/v1/analytics/audience/engagement` - Audience insights
- `GET /api/v1/analytics/dashboard` - Dashboard data

### Lead Generation
- `POST /api/v1/leads/generate` - Generate leads from content
- `POST /api/v1/leads/magnets` - Create lead magnet
- `POST /api/v1/leads/nurturing` - Setup nurturing campaign
- `POST /api/v1/leads/hot-leads` - Identify hot leads

### SEO Optimization
- `POST /api/v1/seo/optimize` - Optimize content for SEO
- `POST /api/v1/seo/analyze` - Analyze SEO performance
- `POST /api/v1/seo/keywords/research` - Research keywords
- `POST /api/v1/seo/titles/generate` - Generate SEO titles

### Content Distribution
- `POST /api/v1/distribution/publish` - Publish content
- `POST /api/v1/distribution/schedule` - Schedule content
- `GET /api/v1/distribution/status/:id` - Publishing status
- `GET /api/v1/distribution/platforms` - Platform capabilities

## Configuration

### Environment Variables

```bash
# Core Configuration
NODE_ENV=development
PORT=3000
HOST=0.0.0.0

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/fineprintai
REDIS_URL=redis://localhost:6379

# AI Services
OPENAI_API_KEY=your_openai_key
OPENAI_MODEL=gpt-4-turbo-preview
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama2:13b

# Social Media APIs
LINKEDIN_CLIENT_ID=your_linkedin_client_id
LINKEDIN_CLIENT_SECRET=your_linkedin_client_secret
TWITTER_API_KEY=your_twitter_api_key
TWITTER_API_SECRET=your_twitter_api_secret
FACEBOOK_APP_ID=your_facebook_app_id
FACEBOOK_APP_SECRET=your_facebook_app_secret

# Email Services
SENDGRID_API_KEY=your_sendgrid_key
MAILCHIMP_API_KEY=your_mailchimp_key

# SEO Tools
AHREFS_API_KEY=your_ahrefs_key
SEMRUSH_API_KEY=your_semrush_key

# Analytics
GA_PROPERTY_ID=your_ga_property_id
GA_CREDENTIALS_PATH=path/to/ga_credentials.json
```

## Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd backend/services/content-marketing-agent
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Build the application**
```bash
npm run build
```

5. **Start the service**
```bash
# Development
npm run dev

# Production
npm start
```

## Usage Examples

### Create Content
```javascript
const response = await fetch('/api/v1/content/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'blog_post',
    topic: 'Privacy Policy Red Flags',
    targetAudience: 'Privacy-conscious individuals',
    keywords: ['privacy policy', 'data protection', 'user rights'],
    seoOptimized: true,
    includeCallToAction: true
  })
});

const content = await response.json();
```

### Generate Autonomous Campaign
```javascript
const campaign = await fetch('/api/v1/campaigns/autonomous', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    topic: 'GDPR Compliance',
    targetAudience: 'Small business owners',
    goals: { leads: 100, awareness: 50000 },
    platforms: ['linkedin', 'twitter', 'email'],
    duration: 30
  })
});
```

### Publish Content
```javascript
const publishResult = await fetch('/api/v1/distribution/publish', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    contentId: 'content_123',
    platforms: ['linkedin', 'twitter'],
    immediate: true
  })
});
```

## Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Run integration tests
npm run test:integration
```

## Development

### Code Style
- TypeScript strict mode
- ESLint configuration
- Prettier formatting
- Husky pre-commit hooks

### Project Structure
```
src/
├── config/                 # Configuration
├── routes/                 # API routes
│   ├── content.ts         # Content management
│   ├── campaigns.ts       # Campaign management
│   ├── analytics.ts       # Analytics endpoints
│   ├── leads.ts          # Lead generation
│   ├── seo.ts            # SEO optimization
│   └── distribution.ts    # Content distribution
├── services/              # Business logic
│   ├── content-creation-engine.ts
│   ├── brand-voice-manager.ts
│   ├── seo-optimizer.ts
│   ├── distribution-engine.ts
│   ├── analytics-engine.ts
│   ├── campaign-manager.ts
│   └── lead-generation-engine.ts
├── types/                 # TypeScript types
├── utils/                 # Utilities
└── workers/              # Background jobs
```

## Monitoring

The service includes comprehensive monitoring:

- **Health Checks**: `/health`, `/health/detailed`, `/health/ready`
- **Metrics**: Prometheus-compatible metrics
- **Logging**: Structured JSON logging
- **Tracing**: Distributed tracing support
- **Alerts**: Performance and error alerting

## Security

- Rate limiting on all endpoints
- CORS configuration
- Helmet security headers
- Input validation with Zod
- JWT authentication (when configured)
- API key protection for external services

## Performance

- Async/await throughout
- Connection pooling for databases
- Redis caching for frequently accessed data
- Background job processing
- Auto-scaling support in Kubernetes

## Deployment

### Docker
```bash
docker build -t content-marketing-agent .
docker run -p 3000:3000 content-marketing-agent
```

### Kubernetes
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: content-marketing-agent
spec:
  replicas: 3
  selector:
    matchLabels:
      app: content-marketing-agent
  template:
    metadata:
      labels:
        app: content-marketing-agent
    spec:
      containers:
      - name: content-marketing-agent
        image: content-marketing-agent:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
```

## Contributing

1. Follow the existing code style
2. Add tests for new features
3. Update documentation
4. Ensure all tests pass
5. Follow the brand voice guidelines

## License

MIT License - see LICENSE file for details.

## Support

For support and questions:
- Create an issue in the repository
- Contact the Fine Print AI development team
- Check the API documentation at `/docs`

---

**Fine Print AI Content Marketing Agent** - Democratizing legal comprehension through autonomous content marketing.