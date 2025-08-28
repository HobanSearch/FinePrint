import React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { Eye, EyeOff, AlertCircle } from 'lucide-react'

const inputVariants = cva(
  'flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200',
  {
    variants: {
      variant: {
        default: 'border-input hover:border-guardian-300 focus-visible:border-guardian-500',
        error: 'border-danger-500 focus-visible:border-danger-500 focus-visible:ring-danger-500/20',
        success: 'border-sage-500 focus-visible:border-sage-500 focus-visible:ring-sage-500/20',
        warning: 'border-alert-500 focus-visible:border-alert-500 focus-visible:ring-alert-500/20',
      },
      size: {
        sm: 'h-8 px-2 text-xs',
        default: 'h-10 px-3',
        lg: 'h-12 px-4 text-base',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement>,
    VariantProps<typeof inputVariants> {
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  error?: string
  helperText?: string
  label?: string
  required?: boolean
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ 
    className, 
    variant, 
    size, 
    type = 'text',
    leftIcon,
    rightIcon,
    error,
    helperText,
    label,
    required,
    id,
    ...props 
  }, ref) => {
    const [showPassword, setShowPassword] = React.useState(false)
    const inputId = id || React.useId()
    const isPassword = type === 'password'
    const inputType = isPassword && showPassword ? 'text' : type
    const hasError = !!error
    const inputVariant = hasError ? 'error' : variant

    return (
      <div className="w-full space-y-2">
        {label && (
          <label 
            htmlFor={inputId}
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            {label}
            {required && <span className="ml-1 text-danger-500">*</span>}
          </label>
        )}
        
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {leftIcon}
            </div>
          )}
          
          <input
            id={inputId}
            type={inputType}
            className={cn(
              inputVariants({ variant: inputVariant, size, className }),
              leftIcon && 'pl-10',
              (rightIcon || isPassword) && 'pr-10'
            )}
            ref={ref}
            {...props}
          />
          
          {isPassword && (
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          )}
          
          {rightIcon && !isPassword && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {rightIcon}
            </div>
          )}
        </div>
        
        {(error || helperText) && (
          <div className={cn(
            'flex items-center gap-1 text-xs',
            hasError ? 'text-danger-600' : 'text-muted-foreground'
          )}>
            {hasError && <AlertCircle className="h-3 w-3 flex-shrink-0" />}
            <span>{error || helperText}</span>
          </div>
        )}
      </div>
    )
  }
)
Input.displayName = 'Input'

export { Input, inputVariants }