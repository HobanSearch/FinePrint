/**
 * Fine Print AI - Button Component Stories
 * Interactive documentation and examples for the Button component
 */

import type { Meta, StoryObj } from '@storybook/react'
import { action } from '@storybook/addon-actions'
import { 
  Play, 
  Download, 
  ChevronRight, 
  AlertTriangle, 
  CheckCircle,
  Loader2 
} from 'lucide-react'

import { Button, ButtonGroup, IconButton } from './Button'
import { Badge } from './Badge'

const meta = {
  title: 'Design System/Primitives/Button',
  component: Button,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `
The Button component is a foundational interactive element that supports multiple variants, sizes, and accessibility features. It includes specialized risk-level styling for legal tech contexts.

## Features

- **Accessibility**: Full WCAG 2.1 AA compliance with proper focus management and screen reader support
- **Risk Variants**: Color-coded buttons for different risk levels (safe, low, medium, high, critical)
- **Loading States**: Built-in loading spinner with accessibility announcements
- **Icon Support**: Left and right icon positioning with proper spacing
- **Cross-platform**: Consistent design across web, mobile, and extension platforms

## Usage

\`\`\`tsx
import { Button } from '@/design-system'

// Basic usage
<Button onClick={handleClick}>Click me</Button>

// With risk level
<Button risk="high" onClick={handleRisk}>High Risk Action</Button>

// With loading state
<Button loading={isLoading} onClick={handleSubmit}>Submit</Button>

// With icons
<Button leftIcon={<Play />} onClick={handlePlay}>Play Video</Button>
\`\`\`
        `,
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'outline', 'ghost', 'link', 'destructive'],
      description: 'Visual style variant of the button',
    },
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md', 'lg', 'xl', 'icon', 'icon-sm', 'icon-lg'],
      description: 'Size of the button',
    },
    risk: {
      control: 'select',
      options: ['safe', 'low', 'medium', 'high', 'critical'],
      description: 'Risk level styling (overrides variant)',
    },
    loading: {
      control: 'boolean',
      description: 'Shows loading spinner and disables interaction',
    },
    disabled: {
      control: 'boolean',
      description: 'Disables the button',
    },
    fullWidth: {
      control: 'boolean',
      description: 'Makes the button take full width of container',
    },
    onClick: {
      action: 'clicked',
      description: 'Click handler function',
    },
  },
  args: {
    onClick: action('button-click'),
  },
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

// =============================================================================
// BASIC STORIES
// =============================================================================

export const Default: Story = {
  args: {
    children: 'Default Button',
  },
}

export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4 items-center">
      <Button variant="primary">Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="link">Link</Button>
      <Button variant="destructive">Destructive</Button>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'All available button variants with their distinct visual styles.',
      },
    },
  },
}

export const Sizes: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4 items-center">
      <Button size="xs">Extra Small</Button>
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg">Large</Button>
      <Button size="xl">Extra Large</Button>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Different button sizes from extra small to extra large.',
      },
    },
  },
}

// =============================================================================
// RISK LEVEL STORIES
// =============================================================================

export const RiskLevels: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 items-center">
        <Button risk="safe">Safe Action</Button>
        <Button risk="low">Low Risk</Button>
        <Button risk="medium">Medium Risk</Button>
        <Button risk="high">High Risk</Button>
        <Button risk="critical">Critical Risk</Button>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <Badge risk="safe" size="sm">Safe</Badge>
        <Badge risk="low" size="sm">Low</Badge>
        <Badge risk="medium" size="sm">Medium</Badge>
        <Badge risk="high" size="sm">High</Badge>
        <Badge risk="critical" size="sm">Critical</Badge>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Risk-level buttons with color-coded styling for legal document analysis contexts. Risk levels override variant colors.',
      },
    },
  },
}

