# Fine Print AI Browser Extension

A powerful browser extension that automatically analyzes Terms of Service, Privacy Policies, and other legal documents to identify problematic clauses and provide actionable recommendations.

## Features

### 🔍 Intelligent Detection
- Automatically detects Terms of Service and Privacy Policy pages
- Supports single-page applications (SPAs) with dynamic content
- Machine learning-based page classification
- URL pattern matching and content analysis

### 📝 Inline Analysis
- Highlights problematic clauses directly on web pages
- Color-coded risk indicators (low, medium, high, critical)
- Interactive tooltips with explanations and recommendations
- Non-intrusive UI that preserves page layout

### ⚡ Real-time Processing
- Background analysis with progress tracking
- Local caching for faster repeat visits
- Push notifications for high-risk documents
- Cross-device sync of settings and preferences

### 🛡️ Privacy-First Design
- Local processing option with offline analysis
- No data retention on external servers
- Encrypted communication with Fine Print AI API
- Full user control over data sharing

### 🎨 Professional Interface
- Clean, modern popup with analysis results
- Comprehensive options page for customization
- Keyboard shortcuts for power users
- Accessibility support for screen readers

## Installation

### From Store (Coming Soon)
- Chrome Web Store
- Firefox Add-ons
- Safari Extensions Gallery
- Microsoft Edge Add-ons

### Development Build

1. **Prerequisites**
   ```bash
   node >= 18.0.0
   npm >= 8.0.0
   ```

2. **Clone and Install**
   ```bash
   cd extension
   npm install
   ```

3. **Development**
   ```bash
   # Chrome development
   npm run dev:chrome
   
   # Firefox development  
   npm run dev:firefox
   
   # Safari development
   npm run dev:safari
   ```

4. **Production Build**
   ```bash
   # Build for all browsers
   npm run build
   
   # Build for specific browser
   npm run build:chrome
   npm run build:firefox
   npm run build:safari
   ```

5. **Load Extension**
   - **Chrome**: Go to `chrome://extensions/`, enable Developer mode, click "Load unpacked", select `build/chrome-mv3-dev`
   - **Firefox**: Go to `about:debugging`, click "This Firefox", click "Load Temporary Add-on", select manifest file
   - **Safari**: Use Xcode to load and sign the extension

## Usage

### Automated Analysis
1. Visit any Terms of Service or Privacy Policy page
2. Extension automatically detects and analyzes the document
3. View risk score and findings in the popup or page overlay
4. Click highlighted text for detailed explanations

### Manual Analysis
1. Right-click on any page and select "Analyze with Fine Print AI"
2. Use keyboard shortcut `Ctrl+Shift+A` (or `Cmd+Shift+A` on Mac)
3. Click the extension icon and select "Analyze Page"

### Keyboard Shortcuts
- `Ctrl+Shift+A` - Analyze current page
- `Ctrl+Shift+H` - Toggle highlights on/off
- `Ctrl+Shift+F` - Open Fine Print AI popup
- `Ctrl+Shift+O` - Open extension options
- `Ctrl+Shift+↓` - Next finding
- `Ctrl+Shift+↑` - Previous finding
- `Ctrl+Shift+C` - Copy report URL
- `Ctrl+Shift+E` - Export findings as JSON

## Configuration

### API Settings
Configure the extension to connect to your Fine Print AI instance:

1. Open extension options (`Ctrl+Shift+O`)
2. Enter your API endpoint (e.g., `http://localhost:8000`)
3. Add your API key and user credentials
4. Test connection to verify setup

### Analysis Preferences
- **Auto-analyze**: Automatically analyze detected legal documents
- **Highlight findings**: Show highlights directly on web pages
- **Notifications**: Receive alerts for high-risk documents
- **Threshold**: Control sensitivity of issue detection (low/medium/high)
- **Theme**: Choose light, dark, or auto theme

### Privacy Controls
- **Local processing**: Analyze documents locally without API calls
- **Data export**: Export your settings and analysis cache
- **Cache management**: Control how long analyses are cached
- **Sync settings**: Sync preferences across devices

## Architecture

### Technology Stack
- **Framework**: Plasmo (modern extension development)
- **Frontend**: React 18 + TypeScript 5
- **UI**: Tailwind CSS + Radix UI components
- **State**: Zustand + TanStack Query
- **Build**: Vite + ESBuild for fast compilation

### Extension Components

