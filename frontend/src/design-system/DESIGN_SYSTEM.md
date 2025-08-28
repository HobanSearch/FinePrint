# Fine Print AI - Model-Inspired Design System

## Design Philosophy

Our design system embodies sophistication, intelligence, and trustworthiness through minimal aesthetics inspired by Claude's interface. We prioritize clarity, subtle interactions, and a refined color palette that communicates legal analysis with precision.

### Core Principles

1. **Minimalist Sophistication**: Clean lines, ample whitespace, subtle shadows
2. **Intelligent Hierarchy**: Clear information architecture with purposeful emphasis
3. **Trustworthy Aesthetics**: Professional appearance that instills confidence
4. **Accessible Design**: WCAG 2.1 AA compliant with thoughtful contrast ratios
5. **Smooth Interactions**: Subtle animations that guide without distraction

## Color System

### Primary Palette

#### Sophisticated Neutrals
- **Charcoal**: Professional depth for text and UI elements
- **Graphite**: Mid-tone neutrals for secondary elements
- **Smoke**: Light backgrounds and subtle borders

#### Minimal Accents
- **Cerulean** (#0ba5ec): Trust, intelligence, primary actions
- **Sage** (#22c55e): Safety, approval, positive outcomes
- **Amber** (#f59e0b): Warnings, attention, moderate risk
- **Crimson** (#ef4444): Alerts, critical issues, high risk

### Color Usage Guidelines

```typescript
// Primary text
color: theme.colors.foreground.primary;

// Secondary text
color: theme.colors.foreground.secondary;

// Disabled state
color: theme.colors.foreground.muted;

// Interactive elements
background: theme.colors.interactive.primary;
hover: theme.colors.interactive.hover;

// Risk indicators
low: theme.colors.risk.low;
medium: theme.colors.risk.medium;
high: theme.colors.risk.high;
```

## Typography

### Font Stack
```css
font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 
             'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif;
```

### Type Scale
- **Display**: 3rem (48px) - Hero sections
- **Heading 1**: 2.25rem (36px) - Page titles
- **Heading 2**: 1.875rem (30px) - Section headers
- **Heading 3**: 1.5rem (24px) - Subsections
- **Body Large**: 1.125rem (18px) - Emphasized body
- **Body**: 1rem (16px) - Default text
- **Body Small**: 0.875rem (14px) - Secondary text
- **Caption**: 0.75rem (12px) - Labels and hints

### Weight Guidelines
- **Regular (400)**: Body text, descriptions
- **Medium (500)**: Emphasized text, labels
- **Semibold (600)**: Headings, buttons
- **Bold (700)**: Critical information, CTAs

## Spacing System

### Scale
```typescript
xs: 0.5rem   // 8px - Tight spacing
sm: 0.75rem  // 12px - Compact elements
md: 1rem     // 16px - Default spacing
lg: 1.5rem   // 24px - Section spacing
xl: 2rem     // 32px - Major sections
xxl: 3rem    // 48px - Page sections
```

### Usage Patterns
- **Component padding**: sm to lg
- **Section margins**: lg to xxl
- **Inline spacing**: xs to sm
- **Grid gaps**: md to lg

## Component Specifications

### Buttons

#### Variants
1. **Primary**: Cerulean background, white text
2. **Secondary**: Transparent with border
3. **Ghost**: Transparent, no border
4. **Destructive**: Crimson for dangerous actions

#### Sizes
```typescript
// Small
height: 32px;
padding: 0 12px;
font-size: 14px;

// Medium (default)
height: 40px;
padding: 0 16px;
font-size: 16px;

// Large
height: 48px;
padding: 0 24px;
font-size: 18px;
```

#### States
- **Default**: Base appearance
- **Hover**: Subtle color shift, slight shadow
- **Active**: Pressed appearance
- **Disabled**: 50% opacity, no interactions
- **Loading**: Spinner icon, disabled state

### Input Fields

#### Characteristics
- **Height**: 44px (optimal touch target)
- **Border**: 1px solid, subtle on focus
- **Border radius**: 8px
- **Padding**: 12px 16px
- **Font size**: 16px (prevents zoom on mobile)

#### Features
- Floating labels for context
- Clear error states with messages
- Success indicators for validation
- Helper text below input

### Cards

#### Structure
```typescript
// Minimal card
padding: 24px;
background: surface.secondary;
border-radius: 12px;
box-shadow: shadows.sm;

// Elevated card
box-shadow: shadows.md;
hover: shadows.lg;

// Bordered card
border: 1px solid border.primary;
box-shadow: none;
```

### Risk Visualization

#### Risk Gauge
- **Circular progress**: 200px diameter
- **Gradient fill**: Smooth color transitions
- **Score display**: Large central number
- **Label**: Risk level below score
- **Animation**: Smooth fill on load

#### Risk Levels
1. **Safe (0-20)**: Sage green
2. **Low (21-40)**: Light sage
3. **Medium (41-60)**: Amber
4. **High (61-80)**: Crimson
5. **Critical (81-100)**: Deep crimson

### Modals & Overlays

#### Structure
```typescript
// Overlay
background: rgba(13, 15, 18, 0.5);
backdrop-filter: blur(4px);

// Modal
max-width: 600px;
padding: 32px;
border-radius: 16px;
box-shadow: shadows.xl;
```

#### Animation
- **Entry**: Fade in + scale from 95%
- **Exit**: Fade out + scale to 95%
- **Duration**: 250ms
- **Timing**: Smooth easing

## Animation Guidelines

### Timing
```typescript
fast: 150ms      // Micro-interactions
normal: 250ms    // Standard transitions
slow: 350ms      // Complex animations
slower: 500ms    // Page transitions
```

### Easing Functions
```typescript
smooth: cubic-bezier(0.4, 0, 0.2, 1)      // Default
smooth-in: cubic-bezier(0.4, 0, 1, 1)     // Acceleration
smooth-out: cubic-bezier(0, 0, 0.2, 1)    // Deceleration
```

### Common Patterns
1. **Hover states**: 150ms transition
2. **Focus rings**: Instant appearance
3. **Loading states**: Continuous animation
4. **Page transitions**: 350ms with fade

## Accessibility

### Focus States
- **Visible focus ring**: 2px cerulean outline
- **Offset**: 2px from element
- **High contrast mode**: Increased visibility

### Color Contrast
- **Normal text**: 7:1 ratio minimum
- **Large text**: 4.5:1 ratio minimum
- **Interactive elements**: 3:1 ratio minimum

### Keyboard Navigation
- Logical tab order
- Skip links for navigation
- Escape key for dismissals
- Arrow keys for menus

### Screen Reader Support
- Semantic HTML structure
- ARIA labels for icons
- Live regions for updates
- Descriptive button text

## Responsive Design

### Breakpoints
```typescript
sm: 640px   // Mobile landscape
md: 768px   // Tablet portrait
lg: 1024px  // Tablet landscape
xl: 1280px  // Desktop
2xl: 1536px // Large desktop
```

### Mobile Considerations
- **Touch targets**: Minimum 44x44px
- **Font sizes**: Minimum 16px
- **Spacing**: Increased on mobile
- **Gestures**: Swipe support where appropriate

## Implementation Examples

### Button Component
```tsx
interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
}

const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  disabled,
  loading,
  fullWidth,
  children,
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center font-medium transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2';
  
  const variants = {
    primary: 'bg-cerulean-500 text-white hover:bg-cerulean-600 focus:ring-cerulean-500',
    secondary: 'border border-border-primary text-foreground-primary hover:bg-surface-secondary',
    ghost: 'text-foreground-secondary hover:text-foreground-primary hover:bg-surface-secondary',
    destructive: 'bg-crimson-500 text-white hover:bg-crimson-600 focus:ring-crimson-500'
  };
  
  const sizes = {
    sm: 'h-8 px-3 text-sm rounded-md',
    md: 'h-10 px-4 text-base rounded-lg',
    lg: 'h-12 px-6 text-lg rounded-lg'
  };
  
  return (
    <button
      className={cn(
        baseStyles,
        variants[variant],
        sizes[size],
        disabled && 'opacity-50 cursor-not-allowed',
        fullWidth && 'w-full',
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner className="mr-2" />}
      {children}
    </button>
  );
};
```

### Risk Gauge Component
```tsx
interface RiskGaugeProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  animated?: boolean;
}

const RiskGauge: React.FC<RiskGaugeProps> = ({
  score,
  size = 'md',
  animated = true
}) => {
  const dimensions = {
    sm: 120,
    md: 200,
    lg: 280
  };
  
  const radius = dimensions[size] / 2 - 20;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  
  const riskLevel = getRiskLevel(score);
  const riskColor = theme.colors.risk[riskLevel];
  
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg
        width={dimensions[size]}
        height={dimensions[size]}
        className="transform -rotate-90"
      >
        {/* Background circle */}
        <circle
          cx={dimensions[size] / 2}
          cy={dimensions[size] / 2}
          r={radius}
          stroke={theme.colors.border.primary}
          strokeWidth="4"
          fill="none"
        />
        
        {/* Progress circle */}
        <circle
          cx={dimensions[size] / 2}
          cy={dimensions[size] / 2}
          r={radius}
          stroke={riskColor}
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className={cn(
            'transition-all',
            animated && 'duration-1000 ease-out'
          )}
        />
      </svg>
      
      {/* Score display */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold text-foreground-primary">
          {score}
        </span>
        <span className="text-sm text-foreground-secondary mt-1">
          {getRiskLabel(score)}
        </span>
      </div>
    </div>
  );
};
```

## Design Tokens Usage

### In React Components
```tsx
import { tokens } from '@/design-system/tokens';
import { useTheme } from '@/design-system/providers/ThemeProvider';

const Component = () => {
  const { theme } = useTheme();
  
  return (
    <div
      style={{
        padding: tokens.spacing.md,
        backgroundColor: theme.colors.surface.primary,
        borderRadius: tokens.borderRadius.lg,
        boxShadow: tokens.shadows.md
      }}
    >
      Content
    </div>
  );
};
```

### In Tailwind Config
```javascript
// tailwind.config.js
import { tokens } from './src/design-system/tokens';

module.exports = {
  theme: {
    extend: {
      colors: tokens.colors,
      spacing: tokens.spacing,
      borderRadius: tokens.borderRadius,
      boxShadow: tokens.shadows,
      animation: tokens.animations.keyframes
    }
  }
};
```

## Best Practices

1. **Consistency**: Always use design tokens, never hardcode values
2. **Accessibility**: Test with keyboard and screen readers
3. **Performance**: Use CSS transitions over JavaScript animations
4. **Responsiveness**: Design mobile-first
5. **Documentation**: Comment complex implementations
6. **Testing**: Include visual regression tests

## Resources

- [Design Tokens Reference](./tokens/index.ts)
- [Theme Configuration](./theme/index.ts)
- [Component Library](./components/)
- [Accessibility Guide](./docs/accessibility.md)
- [Animation Patterns](./docs/animations.md)