export const RiskWithIcons: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4 items-center">
      <Button risk="safe" leftIcon={<CheckCircle size={16} />}>
        Accept Terms
      </Button>
      <Button risk="medium" leftIcon={<AlertTriangle size={16} />}>
        Review Clause
      </Button>
      <Button risk="critical" leftIcon={<AlertTriangle size={16} />}>
        Reject Agreement
      </Button>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Risk-level buttons with contextual icons for legal actions.',
      },
    },
  },
}

// =============================================================================
// INTERACTIVE STATES
// =============================================================================

export const LoadingStates: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4 items-center">
      <Button loading>Loading...</Button>
      <Button variant="secondary" loading>
        Processing
      </Button>
      <Button risk="high" loading>
        Analyzing Risk
      </Button>
      <Button variant="outline" loading leftIcon={<Download size={16} />}>
        Downloading
      </Button>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Buttons in loading state with spinner animation and disabled interaction.',
      },
    },
  },
}

export const DisabledStates: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4 items-center">
      <Button disabled>Disabled Primary</Button>
      <Button variant="secondary" disabled>
        Disabled Secondary
      </Button>
      <Button variant="outline" disabled>
        Disabled Outline
      </Button>
      <Button risk="critical" disabled>
        Disabled Critical
      </Button>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Disabled buttons with reduced opacity and no interaction.',
      },
    },
  },
}

// =============================================================================
// ICON VARIATIONS
// =============================================================================

export const WithIcons: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 items-center">
        <Button leftIcon={<Play size={16} />}>Play Video</Button>
        <Button rightIcon={<ChevronRight size={16} />}>Next Step</Button>
        <Button 
          leftIcon={<Download size={16} />} 
          rightIcon={<ChevronRight size={16} />}
        >
          Download Report
        </Button>
      </div>
      <div className="flex flex-wrap gap-4 items-center">
        <IconButton icon={<Play size={16} />} aria-label="Play" />
        <IconButton 
          icon={<Download size={16} />} 
          variant="outline" 
          aria-label="Download" 
        />
        <IconButton 
          icon={<AlertTriangle size={16} />} 
          risk="critical" 
          aria-label="Warning" 
        />
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Buttons with icons in various positions and icon-only buttons with proper accessibility labels.',
      },
    },
  },
}

export const IconSizes: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4 items-center">
      <IconButton 
        icon={<Play size={12} />} 
        size="icon-sm" 
        aria-label="Play small" 
      />
      <IconButton 
        icon={<Play size={16} />} 
        size="icon" 
        aria-label="Play medium" 
      />
      <IconButton 
        icon={<Play size={20} />} 
        size="icon-lg" 
        aria-label="Play large" 
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Icon-only buttons in different sizes with proportional icons.',
      },
    },
  },
}

// =============================================================================
// LAYOUT VARIATIONS
// =============================================================================

export const FullWidth: Story = {
  render: () => (
    <div className="w-full max-w-md space-y-4">
      <Button fullWidth>Full Width Primary</Button>
      <Button variant="outline" fullWidth>
        Full Width Outline
      </Button>
      <Button risk="medium" fullWidth leftIcon={<AlertTriangle size={16} />}>
        Full Width with Icon
      </Button>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Full-width buttons that expand to fill their container.',
      },
    },
  },
}

export const ButtonGroups: Story = {
  render: () => (
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-medium mb-2">Horizontal Group</h4>
        <ButtonGroup>
          <Button variant="outline">Cancel</Button>
          <Button>Save Draft</Button>
          <Button risk="high">Publish</Button>
        </ButtonGroup>
      </div>
      
      <div>
        <h4 className="text-sm font-medium mb-2">Vertical Group</h4>
        <ButtonGroup orientation="vertical" className="w-48">
          <Button variant="outline" fullWidth>
            Export PDF
          </Button>
          <Button variant="outline" fullWidth>
            Export Word
          </Button>
          <Button variant="outline" fullWidth>
            Send Email
          </Button>
        </ButtonGroup>
      </div>
      
      <div>
        <h4 className="text-sm font-medium mb-2">Mixed Sizes</h4>
        <ButtonGroup spacing="lg">
          <Button size="sm" variant="outline">
            Back
          </Button>
          <Button size="lg">Continue</Button>
        </ButtonGroup>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Button groups for organizing related actions with consistent spacing.',
      },
    },
  },
}

