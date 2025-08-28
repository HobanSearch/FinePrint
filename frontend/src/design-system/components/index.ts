/**
 * Fine Print AI - Model-Inspired Design System Components
 * Central export for all design system components
 */

// Primitive Components
export { ModelButton, PrimaryButton, SecondaryButton, GhostButton, DestructiveButton, ButtonGroup } from './primitives/ModelButton';
export type { ModelButtonProps } from './primitives/ModelButton';

export { ModelInput, SearchInput, PasswordInput } from './primitives/ModelInput';
export type { ModelInputProps } from './primitives/ModelInput';

export { ModelCard, CardHeader, CardContent, CardFooter, StatCard, ActionCard } from './primitives/ModelCard';
export type { ModelCardProps } from './primitives/ModelCard';

export { ModelModal, ConfirmModal, AlertModal } from './primitives/ModelModal';
export type { ModelModalProps } from './primitives/ModelModal';

// Visualization Components
export { ModelRiskGauge, MiniRiskIndicator, RiskBar } from './visualizations/ModelRiskGauge';
export type { ModelRiskGaugeProps } from './visualizations/ModelRiskGauge';

// Analysis Components
export { ModelFindingCard, FindingGroup } from './analysis/ModelFindingCard';
export type { ModelFindingCardProps, Finding } from './analysis/ModelFindingCard';

// Re-export existing components (maintain compatibility)
export { default as Button } from './primitives/Button';
export { default as Card } from './primitives/Card';
export { default as Badge } from './primitives/Badge';

// Re-export risk visualization
export { default as RiskVisualization } from './visualizations/RiskVisualization';

// Re-export accessibility components
export * from './accessibility';

// Design System Documentation
export const MODEL_DESIGN_SYSTEM = {
  name: 'Fine Print AI Model-Inspired Design System',
  version: '1.0.0',
  description: 'A sophisticated, minimal design system inspired by Claude\'s interface',
  principles: [
    'Minimalist Sophistication',
    'Intelligent Hierarchy',
    'Trustworthy Aesthetics',
    'Accessible Design',
    'Smooth Interactions'
  ],
  colors: {
    primary: 'Cerulean (#0ba5ec)',
    success: 'Sage (#22c55e)',
    warning: 'Amber (#f59e0b)',
    danger: 'Crimson (#ef4444)',
    neutrals: 'Charcoal, Graphite, Smoke'
  }
};