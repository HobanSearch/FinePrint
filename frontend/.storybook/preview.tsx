import type { Preview } from '@storybook/react'
import { themes } from '@storybook/theming'
import { ThemeProvider } from '../src/design-system/providers/ThemeProvider'
import { tokens } from '../src/design-system/tokens'
import '../src/index.css'

// Import all design system themes
import { 
  lightTheme, 
  darkTheme, 
  highContrastLightTheme, 
  highContrastDarkTheme 
} from '../src/design-system/theme'

const preview: Preview = {
  parameters: {
    actions: { argTypesRegex: '^on[A-Z].*' },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
    docs: {
      theme: themes.light,
      toc: {
        contentsSelector: '.sbdocs-content',
        headingSelector: 'h1, h2, h3',
        ignoreSelector: '#storybook-docs',
        title: 'Table of Contents',
        disable: false,
        unsafeTocbotOptions: {
          orderedList: false,
        },
      },
    },
    backgrounds: {
      default: 'light',
      values: [
        {
          name: 'light',
          value: lightTheme.colors.background.primary,
        },
        {
          name: 'dark',
          value: darkTheme.colors.background.primary,
        },
        {
          name: 'high-contrast-light',
          value: highContrastLightTheme.colors.background.primary,
        },
        {
          name: 'high-contrast-dark',
          value: highContrastDarkTheme.colors.background.primary,
        },
      ],
    },
    viewport: {
      viewports: {
        mobile: {
          name: 'Mobile',
          styles: { width: '375px', height: '667px' },
        },
        tablet: {
          name: 'Tablet',
          styles: { width: '768px', height: '1024px' },
        },
        desktop: {
          name: 'Desktop',
          styles: { width: '1200px', height: '800px' },
        },
        extension: {
          name: 'Extension Widget',
          styles: { width: '320px', height: '480px' },
        },
      },
    },
    a11y: {
      config: {
        rules: [
          {
            id: 'color-contrast',
            options: { level: 'AA' },
          },
          {
            id: 'focus-order-semantics',
            enabled: true,
          },
          {
            id: 'keyboard',
            enabled: true,
          },
        ],
      },
    },
  },

  globalTypes: {
    theme: {
      name: 'Theme',
      description: 'Global theme for components',
      defaultValue: 'light',
      toolbar: {
        icon: 'paintbrush',
        items: [
          { value: 'light', title: 'Light' },
          { value: 'dark', title: 'Dark' },
          { value: 'high-contrast-light', title: 'High Contrast Light' },
          { value: 'high-contrast-dark', title: 'High Contrast Dark' },
        ],
        showName: true,
        dynamicTitle: true,
      },
    },
    platform: {
      name: 'Platform',
      description: 'Target platform for components',
      defaultValue: 'web',
      toolbar: {
        icon: 'browser',
        items: [
          { value: 'web', title: 'Web' },
          { value: 'mobile', title: 'Mobile' },
          { value: 'extension', title: 'Extension' },
        ],
        showName: true,
      },
    },
    reducedMotion: {
      name: 'Reduced Motion',
      description: 'Simulate reduced motion preference',
      defaultValue: false,
      toolbar: {
        icon: 'accessibility',
        items: [
          { value: false, title: 'Motion Enabled' },
          { value: true, title: 'Reduced Motion' },
        ],
      },
    },
  },

  decorators: [
    (Story, context) => {
      const { theme: themeName } = context.globals
      const { reducedMotion } = context.globals

      // Apply reduced motion class to document
      React.useEffect(() => {
        if (reducedMotion) {
          document.documentElement.classList.add('reduce-motion')
        } else {
          document.documentElement.classList.remove('reduce-motion')
        }
      }, [reducedMotion])

      return (
        <ThemeProvider 
          defaultTheme={themeName}
          enableSystemTheme={false}
          respectReducedMotion={reducedMotion}
        >
          <div className="p-4">
            <Story />
          </div>
        </ThemeProvider>
      )
    },
  ],
}

export default preview