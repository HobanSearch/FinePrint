# Fine Print AI - Frontend Application

A scalable, performant React application for AI-powered legal document analysis built with modern web technologies and best practices.

## 🏗️ Architecture Overview

This application follows a modern, scalable architecture with:

- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite for fast development and optimized builds
- **State Management**: Zustand with persistence and middleware
- **Server State**: TanStack Query for caching and synchronization
- **Routing**: React Router with protected routes and code splitting
- **Styling**: Tailwind CSS with custom design system
- **Real-time**: Socket.IO for WebSocket connections
- **Testing**: Vitest + React Testing Library + MSW
- **Documentation**: Storybook with accessibility testing
- **Performance**: Sub-200KB bundle, <1.5s first paint

## 📁 Project Structure

```
src/
├── components/           # Reusable UI components
│   ├── ui/              # Basic UI primitives (Button, Card, etc.)
│   ├── layout/          # Layout components (Header, Sidebar, etc.)
│   ├── routing/         # Router and route protection
│   └── providers/       # Context providers
├── hooks/               # Custom React hooks
│   ├── queries/         # TanStack Query hooks
│   └── ...              # Other custom hooks
├── lib/                 # Utility libraries
│   ├── api-client.ts    # HTTP client with interceptors
│   ├── query-client.ts  # TanStack Query configuration
│   ├── storage.ts       # Enhanced local storage
│   └── utils.ts         # General utilities
├── pages/               # Page components (lazy loaded)
│   ├── auth/            # Authentication pages
│   ├── public/          # Public pages
│   ├── admin/           # Admin pages
│   └── errors/          # Error pages
├── stores/              # Zustand store slices
│   ├── slices/          # Individual store slices
│   ├── types.ts         # Store type definitions
│   └── index.ts         # Combined store
├── types/               # TypeScript type definitions
└── assets/              # Static assets
```

## 🚀 Key Features

### Performance Optimizations

- **Bundle Splitting**: Route-based code splitting with React.lazy()
- **Tree Shaking**: Unused code elimination
- **Caching**: Intelligent query caching with TanStack Query
- **Virtual Scrolling**: For large lists using react-virtuoso
- **Image Optimization**: Lazy loading and responsive images
- **Service Worker**: For offline functionality (PWA ready)

### State Management

- **Global State**: Zustand with persistence and devtools
- **Server State**: TanStack Query with optimistic updates
- **Local State**: React hooks for component-specific state
- **Real-time State**: WebSocket integration for live updates

### Authentication & Security

- **JWT Authentication**: Automatic token refresh
- **Protected Routes**: Route-level authentication guards
- **Permission System**: Role-based access control
- **Secure Storage**: Encrypted local storage for sensitive data
- **CSRF Protection**: Request token validation

### Developer Experience

- **TypeScript Strict Mode**: Full type safety
- **ESLint + Prettier**: Code formatting and linting
- **Husky**: Pre-commit hooks for quality gates
- **Hot Reload**: Fast development feedback
- **Error Boundaries**: Graceful error handling
- **Accessibility**: WCAG 2.1 AA compliance

## 🛠️ Development Setup

### Prerequisites

- Node.js 18+ and npm 9+
- Git

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd frontend

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your configuration

# Start development server
npm run dev
```

### Available Scripts

```bash
# Development
npm run dev                 # Start development server
npm run build              # Build for production
npm run preview            # Preview production build
npm run build:analyze      # Analyze bundle size

# Code Quality
npm run lint               # Run ESLint
npm run lint:fix           # Fix ESLint issues
npm run format             # Format code with Prettier
npm run format:check       # Check code formatting
npm run type-check         # Run TypeScript checks

# Testing
npm run test               # Run unit tests
npm run test:ui            # Run tests with UI
npm run test:coverage      # Run tests with coverage
npm run test:e2e           # Run end-to-end tests

# Documentation
npm run storybook          # Start Storybook
npm run build-storybook    # Build Storybook

