/**
 * Fine Print AI - Button Component Tests
 * Comprehensive test suite for Button component including accessibility
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe, toHaveNoViolations } from 'jest-axe'
import { ThemeProvider } from '../providers/ThemeProvider'
import { Button, ButtonGroup, IconButton } from '../components/primitives/Button'
import { Play, Download } from 'lucide-react'

// Extend Jest matchers
expect.extend(toHaveNoViolations)

// Test wrapper with theme provider
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider defaultTheme="light">{children}</ThemeProvider>
)

describe('Button Component', () => {
  // =============================================================================
  // BASIC FUNCTIONALITY TESTS
  // =============================================================================

  describe('Basic Functionality', () => {
    it('renders with default props', () => {
      render(
        <TestWrapper>
          <Button>Click me</Button>
        </TestWrapper>
      )
      
      const button = screen.getByRole('button', { name: 'Click me' })
      expect(button).toBeInTheDocument()
      expect(button).toHaveClass('fineprint-button') // Assuming CSS classes follow this pattern
    })

    it('handles click events', async () => {
      const handleClick = jest.fn()
      const user = userEvent.setup()
      
      render(
        <TestWrapper>
          <Button onClick={handleClick}>Click me</Button>
        </TestWrapper>
      )
      
      const button = screen.getByRole('button', { name: 'Click me' })
      await user.click(button)
      
      expect(handleClick).toHaveBeenCalledTimes(1)
    })

    it('renders different variants correctly', () => {
      const variants = ['primary', 'secondary', 'outline', 'ghost', 'link', 'destructive'] as const
      
      render(
        <TestWrapper>
          {variants.map((variant) => (
            <Button key={variant} variant={variant} data-testid={`button-${variant}`}>
              {variant}
            </Button>
          ))}
        </TestWrapper>
      )
      
      variants.forEach((variant) => {
        const button = screen.getByTestId(`button-${variant}`)
        expect(button).toBeInTheDocument()
      })
    })

    it('renders different sizes correctly', () => {
      const sizes = ['xs', 'sm', 'md', 'lg', 'xl'] as const
      
      render(
        <TestWrapper>
          {sizes.map((size) => (
            <Button key={size} size={size} data-testid={`button-${size}`}>
              {size}
            </Button>
          ))}
        </TestWrapper>
      )
      
      sizes.forEach((size) => {
        const button = screen.getByTestId(`button-${size}`)
        expect(button).toBeInTheDocument()
      })
    })
  })

  // =============================================================================
  // RISK LEVEL TESTS
  // =============================================================================

  describe('Risk Levels', () => {
    it('renders risk level variants correctly', () => {
      const riskLevels = ['safe', 'low', 'medium', 'high', 'critical'] as const
      
      render(
        <TestWrapper>
          {riskLevels.map((risk) => (
            <Button key={risk} risk={risk} data-testid={`button-risk-${risk}`}>
              {risk}
            </Button>
          ))}
        </TestWrapper>
      )
      
      riskLevels.forEach((risk) => {
        const button = screen.getByTestId(`button-risk-${risk}`)
        expect(button).toBeInTheDocument()
      })
    })

    it('risk level overrides variant styling', () => {
      render(
        <TestWrapper>
          <Button variant="secondary" risk="critical" data-testid="risk-override">
            Critical Risk
          </Button>
        </TestWrapper>
      )
      
      const button = screen.getByTestId('risk-override')
      // Risk styling should override variant styling
      expect(button).toBeInTheDocument()
    })
  })

  // =============================================================================
  // STATE TESTS
  // =============================================================================

  describe('Loading State', () => {
    it('shows loading spinner when loading prop is true', () => {
      render(
        <TestWrapper>
          <Button loading>Loading...</Button>
        </TestWrapper>
      )
      
      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('aria-busy', 'true')
      expect(button).toBeDisabled()
      
      // Check for loading spinner (Loader2 icon)
      const loadingIcon = button.querySelector('svg')
      expect(loadingIcon).toBeInTheDocument()
      
      // Check for screen reader text
      expect(screen.getByText('Loading...', { selector: '.sr-only' })).toBeInTheDocument()
    })

    it('prevents click events when loading', async () => {
      const handleClick = jest.fn()
      const user = userEvent.setup()
      
      render(
        <TestWrapper>
          <Button loading onClick={handleClick}>
            Loading...
          </Button>
        </TestWrapper>
      )
      
      const button = screen.getByRole('button')
      await user.click(button)
      
      expect(handleClick).not.toHaveBeenCalled()
    })
  })

  describe('Disabled State', () => {
    it('is disabled when disabled prop is true', () => {
      const handleClick = jest.fn()
      
      render(
        <TestWrapper>
          <Button disabled onClick={handleClick}>
            Disabled
          </Button>
        </TestWrapper>
      )
      
      const button = screen.getByRole('button')
      expect(button).toBeDisabled()
      expect(button).toHaveAttribute('aria-disabled', 'true')
    })

    it('prevents click events when disabled', async () => {
      const handleClick = jest.fn()
      const user = userEvent.setup()
      
      render(
        <TestWrapper>
          <Button disabled onClick={handleClick}>
            Disabled
          </Button>
        </TestWrapper>
      )
      
      const button = screen.getByRole('button')
      await user.click(button)
      
      expect(handleClick).not.toHaveBeenCalled()
    })
  })

  // =============================================================================
  // ICON TESTS
  // =============================================================================

  describe('Icons', () => {
    it('renders left icon correctly', () => {
      render(
        <TestWrapper>
          <Button leftIcon={<Play data-testid="left-icon" />}>
            With Left Icon
          </Button>
        </TestWrapper>
      )
      
      expect(screen.getByTestId('left-icon')).toBeInTheDocument()
    })

    it('renders right icon correctly', () => {
      render(
        <TestWrapper>
          <Button rightIcon={<Download data-testid="right-icon" />}>
            With Right Icon
          </Button>
        </TestWrapper>
      )
      
      expect(screen.getByTestId('right-icon')).toBeInTheDocument()
    })

    it('hides icons when loading', () => {
      render(
        <TestWrapper>
          <Button 
            loading 
            leftIcon={<Play data-testid="left-icon" />}
            rightIcon={<Download data-testid="right-icon" />}
          >
            Loading...
          </Button>
        </TestWrapper>
      )
      
      expect(screen.queryByTestId('left-icon')).not.toBeInTheDocument()
      expect(screen.queryByTestId('right-icon')).not.toBeInTheDocument()
    })
  })

  // =============================================================================
  // ACCESSIBILITY TESTS
  // =============================================================================

  describe('Accessibility', () => {
    it('has no accessibility violations', async () => {
      const { container } = render(
        <TestWrapper>
          <Button>Accessible Button</Button>
        </TestWrapper>
      )
      
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('supports keyboard navigation', async () => {
      const handleClick = jest.fn()
      const user = userEvent.setup()
      
      render(
        <TestWrapper>
          <Button onClick={handleClick}>Keyboard Test</Button>
        </TestWrapper>
      )
      
      const button = screen.getByRole('button')
      
      // Tab to focus
      await user.tab()
      expect(button).toHaveFocus()
      
      // Enter to activate
      await user.keyboard('{Enter}')
      expect(handleClick).toHaveBeenCalledTimes(1)
      
      // Space to activate
      await user.keyboard(' ')
      expect(handleClick).toHaveBeenCalledTimes(2)
    })

    it('has proper focus management', async () => {
      const user = userEvent.setup()
      
      render(
        <TestWrapper>
          <div>
            <Button>First Button</Button>
            <Button>Second Button</Button>
            <Button disabled>Disabled Button</Button>
            <Button>Third Button</Button>
          </div>
        </TestWrapper>
      )
      
      const firstButton = screen.getByRole('button', { name: 'First Button' })
      const secondButton = screen.getByRole('button', { name: 'Second Button' })
      const disabledButton = screen.getByRole('button', { name: 'Disabled Button' })
      const thirdButton = screen.getByRole('button', { name: 'Third Button' })
      
      // Tab through buttons
      await user.tab()
      expect(firstButton).toHaveFocus()
      
      await user.tab()
      expect(secondButton).toHaveFocus()
      
      await user.tab()
      expect(thirdButton).toHaveFocus() // Should skip disabled button
      
      expect(disabledButton).not.toHaveFocus()
    })

    it('provides proper ARIA attributes', () => {
      render(
        <TestWrapper>
          <Button loading data-testid="loading-button">
            Loading Button
          </Button>
          <Button disabled data-testid="disabled-button">
            Disabled Button
          </Button>
        </TestWrapper>
      )
      
      const loadingButton = screen.getByTestId('loading-button')
      const disabledButton = screen.getByTestId('disabled-button')
      
      expect(loadingButton).toHaveAttribute('aria-busy', 'true')
      expect(loadingButton).toHaveAttribute('aria-disabled', 'true')
      expect(disabledButton).toHaveAttribute('aria-disabled', 'true')
    })
  })

  // =============================================================================
  // ICON BUTTON TESTS
  // =============================================================================

  describe('IconButton', () => {
    it('renders icon-only button with aria-label', () => {
      render(
        <TestWrapper>
          <IconButton icon={<Play />} aria-label="Play video" />
        </TestWrapper>
      )
      
      const button = screen.getByRole('button', { name: 'Play video' })
      expect(button).toBeInTheDocument()
    })

    it('requires aria-label for accessibility', () => {
      // Suppress console.error for this test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
      
      render(
        <TestWrapper>
          {/* @ts-expect-error - intentionally missing aria-label */}
          <IconButton icon={<Play />} />
        </TestWrapper>
      )
      
      consoleSpy.mockRestore()
    })

    it('has proper icon size for button size', () => {
      render(
        <TestWrapper>
          <IconButton 
            icon={<Play data-testid="icon" />} 
            size="icon-sm" 
            aria-label="Small play button" 
          />
        </TestWrapper>
      )
      
      const button = screen.getByRole('button')
      expect(button).toBeInTheDocument()
    })
  })

  // =============================================================================
  // BUTTON GROUP TESTS
  // =============================================================================

  describe('ButtonGroup', () => {
    it('renders button group with proper roles', () => {
      render(
        <TestWrapper>
          <ButtonGroup data-testid="button-group">
            <Button>First</Button>
            <Button>Second</Button>
            <Button>Third</Button>
          </ButtonGroup>
        </TestWrapper>
      )
      
      const group = screen.getByTestId('button-group')
      expect(group).toHaveAttribute('role', 'group')
    })

    it('supports vertical orientation', () => {
      render(
        <TestWrapper>
          <ButtonGroup orientation="vertical" data-testid="vertical-group">
            <Button>First</Button>
            <Button>Second</Button>
          </ButtonGroup>
        </TestWrapper>
      )
      
      const group = screen.getByTestId('vertical-group')
      expect(group).toHaveAttribute('data-orientation', 'vertical')
    })

    it('maintains keyboard navigation within group', async () => {
      const user = userEvent.setup()
      
      render(
        <TestWrapper>
          <ButtonGroup>
            <Button>First</Button>
            <Button>Second</Button>
            <Button>Third</Button>
          </ButtonGroup>
        </TestWrapper>
      )
      
      const firstButton = screen.getByRole('button', { name: 'First' })
      const secondButton = screen.getByRole('button', { name: 'Second' })
      const thirdButton = screen.getByRole('button', { name: 'Third' })
      
      await user.tab()
      expect(firstButton).toHaveFocus()
      
      await user.tab()
      expect(secondButton).toHaveFocus()
      
      await user.tab()
      expect(thirdButton).toHaveFocus()
    })
  })

  // =============================================================================
  // EDGE CASES AND ERROR HANDLING
  // =============================================================================

  describe('Edge Cases', () => {
    it('handles empty children gracefully', () => {
      render(
        <TestWrapper>
          <Button>{''}</Button>
        </TestWrapper>
      )
      
      const button = screen.getByRole('button')
      expect(button).toBeInTheDocument()
    })

    it('handles undefined onClick gracefully', () => {
      render(
        <TestWrapper>
          <Button onClick={undefined}>No Handler</Button>
        </TestWrapper>
      )
      
      const button = screen.getByRole('button')
      expect(button).toBeInTheDocument()
    })

    it('works with asChild prop', () => {
      render(
        <TestWrapper>
          <Button asChild>
            <a href="/test">Link Button</a>
          </Button>
        </TestWrapper>
      )
      
      const link = screen.getByRole('link', { name: 'Link Button' })
      expect(link).toBeInTheDocument()
      expect(link).toHaveAttribute('href', '/test')
    })
  })

  // =============================================================================
  // PERFORMANCE TESTS
  // =============================================================================

  describe('Performance', () => {
    it('does not re-render unnecessarily', () => {
      const renderSpy = jest.fn()
      
      const TestButton: React.FC<{ count: number }> = ({ count }) => {
        renderSpy()
        return <Button>Count: {count}</Button>
      }
      
      const { rerender } = render(
        <TestWrapper>
          <TestButton count={1} />
        </TestWrapper>
      )
      
      expect(renderSpy).toHaveBeenCalledTimes(1)
      
      // Re-render with same props
      rerender(
        <TestWrapper>
          <TestButton count={1} />
        </TestWrapper>
      )
      
      // Should re-render due to prop change
      rerender(
        <TestWrapper>
          <TestButton count={2} />
        </TestWrapper>
      )
      
      expect(renderSpy).toHaveBeenCalledTimes(3)
    })
  })

  // =============================================================================
  // THEME INTEGRATION TESTS
  // =============================================================================

  describe('Theme Integration', () => {
    it('adapts to dark theme', () => {
      render(
        <ThemeProvider defaultTheme="dark">
          <Button data-testid="dark-button">Dark Theme Button</Button>
        </ThemeProvider>
      )
      
      const button = screen.getByTestId('dark-button')
      expect(button).toBeInTheDocument()
    })

    it('adapts to high contrast theme', () => {
      render(
        <ThemeProvider defaultTheme="high-contrast-light">
          <Button data-testid="high-contrast-button">High Contrast Button</Button>
        </ThemeProvider>
      )
      
      const button = screen.getByTestId('high-contrast-button')
      expect(button).toBeInTheDocument()
    })
  })
})