#### Content Scripts (`contents/`)
- **analyzer.tsx**: Main content script for page analysis and highlighting
- Injected into all web pages
- Handles DOM manipulation and user interactions
- Communicates with background script via messaging

#### Background Script (`background/`)
- **index.ts**: Service worker for Chrome MV3 compatibility
- Manages API calls and data processing
- Handles context menus and keyboard shortcuts
- Coordinates between content scripts and popup

#### Popup Interface (`popup/`)
- **index.tsx**: Main popup showing analysis results
- Risk score visualization and findings summary
- Quick actions and navigation to full reports
- Responsive design optimized for small screens

#### Options Page (`options/`)
- **index.tsx**: Comprehensive settings and preferences
- API configuration and connection testing
- Data management and export/import functionality
- Storage usage monitoring and cache management

#### Shared Libraries (`src/lib/`)
- **api-client.ts**: API communication with error handling
- **storage.ts**: Cross-device settings and cache management
- **page-detector.ts**: Intelligent legal document detection
- **keyboard-shortcuts.ts**: Customizable keyboard shortcuts
- **utils.ts**: Common utilities and helper functions

### Cross-Browser Compatibility

#### Manifest V3 (Chrome, Edge)
```json
{
  "manifest_version": 3,
  "service_worker": "background.js",
  "action": { "default_popup": "popup.html" }
}
```

#### Manifest V2 (Firefox)
```json
{
  "manifest_version": 2,
  "background": { "scripts": ["background.js"] },
  "browser_action": { "default_popup": "popup.html" }
}
```

#### Safari Extension
- Native Swift wrapper for web extension
- Automatic conversion of Chrome extension format
- Platform-specific optimizations and permissions

## Development

### Project Structure
```
extension/
├── src/
│   ├── components/     # Reusable UI components
│   ├── lib/           # Shared utilities and services
│   └── types/         # TypeScript type definitions
├── contents/          # Content scripts
├── background/        # Background scripts
├── popup/            # Extension popup
├── options/          # Options page
├── assets/           # Icons and static files
└── build/            # Compiled extension builds
```

### Testing
```bash
# Run unit tests
npm test

# Run with watch mode
npm run test:watch

# Type checking
npm run type-check

# Linting
npm run lint
npm run lint:fix
```

### Building for Distribution
```bash
# Clean build
npm run clean

# Build all browser versions
npm run build

# Package for distribution
npm run package
```

## API Integration

### Authentication
```typescript
// Configure API credentials
await ExtensionStorage.setUserCredentials(apiKey, userId)
await ExtensionStorage.setApiEndpoint('https://api.fineprintai.com')
```

### Document Analysis
```typescript
// Analyze document content
const result = await apiClient.analyzeDocument({
  url: window.location.href,
  content: extractedContent,
  documentType: 'terms',
  language: 'en'
})
```

### Real-time Updates
```typescript
// Subscribe to analysis progress
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'ANALYSIS_PROGRESS') {
    updateProgressIndicator(message.payload)
  }
})
```

## Security

### Content Security Policy
- Strict CSP preventing XSS attacks
- No inline scripts or eval() usage
- External resources limited to API endpoints

### Data Protection
- All user data encrypted in transit and at rest
- Local storage uses browser's secure storage APIs
- No tracking or analytics without explicit consent

### Permissions
- **activeTab**: Access current tab content only
- **storage**: Save user preferences and cache
- **contextMenus**: Right-click analyze options
- **notifications**: High-risk document alerts
- **host_permissions**: Analyze web pages (user-controlled)

## Contributing

### Development Setup
1. Fork the repository
2. Create a feature branch
3. Install dependencies: `npm install`
4. Start development server: `npm run dev`
5. Make changes and test across browsers
6. Submit pull request with detailed description

### Code Standards
- TypeScript for all new code
- ESLint + Prettier for code formatting
- Unit tests for utilities and services
- Browser compatibility testing required
- Accessibility compliance (WCAG 2.1 AA)

### Issue Reporting
- Use GitHub Issues with detailed reproduction steps
- Include browser version and extension version
- Provide example URLs when relevant
- Check existing issues before creating new ones

## License

This project is licensed under the terms specified in the main Fine Print AI repository.

## Support

- **Documentation**: [docs.fineprintai.com](https://docs.fineprintai.com)
- **Issues**: [GitHub Issues](https://github.com/company/fineprintai/issues)
- **Discussions**: [GitHub Discussions](https://github.com/company/fineprintai/discussions)
- **Email**: support@fineprintai.com

---

Made with ❤️ by the Fine Print AI team