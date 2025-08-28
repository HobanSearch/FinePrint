# Fine Print AI - Unified Design System

A comprehensive, cross-platform design system for Fine Print AI that ensures consistency and accessibility across web, mobile, and browser extension platforms.

## 🎯 Overview

The Fine Print AI Design System is a production-ready, enterprise-grade design system built specifically for legal technology applications. It provides:

- **Cross-platform compatibility**: Works seamlessly across React (web), React Native (mobile), and browser extensions
- **Accessibility-first**: WCAG 2.1 AA compliant with comprehensive screen reader and keyboard navigation support
- **Legal-tech optimized**: Specialized components for risk visualization and document analysis
- **Performance optimized**: Tree-shakeable, minimal bundle impact
- **Developer experience**: Full TypeScript support, comprehensive documentation, and testing

## 🚀 Quick Start

### Installation

```bash
# Install the design system (when published)
npm install @fineprint/design-system

# For development, components are available via relative imports
import { Button, Card, RiskGauge } from './design-system'
```

### Basic Usage

```tsx
import React from 'react'
import { ThemeProvider, Button, Card, RiskGauge } from '@fineprint/design-system'

function App() {
  return (
    <ThemeProvider defaultTheme="light">
      <Card>
        <h2>Document Risk Analysis</h2>
        <RiskGauge score={75} showLabel />
        <Button risk="high" onClick={handleRiskAction}>
          Review High Risk Clauses
        </Button>
      </Card>
    </ThemeProvider>
  )
}
```

## 🏗️ Architecture

### Design Tokens

The system is built on a comprehensive set of design tokens that ensure consistency across platforms:

```typescript
import { tokens } from '@fineprint/design-system'

// Colors
tokens.colors.guardian[500]  // Primary brand color
tokens.colors.risk.high[500] // High risk color

// Typography
tokens.typography.fontSize.lg // Large font size
tokens.typography.fontFamily.sans // Sans-serif font stack

// Spacing
tokens.spacing[4] // 1rem (16px)
tokens.spacing[8] // 2rem (32px)
```

### Theme System

Dynamic theming with support for light, dark, and high-contrast variants:

```tsx
import { ThemeProvider, useTheme } from '@fineprint/design-system'

// Automatic theme detection
<ThemeProvider 
  enableSystemTheme 
  enableHighContrast 
  respectReducedMotion
>
  <App />
</ThemeProvider>

// Manual theme control
const { theme, setTheme, toggleTheme } = useTheme()
```

## 📦 Components

### Primitive Components

#### Button
Accessible button component with risk-level variants:

```tsx
// Basic usage
<Button onClick={handleClick}>Click me</Button>

// Risk-based styling
<Button risk="critical" onClick={handleCriticalAction}>
  Critical Action
</Button>

// With icons and loading states
<Button 
  leftIcon={<PlayIcon />}
  loading={isLoading}
  onClick={handlePlay}
>
  Play Analysis
</Button>
```

**Props:**
- `variant`: 'primary' | 'secondary' | 'outline' | 'ghost' | 'link' | 'destructive'
- `size`: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'icon' | 'icon-sm' | 'icon-lg'
- `risk`: 'safe' | 'low' | 'medium' | 'high' | 'critical'
- `loading`: boolean
- `disabled`: boolean
- `fullWidth`: boolean
- `leftIcon`, `rightIcon`: React.ReactNode

#### Card
Flexible container component:

```tsx
// Basic card
<Card>
  <CardHeader>
    <CardTitle>Analysis Results</CardTitle>
    <CardDescription>Document risk assessment</CardDescription>
  </CardHeader>
  <CardContent>
    Content goes here
  </CardContent>
</Card>

// Risk-specific card
<RiskCard 
  riskLevel="high"
  riskScore={85}
  title="Privacy Policy Issues"
  description="Multiple high-risk clauses detected"
>
  Detailed content
</RiskCard>
```

#### Badge
Status and risk indicator badges:

```tsx
// Status badges
<StatusBadge status="success">Approved</StatusBadge>
<StatusBadge status="warning" pulse>Processing</StatusBadge>

// Risk badges
<RiskBadge riskLevel="high" showScore score={85} />

// Custom badges
<Badge variant="outline" size="lg">Custom</Badge>
```

### Visualization Components

#### Risk Gauge
Animated circular gauge for displaying risk scores:

```tsx
<RiskGauge 
  score={75}
  size="lg"
  animated
  showLabel
  showScore
  interactive
  onClick={handleGaugeClick}
/>
```

#### Risk Distribution
Bar chart for risk category distribution:

```tsx
<RiskDistribution 
  data={[
    { category: 'Privacy', value: 15, riskLevel: 'high' },
    { category: 'Terms', value: 8, riskLevel: 'medium' },
    { category: 'Liability', value: 3, riskLevel: 'low' }
  ]}
  height={200}
  showLabels
/>
```

#### Risk Trend
Timeline visualization for risk changes:

```tsx
<RiskTrend 
  data={[
    { 
      date: '2024-01-01', 
      score: 45,
      events: [{ type: 'update', description: 'Terms updated' }]
    },
    { date: '2024-01-02', score: 65 },
    { date: '2024-01-03', score: 75 }
  ]}
  height={200}
/>
```

### Accessibility Components

#### Screen Reader Support
```tsx
import { VisuallyHidden, Announcement, LiveRegion } from '@fineprint/design-system'

// Hidden content for screen readers
<VisuallyHidden>Additional context for screen readers</VisuallyHidden>

// Live announcements
<Announcement message="Analysis complete" politeness="polite" />

// Live regions for dynamic content
<LiveRegion politeness="assertive">
  {dynamicContent}
</LiveRegion>
```

