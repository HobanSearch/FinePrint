import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ExclamationTriangleIcon,
  ShieldExclamationIcon,
  InformationCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClipboardDocumentIcon,
  LightBulbIcon
} from '@heroicons/react/24/outline'
import clsx from 'clsx'

interface Finding {
  id: string
  category: string
  title: string
  description: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  confidenceScore?: number
  clauseText?: string
  suggestion?: string
  position?: number
}

interface FindingCardProps {
  finding: Finding
  index: number
  isExpanded?: boolean
  onToggle?: () => void
  showClauseText?: boolean
  className?: string
}

const FindingCard: React.FC<FindingCardProps> = ({
  finding,
  index,
  isExpanded = false,
  onToggle,
  showClauseText = true,
  className
}) => {
  const [isLocalExpanded, setIsLocalExpanded] = useState(false)
  
  const expanded = onToggle ? isExpanded : isLocalExpanded
  const handleToggle = onToggle || (() => setIsLocalExpanded(!isLocalExpanded))

  // Severity configuration
  const severityConfig = {
    low: {
      icon: InformationCircleIcon,
      color: 'blue',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      textColor: 'text-blue-800',
      iconColor: 'text-blue-600',
      badgeColor: 'bg-blue-100 text-blue-800',
      priority: 1
    },
    medium: {
      icon: ExclamationTriangleIcon,
      color: 'yellow',
      bgColor: 'bg-yellow-50',
      borderColor: 'border-yellow-200',
      textColor: 'text-yellow-800',
      iconColor: 'text-yellow-600',
      badgeColor: 'bg-yellow-100 text-yellow-800',
      priority: 2
    },
    high: {
      icon: ExclamationTriangleIcon,
      color: 'orange',
      bgColor: 'bg-orange-50',
      borderColor: 'border-orange-200',
      textColor: 'text-orange-800',
      iconColor: 'text-orange-600',
      badgeColor: 'bg-orange-100 text-orange-800',
      priority: 3
    },
    critical: {
      icon: ShieldExclamationIcon,
      color: 'red',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      textColor: 'text-red-800',
      iconColor: 'text-red-600',
      badgeColor: 'bg-red-100 text-red-800',
      priority: 4
    }
  }

  const config = severityConfig[finding.severity]
  const IconComponent = config.icon

  // Category icons
  const getCategoryIcon = (category: string) => {
    const categoryIcons: Record<string, any> = {
      legal_rights: ShieldExclamationIcon,
      privacy: InformationCircleIcon,
      billing: ClipboardDocumentIcon,
      termination: ExclamationTriangleIcon,
      liability: ShieldExclamationIcon,
      intellectual_property: ClipboardDocumentIcon,
      data_usage: InformationCircleIcon,
      general: InformationCircleIcon
    }
    return categoryIcons[category] || InformationCircleIcon
  }

  const CategoryIcon = getCategoryIcon(finding.category)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ 
        duration: 0.4, 
        delay: index * 0.1,
        type: "spring",
        stiffness: 300,
        damping: 25
      }}
      className={clsx(
        'relative rounded-xl border-2 transition-all duration-300 hover:shadow-lg',
        config.bgColor,
        config.borderColor,
        expanded ? 'shadow-xl' : 'shadow-md',
        className
      )}
    >
      {/* Priority indicator stripe */}
      <div
        className={clsx(
          'absolute left-0 top-0 bottom-0 w-1 rounded-l-lg',
          `bg-${config.color}-500`
        )}
      />

      {/* Header */}
      <div
        className={clsx(
          'flex items-start justify-between p-4 cursor-pointer',
          'hover:bg-black hover:bg-opacity-5 rounded-t-xl transition-colors'
        )}
        onClick={handleToggle}
      >
        <div className="flex items-start space-x-3 flex-1">
          {/* Severity Icon */}
          <div className={clsx(
            'flex-shrink-0 p-2 rounded-lg',
            `bg-${config.color}-100`
          )}>
            <IconComponent className={clsx('w-5 h-5', config.iconColor)} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2 mb-1">
              <h3 className={clsx(
                'font-semibold text-sm line-clamp-2',
                config.textColor
              )}>
                {finding.title}
              </h3>
              
              {/* Severity Badge */}
              <span className={clsx(
                'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0',
                config.badgeColor
              )}>
                {finding.severity.toUpperCase()}
              </span>
            </div>

            <p className={clsx(
              'text-sm leading-relaxed',
              config.textColor,
              'opacity-90'
            )}>
              {finding.description}
            </p>

            {/* Metadata */}
            <div className="flex items-center space-x-4 mt-2 text-xs opacity-75">
              <div className="flex items-center space-x-1">
                <CategoryIcon className="w-3 h-3" />
                <span className="capitalize">{finding.category.replace('_', ' ')}</span>
              </div>
              
              {finding.confidenceScore && (
                <div className="flex items-center space-x-1">
                  <div className="w-3 h-3 rounded-full bg-current opacity-20" />
                  <span>{Math.round(finding.confidenceScore * 100)}% confident</span>
                </div>
              )}

              {finding.position && (
                <div className="flex items-center space-x-1">
                  <ClipboardDocumentIcon className="w-3 h-3" />
                  <span>Position {finding.position}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Expand/Collapse Button */}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          className={clsx(
            'flex-shrink-0 p-1 rounded-lg transition-colors ml-2',
            'hover:bg-black hover:bg-opacity-10',
            config.textColor
          )}
          aria-label={expanded ? 'Collapse details' : 'Expand details'}
        >
          {expanded ? (
            <ChevronUpIcon className="w-5 h-5" />
          ) : (
            <ChevronDownIcon className="w-5 h-5" />
          )}
        </motion.button>
      </div>

      {/* Expanded Content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-4">
              {/* Clause Text */}
              {showClauseText && finding.clauseText && (
                <motion.div
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className={clsx(
                    'rounded-lg border p-3',
                    'bg-white bg-opacity-60',
                    config.borderColor
                  )}
                >
                  <div className="flex items-center space-x-2 mb-2">
                    <ClipboardDocumentIcon className={clsx('w-4 h-4', config.iconColor)} />
                    <h4 className={clsx('text-sm font-medium', config.textColor)}>
                      Original Clause
                    </h4>
                  </div>
                  <blockquote className={clsx(
                    'text-sm italic leading-relaxed',
                    config.textColor,
                    'opacity-90'
                  )}>
                    "{finding.clauseText}"
                  </blockquote>
                </motion.div>
              )}

              {/* Suggestion/Recommendation */}
              {finding.suggestion && (
                <motion.div
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className={clsx(
                    'rounded-lg border p-3',
                    'bg-white bg-opacity-60',
                    config.borderColor
                  )}
                >
                  <div className="flex items-center space-x-2 mb-2">
                    <LightBulbIcon className={clsx('w-4 h-4', config.iconColor)} />
                    <h4 className={clsx('text-sm font-medium', config.textColor)}>
                      Recommendation
                    </h4>
                  </div>
                  <p className={clsx(
                    'text-sm leading-relaxed',
                    config.textColor,
                    'opacity-90'
                  )}>
                    {finding.suggestion}
                  </p>
                </motion.div>
              )}

              {/* Action Buttons */}
              <motion.div
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="flex items-center justify-between pt-2"
              >
                <div className="flex space-x-2">
                  <button className={clsx(
                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                    'border border-current opacity-60 hover:opacity-100',
                    'hover:bg-current hover:bg-opacity-10',
                    config.textColor
                  )}>
                    More Info
                  </button>
                  
                  <button className={clsx(
                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                    'border border-current opacity-60 hover:opacity-100',
                    'hover:bg-current hover:bg-opacity-10',
                    config.textColor
                  )}>
                    Take Action
                  </button>
                </div>

                {/* Confidence Score Visual */}
                {finding.confidenceScore && (
                  <div className="flex items-center space-x-2">
                    <span className={clsx('text-xs opacity-75', config.textColor)}>
                      Confidence
                    </span>
                    <div className="flex space-x-0.5">
                      {[1, 2, 3, 4, 5].map((level) => (
                        <div
                          key={level}
                          className={clsx(
                            'w-1.5 h-3 rounded-sm',
                            level <= (finding.confidenceScore! * 5)
                              ? `bg-${config.color}-500`
                              : 'bg-gray-200'
                          )}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hover glow effect for critical findings */}
      {finding.severity === 'critical' && (
        <div className={clsx(
          'absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300',
          'hover:opacity-20 pointer-events-none',
          'bg-red-500 blur-sm'
        )} />
      )}
    </motion.div>
  )
}

export default FindingCard