// =============================================================================
// ACCESSIBILITY EXAMPLES
// =============================================================================

export const AccessibilityExamples: Story = {
  render: () => (
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-medium mb-2">Screen Reader Support</h4>
        <div className="flex gap-4">
          <Button loading aria-label="Processing document analysis">
            Analyze Document
          </Button>
          <IconButton 
            icon={<Download size={16} />} 
            aria-label="Download legal analysis report"
            variant="outline"
          />
        </div>
      </div>
      
      <div>
        <h4 className="text-sm font-medium mb-2">Keyboard Navigation</h4>
        <div className="text-sm text-gray-600 mb-2">
          Try navigating with Tab, Enter, and Space keys
        </div>
        <ButtonGroup>
          <Button onKeyDown={(e) => console.log('Key pressed:', e.key)}>
            Focusable 1
          </Button>
          <Button onKeyDown={(e) => console.log('Key pressed:', e.key)}>
            Focusable 2
          </Button>
          <Button disabled>
            Disabled (Skipped)
          </Button>
          <Button onKeyDown={(e) => console.log('Key pressed:', e.key)}>
            Focusable 3
          </Button>
        </ButtonGroup>
      </div>
      
      <div>
        <h4 className="text-sm font-medium mb-2">High Contrast Mode</h4>
        <div className="text-sm text-gray-600 mb-2">
          Test with high contrast mode enabled in your OS
        </div>
        <div className="flex gap-4">
          <Button>Regular Button</Button>
          <Button variant="outline">Outline Button</Button>
          <Button risk="critical">Critical Risk</Button>
        </div>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Examples demonstrating accessibility features including screen reader support, keyboard navigation, and high contrast mode compatibility.',
      },
    },
  },
}

// =============================================================================
// COMPLEX SCENARIOS
// =============================================================================

export const LegalContextExamples: Story = {
  render: () => (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h4 className="text-sm font-medium mb-2">Document Analysis Actions</h4>
        <div className="bg-gray-50 p-4 rounded-lg space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm">Privacy Policy Analysis</span>
            <Badge risk="medium">Medium Risk</Badge>
          </div>
          <ButtonGroup>
            <Button variant="outline" size="sm">
              View Details
            </Button>
            <Button risk="medium" size="sm">
              Accept Risk
            </Button>
            <Button variant="destructive" size="sm">
              Reject
            </Button>
          </ButtonGroup>
        </div>
      </div>
      
      <div>
        <h4 className="text-sm font-medium mb-2">Bulk Operations</h4>
        <div className="bg-gray-50 p-4 rounded-lg space-y-3">
          <div className="text-sm text-gray-600">5 documents selected</div>
          <ButtonGroup spacing="md">
            <Button 
              leftIcon={<Download size={16} />}
              variant="outline"
            >
              Export All
            </Button>
            <Button 
              leftIcon={<AlertTriangle size={16} />}
              risk="high"
            >
              Flag as Risky
            </Button>
            <Button variant="destructive">
              Delete Selected
            </Button>
          </ButtonGroup>
        </div>
      </div>
      
      <div>
        <h4 className="text-sm font-medium mb-2">Workflow Actions</h4>
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="flex justify-between">
            <Button variant="outline">
              Save Draft
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary">
                Request Review
              </Button>
              <Button 
                risk="critical"
                rightIcon={<ChevronRight size={16} />}
              >
                Submit for Approval
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Real-world examples of buttons in legal tech contexts including document analysis workflows, bulk operations, and approval processes.',
      },
    },
  },
}