#### Focus Management
```tsx
import { FocusTrap, KeyboardNavigation } from '@fineprint/design-system'

// Trap focus within modal
<FocusTrap enabled={isModalOpen}>
  <Modal>Content</Modal>
</FocusTrap>

// Keyboard navigation handling
<KeyboardNavigation
  onEscape={closeModal}
  onEnter={submitForm}
  onArrowDown={moveToNext}
>
  {content}
</KeyboardNavigation>
```

## 🌍 Cross-Platform Usage

### React Native (Mobile)

```typescript
import { createReactNativeButton, createReactNativeTheme } from '@fineprint/design-system/react-native'
import { TouchableOpacity, Text, View } from 'react-native'

// Create platform-adapted components
const Button = createReactNativeButton(TouchableOpacity, Text, ActivityIndicator, View)
const theme = createReactNativeTheme(lightTheme)

// Usage
<Button
  title="Analyze Document"
  onPress={handlePress}
  variant="primary"
  risk="medium"
/>
```

### Browser Extension

```typescript
import { 
  generateExtensionCSS, 
  createExtensionButton,
  injectCSS 
} from '@fineprint/design-system/extension'

// Inject CSS
const css = generateExtensionCSS(theme)
injectCSS(css)

// Create HTML components
const buttonHTML = createExtensionButton({
  text: 'Analyze Page',
  onClick: 'analyzePage()',
  risk: 'medium'
})

document.body.innerHTML += buttonHTML
```

## 🎨 Customization

### Custom Themes

```typescript
import { createDesignSystem } from '@fineprint/design-system'

const customTheme = {
  colors: {
    brand: {
      primary: '#custom-color',
      secondary: '#another-color'
    }
  }
}

const designSystem = createDesignSystem({
  platform: 'web',
  theme: customTheme,
  customTokens: {
    borderRadius: {
      custom: '12px'
    }
  }
})
```

### CSS Variable Override

```css
:root {
  --fp-brand-primary: #your-color;
  --fp-risk-high: #your-risk-color;
  --fp-border-radius-lg: 12px;
}
```

## ♿ Accessibility

The design system is built with accessibility as a first-class concern:

### WCAG 2.1 AA Compliance
- ✅ Color contrast ratios meet AA standards
- ✅ Focus indicators are clearly visible
- ✅ Interactive elements have minimum 44px touch targets
- ✅ All components support keyboard navigation
- ✅ Screen reader optimized with proper ARIA attributes

### Keyboard Navigation
- Tab: Move between interactive elements
- Enter/Space: Activate buttons and links
- Escape: Close modals and dropdowns
- Arrow keys: Navigate within component groups

### Screen Reader Support
- Semantic HTML elements
- Proper heading hierarchy
- Descriptive labels and instructions
- Live region announcements
- State change notifications

### Reduced Motion Support
Components automatically respect `prefers-reduced-motion` settings and provide static alternatives.

### High Contrast Mode
All components work with OS high contrast modes and provide additional border styling when needed.

## 🧪 Testing

### Component Testing

```typescript
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe, toHaveNoViolations } from 'jest-axe'
import { Button, ThemeProvider } from '@fineprint/design-system'

expect.extend(toHaveNoViolations)

test('Button is accessible', async () => {
  const { container } = render(
    <ThemeProvider>
      <Button>Test Button</Button>
    </ThemeProvider>
  )
  
  const results = await axe(container)
  expect(results).toHaveNoViolations()
})
```

### Visual Testing

Run Storybook for visual testing and component documentation:

```bash
npm run storybook
```

### Cross-Platform Testing

```bash
# Web components
npm run test

# React Native components (when implemented)
npm run test:mobile

# Extension components
npm run test:extension
```

## 📚 Documentation

### Storybook
Interactive component documentation with examples:
```bash
npm run storybook
```

### Design Tokens
Browse all design tokens in Storybook's "Design Tokens" section or view the tokens file directly.

### API Reference
Full TypeScript definitions are available for all components with detailed JSDoc comments.

## 🚢 Platform Deployment

### Web Application
Components work out-of-the-box with React applications. Include the ThemeProvider at your app root.

### Mobile Application
Use React Native adapters to convert web components to native equivalents with platform-appropriate styling.

### Browser Extension
Generate CSS and HTML for extension environments with proper scoping to avoid conflicts with host pages.

## 🤝 Contributing

### Development Setup

```bash
# Install dependencies
npm install

# Start development
npm run dev

# Run tests
npm run test

# Run Storybook
npm run storybook
```

### Component Guidelines

1. **Accessibility First**: Every component must be accessible and testable
2. **Cross-Platform**: Consider how components adapt across platforms
3. **Performance**: Optimize for bundle size and runtime performance
4. **Documentation**: Include comprehensive Storybook stories and tests
5. **Type Safety**: Full TypeScript support with proper prop types

### Commit Convention

We use conventional commits:
- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation updates
- `style:` Code style changes
- `refactor:` Code refactoring
- `test:` Test updates
- `chore:` Build process updates

## 📄 License

MIT License - see LICENSE file for details.

## 🔗 Links

- [Design System Storybook](https://design-system.fineprint.ai)
- [Component API Documentation](https://docs.fineprint.ai/design-system)
- [Accessibility Guidelines](https://docs.fineprint.ai/accessibility)
- [Contributing Guide](https://github.com/fineprint/design-system/blob/main/CONTRIBUTING.md)

---

**Fine Print AI Design System v1.0.0**  
Built with ❤️ for accessible, cross-platform legal technology.