# Git Hooks
npm run prepare            # Set up Husky hooks
```

## 🎨 Design System

### Color Palette

- **Guardian**: Primary brand color for protection/security
- **Sage**: Secondary color for wisdom/guidance  
- **Danger**: Error and critical alert color
- **Background**: App background colors
- **Foreground**: Text and UI element colors
- **Muted**: Subtle text and borders

### Typography

- **Font Family**: Inter (system font fallback)
- **Sizes**: Responsive scale from text-xs to text-6xl
- **Weights**: 400 (normal), 500 (medium), 600 (semibold), 700 (bold)

### Components

All components follow atomic design principles:

- **Atoms**: Button, Input, Badge, etc.
- **Molecules**: Card, Dialog, Form fields
- **Organisms**: Layout components, complex forms
- **Templates**: Page layouts
- **Pages**: Complete page components

## 🔧 Configuration

### Environment Variables

```bash
VITE_API_URL=http://localhost:8080/api
VITE_WS_URL=ws://localhost:8080
VITE_APP_VERSION=1.0.0
VITE_BUILD_TIME=2024-01-01T00:00:00Z
VITE_GIT_COMMIT=abc123
VITE_ANALYTICS_ENABLED=false
```

### Build Configuration

The application uses Vite with optimized settings:

- **Bundle Analysis**: Visualize bundle composition
- **Code Splitting**: Automatic route-based splitting
- **Asset Optimization**: Image compression and format conversion
- **CSS Optimization**: Purging unused styles
- **TypeScript**: Strict mode with comprehensive checks

## 📊 Performance Targets

- **Bundle Size**: < 200KB gzipped
- **First Paint**: < 1.5 seconds
- **Time to Interactive**: < 3 seconds
- **Lighthouse Score**: > 95
- **Core Web Vitals**: All metrics in "Good" range

## 🧪 Testing Strategy

### Unit Tests

- **Framework**: Vitest (Jest-compatible)
- **React Testing**: @testing-library/react
- **Coverage**: 80%+ code coverage target
- **Mocking**: MSW for API mocking

### Integration Tests

- **User Flows**: Critical path testing
- **API Integration**: Real API testing with MSW
- **State Management**: Store testing with real interactions

### End-to-End Tests

- **Framework**: Playwright
- **Browser Coverage**: Chrome, Firefox, Safari
- **Device Testing**: Desktop and mobile viewports
- **Accessibility**: Automated a11y testing

## 📚 Documentation

### Storybook

All components are documented in Storybook with:

- **Interactive Examples**: Live component playground
- **Props Documentation**: Auto-generated from TypeScript
- **Accessibility Tests**: Built-in a11y validation
- **Design Tokens**: Visual design system documentation

### Code Documentation

- **TypeScript**: Self-documenting with comprehensive types
- **JSDoc**: Complex functions have detailed documentation
- **README Files**: Each major directory has documentation
- **Architecture Decision Records**: Major decisions documented

## 🚢 Deployment

### Build Process

```bash
# Production build
npm run build

# Verify build
npm run preview

# Analyze bundle
npm run build:analyze
```

### Docker

```dockerfile
# Multi-stage build for optimal size
FROM node:18-alpine as builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### Environment Configuration

- **Development**: Local development with hot reload
- **Staging**: Production build with debug features
- **Production**: Optimized build with analytics

## 🔒 Security Considerations

- **Content Security Policy**: Strict CSP headers
- **XSS Protection**: Input sanitization and output encoding
- **CSRF Protection**: Token-based request validation
- **Secure Headers**: Security-focused HTTP headers
- **Dependency Scanning**: Regular security audits
- **Access Control**: Role-based permissions

## 🌐 Accessibility

- **WCAG 2.1 AA**: Full compliance target
- **Screen Reader**: Comprehensive ARIA labels
- **Keyboard Navigation**: Full keyboard accessibility
- **Color Contrast**: Minimum 4.5:1 ratio
- **Focus Management**: Logical focus flow
- **Reduced Motion**: Respects user preferences

## 🤝 Contributing

### Code Style

- **TypeScript**: Strict mode with comprehensive types
- **ESLint**: Enforced code quality rules
- **Prettier**: Consistent code formatting
- **Conventional Commits**: Standardized commit messages

### Pull Request Process

1. **Branch**: Create feature branch from main
2. **Develop**: Implement changes with tests
3. **Test**: Ensure all tests pass
4. **Lint**: Fix all linting issues
5. **Review**: Submit PR for code review
6. **Merge**: Squash merge after approval

### Quality Gates

- **Type Check**: TypeScript compilation
- **Lint**: ESLint validation
- **Test**: Unit test coverage > 80%
- **Build**: Production build success
- **Accessibility**: a11y test validation

## 📈 Monitoring & Analytics

### Performance Monitoring

- **Core Web Vitals**: LCP, FID, CLS tracking
- **Bundle Analysis**: Regular size monitoring
- **Error Tracking**: Runtime error collection
- **User Analytics**: Usage pattern analysis

### Health Checks

- **API Health**: Backend service monitoring
- **WebSocket**: Real-time connection status
- **Cache Health**: Query cache performance
- **Storage Usage**: Local storage monitoring

## 🗺️ Roadmap

### Phase 1 (Current)
- ✅ Core architecture and components
- ✅ Authentication and routing
- ✅ State management with Zustand
- ✅ Real-time WebSocket integration

### Phase 2 (Next)
- [ ] Comprehensive test coverage
- [ ] Storybook documentation
- [ ] Performance optimizations
- [ ] Accessibility enhancements

### Phase 3 (Future)
- [ ] PWA capabilities
- [ ] Advanced analytics
- [ ] Internationalization
- [ ] Advanced collaboration features

## 📞 Support

For questions, issues, or contributions:

- **Issues**: GitHub Issues
- **Discussions**: GitHub Discussions
- **Documentation**: [Architecture Docs](./docs/)
- **Email**: dev@fineprintai.com

---

Built with ❤️ by the Fine Print AI team