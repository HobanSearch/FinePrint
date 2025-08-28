const { configureAxe } = require('jest-axe');

// Configure axe-core for WCAG 2.1 AA compliance testing
const axe = configureAxe({
  rules: {
    // WCAG 2.1 AA Level rules
    'color-contrast': { enabled: true },
    'color-contrast-enhanced': { enabled: false }, // AAA level, disabled for AA
    'focus-order-semantics': { enabled: true },
    'hidden-content': { enabled: true },
    'label-title-only': { enabled: true },
    'link-in-text-block': { enabled: true },
    'p-as-heading': { enabled: true },
    'table-duplicate-name': { enabled: true },
    'td-has-header': { enabled: true },
    'th-has-data-cells': { enabled: true },
    'valid-lang': { enabled: true },
    'video-caption': { enabled: true },

    // Level A rules (baseline)
    'area-alt': { enabled: true },
    'aria-allowed-attr': { enabled: true },
    'aria-allowed-role': { enabled: true },
    'aria-command-name': { enabled: true },
    'aria-dialog-name': { enabled: true },
    'aria-hidden-body': { enabled: true },
    'aria-hidden-focus': { enabled: true },
    'aria-input-field-name': { enabled: true },
    'aria-meter-name': { enabled: true },
    'aria-progressbar-name': { enabled: true },
    'aria-required-attr': { enabled: true },
    'aria-required-children': { enabled: true },
    'aria-required-parent': { enabled: true },
    'aria-roledescription': { enabled: true },
    'aria-roles': { enabled: true },
    'aria-toggle-field-name': { enabled: true },
    'aria-tooltip-name': { enabled: true },
    'aria-valid-attr': { enabled: true },
    'aria-valid-attr-value': { enabled: true },
    'button-name': { enabled: true },
    'bypass': { enabled: true },
    'document-title': { enabled: true },
    'duplicate-id': { enabled: true },
    'duplicate-id-active': { enabled: true },
    'duplicate-id-aria': { enabled: true },
    'form-field-multiple-labels': { enabled: true },
    'frame-title': { enabled: true },
    'html-has-lang': { enabled: true },
    'html-lang-valid': { enabled: true },
    'image-alt': { enabled: true },
    'input-button-name': { enabled: true },
    'input-image-alt': { enabled: true },
    'label': { enabled: true },
    'link-name': { enabled: true },
    'list': { enabled: true },
    'listitem': { enabled: true },
    'marquee': { enabled: true },
    'meta-refresh': { enabled: true },
    'meta-viewport': { enabled: true },
    'nested-interactive': { enabled: true },
    'no-autoplay-audio': { enabled: true },
    'object-alt': { enabled: true },
    'role-img-alt': { enabled: true },
    'scrollable-region-focusable': { enabled: true },
    'select-name': { enabled: true },
    'server-side-image-map': { enabled: true },
    'svg-img-alt': { enabled: true },
    'tabindex': { enabled: true },
    'table-fake-caption': { enabled: true },
    'td-headers-attr': { enabled: true },
    'th-has-data-cells': { enabled: true },
    'valid-lang': { enabled: true },
    'video-description': { enabled: true }
  },
  
  // Tags to include (WCAG 2.1 AA)
  tags: ['wcag2a', 'wcag2aa', 'wcag21aa'],
  
  // Results types to include
  resultTypes: ['violations', 'incomplete', 'inapplicable', 'passes'],
  
  // Global configuration
  reporter: 'v2',
  runOnly: {
    type: 'tag',
    values: ['wcag2a', 'wcag2aa', 'wcag21aa']
  },
  
  // Environment setup
  environment: {
    // Disable animations for consistent testing
    prefers_reduced_motion: 'reduce'
  }
});

module.exports = axe;