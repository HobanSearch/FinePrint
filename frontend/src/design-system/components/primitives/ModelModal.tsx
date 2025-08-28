/**
 * Model-Inspired Modal Component
 * Elegant modals with smooth animations and backdrop blur
 */

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { tokens } from '../../tokens';
import { useTheme } from '../../providers/ThemeProvider';
import { ModelButton } from './ModelButton';

// ============================================================================
// TYPES
// ============================================================================

export interface ModelModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  closable?: boolean;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  showCloseButton?: boolean;
  footer?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const ModelModal: React.FC<ModelModalProps> = ({
  open,
  onClose,
  title,
  description,
  size = 'md',
  closable = true,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  showCloseButton = true,
  footer,
  className,
  children,
}) => {
  const { theme } = useTheme();
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Handle escape key
  useEffect(() => {
    if (!open || !closeOnEscape || !closable) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onClose, closeOnEscape, closable]);

  // Focus management
  useEffect(() => {
    if (open) {
      previousActiveElement.current = document.activeElement as HTMLElement;
      
      // Focus the modal
      setTimeout(() => {
        modalRef.current?.focus();
      }, 100);

      // Prevent body scroll
      document.body.style.overflow = 'hidden';
    } else {
      // Restore focus
      previousActiveElement.current?.focus();
      
      // Restore body scroll
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  // Size configurations
  const sizeStyles = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-full mx-4',
  };

  // Animation variants
  const overlayVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        duration: 0.2,
        ease: tokens.animations.timing.smooth,
      },
    },
    exit: {
      opacity: 0,
      transition: {
        duration: 0.15,
        ease: tokens.animations.timing['smooth-in'],
      },
    },
  };

  const modalVariants = {
    hidden: {
      opacity: 0,
      scale: 0.95,
      y: 20,
    },
    visible: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: {
        duration: 0.25,
        ease: tokens.animations.timing['smooth-out'],
      },
    },
    exit: {
      opacity: 0,
      scale: 0.95,
      y: 20,
      transition: {
        duration: 0.15,
        ease: tokens.animations.timing['smooth-in'],
      },
    },
  };

  // Don't render if not open
  if (!open) return null;

  const modalContent = (
    <AnimatePresence mode="wait">
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Overlay */}
          <motion.div
            className="absolute inset-0 bg-charcoal-950/50 dark:bg-black/70 backdrop-blur-sm"
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={closeOnOverlayClick && closable ? onClose : undefined}
          />

          {/* Modal */}
          <motion.div
            ref={modalRef}
            className={cn(
              'relative w-full',
              'bg-white dark:bg-charcoal-900',
              'rounded-2xl',
              'shadow-2xl',
              'focus:outline-none',
              sizeStyles[size],
              className
            )}
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? 'modal-title' : undefined}
            aria-describedby={description ? 'modal-description' : undefined}
          >
            {/* Header */}
            {(title || (showCloseButton && closable)) && (
              <div className="flex items-start justify-between p-6 pb-0">
                <div className="flex-1">
                  {title && (
                    <h2
                      id="modal-title"
                      className="text-xl font-semibold text-charcoal-900 dark:text-smoke-100"
                    >
                      {title}
                    </h2>
                  )}
                  {description && (
                    <p
                      id="modal-description"
                      className="mt-1 text-sm text-charcoal-600 dark:text-smoke-400"
                    >
                      {description}
                    </p>
                  )}
                </div>
                {showCloseButton && closable && (
                  <button
                    onClick={onClose}
                    className={cn(
                      'ml-4 p-2 rounded-lg',
                      'text-charcoal-500 hover:text-charcoal-700',
                      'dark:text-smoke-500 dark:hover:text-smoke-300',
                      'hover:bg-smoke-100 dark:hover:bg-charcoal-800',
                      'transition-colors duration-150',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-cerulean-500'
                    )}
                    aria-label="Close modal"
                  >
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <path
                        d="M15 5L5 15M5 5L15 15"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                )}
              </div>
            )}

            {/* Content */}
            <div className={cn(
              'p-6',
              title && 'pt-4'
            )}>
              {children}
            </div>

            {/* Footer */}
            {footer && (
              <div className="flex items-center justify-end gap-3 p-6 pt-0">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  // Render into portal
  return createPortal(modalContent, document.body);
};

// ============================================================================
// PRESET MODAL VARIANTS
// ============================================================================

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'destructive';
  loading?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'default',
  loading = false,
}) => {
  const handleConfirm = () => {
    onConfirm();
    if (!loading) {
      onClose();
    }
  };

  return (
    <ModelModal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      closable={!loading}
      footer={
        <>
          <ModelButton
            variant="ghost"
            onClick={onClose}
            disabled={loading}
          >
            {cancelText}
          </ModelButton>
          <ModelButton
            variant={variant === 'destructive' ? 'destructive' : 'primary'}
            onClick={handleConfirm}
            loading={loading}
          >
            {confirmText}
          </ModelButton>
        </>
      }
    >
      {/* Additional content can go here if needed */}
    </ModelModal>
  );
};

interface AlertModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  type?: 'info' | 'success' | 'warning' | 'error';
}

export const AlertModal: React.FC<AlertModalProps> = ({
  open,
  onClose,
  title,
  description,
  type = 'info',
}) => {
  const icons = {
    info: (
      <svg className="w-6 h-6 text-cerulean-500" fill="none" viewBox="0 0 24 24">
        <path
          d="M13 16H12V12H11M12 8H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    success: (
      <svg className="w-6 h-6 text-sage-500" fill="none" viewBox="0 0 24 24">
        <path
          d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    warning: (
      <svg className="w-6 h-6 text-amber-500" fill="none" viewBox="0 0 24 24">
        <path
          d="M12 9V13M12 17H12.01M12 3L2 20H22L12 3Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    error: (
      <svg className="w-6 h-6 text-crimson-500" fill="none" viewBox="0 0 24 24">
        <path
          d="M12 8V12M12 16H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  };

  return (
    <ModelModal
      open={open}
      onClose={onClose}
      size="sm"
      footer={
        <ModelButton variant="primary" onClick={onClose}>
          OK
        </ModelButton>
      }
    >
      <div className="flex items-start gap-4">
        <div className="shrink-0 w-12 h-12 rounded-xl bg-smoke-100 dark:bg-charcoal-800 flex items-center justify-center">
          {icons[type]}
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-charcoal-900 dark:text-smoke-100">
            {title}
          </h3>
          {description && (
            <p className="mt-1 text-sm text-charcoal-600 dark:text-smoke-400">
              {description}
            </p>
          )}
        </div>
      </div>
    </ModelModal>
  );
};