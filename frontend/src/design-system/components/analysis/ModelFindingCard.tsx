/**
 * Model-Inspired Finding Card Component
 * Elegant cards for displaying document analysis findings
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { tokens } from '../../tokens';
import { useTheme } from '../../providers/ThemeProvider';
import { ModelCard } from '../primitives/ModelCard';
import { MiniRiskIndicator } from '../visualizations/ModelRiskGauge';
import { ModelButton } from '../primitives/ModelButton';

// ============================================================================
// TYPES
// ============================================================================

export interface Finding {
  id: string;
  title: string;
  description: string;
  clause: string;
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  riskScore: number;
  location: {
    section: string;
    paragraph: number;
  };
  explanation: string;
  recommendations: string[];
}

export interface ModelFindingCardProps {
  finding: Finding;
  expanded?: boolean;
  onToggle?: () => void;
  onAction?: (action: string) => void;
  className?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const ModelFindingCard: React.FC<ModelFindingCardProps> = ({
  finding,
  expanded: controlledExpanded,
  onToggle,
  onAction,
  className,
}) => {
  const { theme } = useTheme();
  const [internalExpanded, setInternalExpanded] = useState(false);
  
  // Use controlled state if provided, otherwise use internal state
  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;
  const handleToggle = () => {
    if (onToggle) {
      onToggle();
    } else {
      setInternalExpanded(!internalExpanded);
    }
  };

  // Severity colors
  const severityColors = {
    low: {
      bg: 'bg-sage-50 dark:bg-sage-950/20',
      border: 'border-sage-200 dark:border-sage-800',
      text: 'text-sage-700 dark:text-sage-300',
      icon: 'text-sage-500',
    },
    medium: {
      bg: 'bg-amber-50 dark:bg-amber-950/20',
      border: 'border-amber-200 dark:border-amber-800',
      text: 'text-amber-700 dark:text-amber-300',
      icon: 'text-amber-500',
    },
    high: {
      bg: 'bg-crimson-50 dark:bg-crimson-950/20',
      border: 'border-crimson-200 dark:border-crimson-800',
      text: 'text-crimson-700 dark:text-crimson-300',
      icon: 'text-crimson-500',
    },
    critical: {
      bg: 'bg-crimson-100 dark:bg-crimson-950/30',
      border: 'border-crimson-300 dark:border-crimson-700',
      text: 'text-crimson-800 dark:text-crimson-200',
      icon: 'text-crimson-600',
    },
  };

  const severity = severityColors[finding.severity];

  return (
    <ModelCard
      variant="outlined"
      padding="none"
      className={cn(
        'overflow-hidden transition-all duration-300',
        severity.border,
        className
      )}
    >
      {/* Header */}
      <div
        className={cn(
          'p-4 cursor-pointer select-none',
          'hover:bg-smoke-50 dark:hover:bg-charcoal-800/50',
          'transition-colors duration-150'
        )}
        onClick={handleToggle}
      >
        <div className="flex items-start gap-4">
          {/* Risk indicator */}
          <MiniRiskIndicator
            score={finding.riskScore}
            size="xs"
            className="shrink-0"
          />

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <h3 className="font-semibold text-charcoal-900 dark:text-smoke-100">
                  {finding.title}
                </h3>
                <p className="mt-1 text-sm text-charcoal-600 dark:text-smoke-400 line-clamp-2">
                  {finding.description}
                </p>
              </div>

              {/* Expand/collapse indicator */}
              <motion.svg
                className="shrink-0 w-5 h-5 text-charcoal-400 dark:text-smoke-600 mt-1"
                fill="none"
                viewBox="0 0 20 20"
                animate={{ rotate: isExpanded ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <path
                  d="M5 7.5L10 12.5L15 7.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </motion.svg>
            </div>

            {/* Metadata */}
            <div className="flex items-center gap-4 mt-3 text-xs text-charcoal-500 dark:text-smoke-500">
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 14 14">
                  <path
                    d="M7 1V7L10 10M13 7C13 10.3137 10.3137 13 7 13C3.68629 13 1 10.3137 1 7C1 3.68629 3.68629 1 7 1C10.3137 1 13 3.68629 13 7Z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {finding.location.section}
              </span>
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 14 14">
                  <path
                    d="M3 1.75H11C11.6904 1.75 12.25 2.30964 12.25 3V11C12.25 11.6904 11.6904 12.25 11 12.25H3C2.30964 12.25 1.75 11.6904 1.75 11V3C1.75 2.30964 2.30964 1.75 3 1.75Z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M4.75 5.25H9.25M4.75 7.75H9.25M4.75 10.25H7"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
                Paragraph {finding.location.paragraph}
              </span>
              <span className={cn(
                'px-2 py-0.5 rounded-full text-xs font-medium',
                severity.bg,
                severity.text
              )}>
                {finding.category}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Expanded content */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: {
                duration: 0.3,
                ease: tokens.animations.timing.smooth,
              },
              opacity: {
                duration: 0.2,
                ease: tokens.animations.timing.smooth,
              },
            }}
          >
            <div className="border-t border-smoke-200 dark:border-charcoal-800">
              {/* Clause quote */}
              <div className="p-4 bg-smoke-50 dark:bg-charcoal-800/50">
                <h4 className="text-xs font-medium uppercase tracking-wider text-charcoal-500 dark:text-smoke-500 mb-2">
                  Original Clause
                </h4>
                <blockquote className="relative pl-4 border-l-4 border-smoke-300 dark:border-charcoal-700">
                  <p className="text-sm text-charcoal-700 dark:text-smoke-300 italic">
                    "{finding.clause}"
                  </p>
                </blockquote>
              </div>

              {/* Explanation */}
              <div className="p-4">
                <h4 className="text-sm font-semibold text-charcoal-900 dark:text-smoke-100 mb-2">
                  Why this matters
                </h4>
                <p className="text-sm text-charcoal-600 dark:text-smoke-400">
                  {finding.explanation}
                </p>
              </div>

              {/* Recommendations */}
              {finding.recommendations.length > 0 && (
                <div className="p-4 pt-0">
                  <h4 className="text-sm font-semibold text-charcoal-900 dark:text-smoke-100 mb-2">
                    Recommendations
                  </h4>
                  <ul className="space-y-2">
                    {finding.recommendations.map((recommendation, index) => (
                      <li
                        key={index}
                        className="flex items-start gap-2 text-sm text-charcoal-600 dark:text-smoke-400"
                      >
                        <svg
                          className={cn('w-4 h-4 shrink-0 mt-0.5', severity.icon)}
                          fill="none"
                          viewBox="0 0 16 16"
                        >
                          <path
                            d="M6 8L8 10L10 6M14 8C14 11.3137 11.3137 14 8 14C4.68629 14 4 11.3137 4 8C4 4.68629 4.68629 2 8 2C11.3137 2 14 4.68629 14 8Z"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        <span>{recommendation}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 p-4 pt-0">
                <ModelButton
                  variant="ghost"
                  size="sm"
                  onClick={() => onAction?.('dismiss')}
                >
                  Dismiss
                </ModelButton>
                <ModelButton
                  variant="ghost"
                  size="sm"
                  onClick={() => onAction?.('report')}
                >
                  Report Issue
                </ModelButton>
                <ModelButton
                  variant="primary"
                  size="sm"
                  onClick={() => onAction?.('learn')}
                >
                  Learn More
                </ModelButton>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </ModelCard>
  );
};

// ============================================================================
// FINDING GROUP
// ============================================================================

interface FindingGroupProps {
  title: string;
  findings: Finding[];
  onAction?: (findingId: string, action: string) => void;
  className?: string;
}

export const FindingGroup: React.FC<FindingGroupProps> = ({
  title,
  findings,
  onAction,
  className,
}) => {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const toggleItem = (id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Calculate aggregate stats
  const stats = findings.reduce(
    (acc, finding) => {
      acc[finding.severity] = (acc[finding.severity] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className={className}>
      {/* Group header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-charcoal-900 dark:text-smoke-100">
          {title}
        </h2>
        <div className="flex items-center gap-3 text-sm">
          {stats.critical > 0 && (
            <span className="flex items-center gap-1.5 text-crimson-600 dark:text-crimson-400">
              <span className="w-2 h-2 rounded-full bg-current" />
              {stats.critical} Critical
            </span>
          )}
          {stats.high > 0 && (
            <span className="flex items-center gap-1.5 text-crimson-500 dark:text-crimson-400">
              <span className="w-2 h-2 rounded-full bg-current" />
              {stats.high} High
            </span>
          )}
          {stats.medium > 0 && (
            <span className="flex items-center gap-1.5 text-amber-500 dark:text-amber-400">
              <span className="w-2 h-2 rounded-full bg-current" />
              {stats.medium} Medium
            </span>
          )}
          {stats.low > 0 && (
            <span className="flex items-center gap-1.5 text-sage-500 dark:text-sage-400">
              <span className="w-2 h-2 rounded-full bg-current" />
              {stats.low} Low
            </span>
          )}
        </div>
      </div>

      {/* Findings list */}
      <div className="space-y-3">
        {findings.map((finding) => (
          <ModelFindingCard
            key={finding.id}
            finding={finding}
            expanded={expandedItems.has(finding.id)}
            onToggle={() => toggleItem(finding.id)}
            onAction={(action) => onAction?.(finding.id, action)}
          />
        ))}
      </div>
    </div>
  );
};