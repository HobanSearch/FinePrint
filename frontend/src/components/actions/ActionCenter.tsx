import React from 'react'
import { motion } from 'framer-motion'
import { 
  Shield, 
  Mail, 
  FileText, 
  ExternalLink, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  Play,
  Copy,
  Download,
  Edit,
  Users,
  Calendar,
  Target
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Progress } from '@/components/ui/Progress'
import { cn, formatRelativeTime } from '@/lib/utils'
import { ANIMATION_VARIANTS, ACTION_TYPES } from '@/lib/constants'
import type { Recommendation, ActionStep } from '@/types/analysis'

export interface ActionCenterProps {
  recommendations: Recommendation[]
  onStartAction?: (recommendation: Recommendation) => void
  onCompleteStep?: (stepId: string) => void
  onViewTemplate?: (recommendation: Recommendation) => void
  className?: string
}

interface ActionTemplateData {
  id: string
  type: keyof typeof ACTION_TYPES
  title: string
  description: string
  template: string
  category: string
  difficulty: 'Easy' | 'Medium' | 'Hard'
  estimatedTime: string
  successRate: number
  popularity: number
}

const actionTemplates: ActionTemplateData[] = [
  {
    id: 'arbitration-opt-out',
    type: 'ARBITRATION_OPT_OUT',
    title: 'Arbitration Opt-Out Letter',
    description: 'Reject forced arbitration clauses to maintain your right to sue',
    template: 'arbitration-opt-out-template',
    category: 'Legal Rights',
    difficulty: 'Easy',
    estimatedTime: '5 minutes',
    successRate: 95,
    popularity: 89,
  },
  {
    id: 'data-deletion',
    type: 'ACCOUNT_DELETION',
    title: 'Complete Account Deletion',
    description: 'Request full deletion of your personal data and account',
    template: 'account-deletion-template',
    category: 'Privacy',
    difficulty: 'Medium',
    estimatedTime: '10 minutes',
    successRate: 87,
    popularity: 76,
  },
  {
    id: 'gdpr-data-request',
    type: 'DATA_REQUEST',
    title: 'GDPR Data Access Request',
    description: 'Request all personal data the company has collected about you',
    template: 'gdpr-request-template',
    category: 'Privacy',
    difficulty: 'Easy',
    estimatedTime: '3 minutes',
    successRate: 92,
    popularity: 94,
  },
  {
    id: 'marketing-opt-out',
    type: 'OPT_OUT',
    title: 'Marketing Communications Opt-Out',
    description: 'Stop all marketing emails, calls, and advertisements',
    template: 'marketing-opt-out-template',
    category: 'Communications',
    difficulty: 'Easy',
    estimatedTime: '2 minutes',
    successRate: 98,
    popularity: 82,
  },
]

const actionIcons = {
  OPT_OUT: Shield,
  DATA_REQUEST: FileText,
  ACCOUNT_DELETION: AlertCircle,
  ARBITRATION_OPT_OUT: Shield,
  UNSUBSCRIBE: Mail,
  COMPLAINT: AlertCircle,
  REVIEW: Target,
}

const priorityColors = {
  LOW: 'sage',
  MEDIUM: 'alert',
  HIGH: 'alert',
  URGENT: 'danger',
} as const

export const ActionCenter: React.FC<ActionCenterProps> = ({
  recommendations,
  onStartAction,
  onCompleteStep,
  onViewTemplate,
  className,
}) => {
  const [activeTab, setActiveTab] = React.useState<'recommended' | 'templates' | 'progress'>('recommended')
  const [selectedAction, setSelectedAction] = React.useState<Recommendation | null>(null)

  const completedActions = recommendations.filter(r => 
    r.steps?.every(step => step.completed)
  )
  
  const inProgressActions = recommendations.filter(r => 
    r.steps?.some(step => step.completed) && r.steps?.some(step => !step.completed)
  )

  const handleStartAction = (recommendation: Recommendation) => {
    setSelectedAction(recommendation)
    onStartAction?.(recommendation)
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Action Center</h2>
          <p className="text-muted-foreground">
            Take control of your digital rights with our guided action templates
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <CheckCircle className="w-3 h-3" />
            {completedActions.length} completed
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Clock className="w-3 h-3" />
            {inProgressActions.length} in progress
          </Badge>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-muted rounded-lg w-fit">
        {[
          { id: 'recommended', label: 'Recommended', count: recommendations.length },
          { id: 'templates', label: 'All Templates', count: actionTemplates.length },
          { id: 'progress', label: 'My Progress', count: inProgressActions.length },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              'px-4 py-2 rounded-md text-sm font-medium transition-all duration-200',
              activeTab === tab.id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
            {tab.count > 0 && (
              <Badge variant="secondary" size="sm" className="ml-2">
                {tab.count}
              </Badge>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'recommended' && (
        <div className="space-y-4">
          {recommendations.length === 0 ? (
            <Card className="p-8 text-center">
              <Shield className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="font-semibold text-foreground mb-2">No actions recommended</h3>
              <p className="text-muted-foreground">
                Complete a document analysis to get personalized action recommendations.
              </p>
            </Card>
          ) : (
            <div className="grid gap-4">
              {recommendations
                .sort((a, b) => {
                  const priorityOrder = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }
                  return priorityOrder[b.priority] - priorityOrder[a.priority]
                })
                .map((recommendation, index) => (
                  <RecommendationCard
                    key={recommendation.id}
                    recommendation={recommendation}
                    index={index}
                    onStart={() => handleStartAction(recommendation)}
                    onViewTemplate={() => onViewTemplate?.(recommendation)}
                    onCompleteStep={onCompleteStep}
                  />
                ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'templates' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {actionTemplates.map((template, index) => (
            <TemplateCard
              key={template.id}
              template={template}
              index={index}
              onSelect={() => {
                // Create a recommendation from template
                const mockRecommendation: Recommendation = {
                  id: template.id,
                  type: template.type,
                  priority: 'MEDIUM',
                  title: template.title,
                  description: template.description,
                  actionable: true,
                  templateAvailable: true,
                  estimatedTime: template.estimatedTime,
                  relatedFindings: [],
                }
                handleStartAction(mockRecommendation)
              }}
            />
          ))}
        </div>
      )}

      {activeTab === 'progress' && (
        <div className="space-y-4">
          {inProgressActions.length === 0 ? (
            <Card className="p-8 text-center">
              <Clock className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="font-semibold text-foreground mb-2">No actions in progress</h3>
              <p className="text-muted-foreground">
                Start an action from the recommended tab to track your progress here.
              </p>
            </Card>
          ) : (
            <div className="space-y-4">
              {inProgressActions.map((action) => (
                <ProgressCard
                  key={action.id}
                  recommendation={action}
                  onCompleteStep={onCompleteStep}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Action Detail Modal */}
      {selectedAction && (
        <ActionDetailModal
          recommendation={selectedAction}
          onClose={() => setSelectedAction(null)}
          onCompleteStep={onCompleteStep}
        />
      )}
    </div>
  )
}

// Individual recommendation card
interface RecommendationCardProps {
  recommendation: Recommendation
  index: number
  onStart: () => void
  onViewTemplate: () => void
  onCompleteStep?: (stepId: string) => void
}

const RecommendationCard: React.FC<RecommendationCardProps> = ({
  recommendation,
  index,
  onStart,
  onViewTemplate,
  onCompleteStep,
}) => {
  const Icon = actionIcons[recommendation.type]
  const completedSteps = recommendation.steps?.filter(s => s.completed).length || 0
  const totalSteps = recommendation.steps?.length || 0
  const progress = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
    >
      <Card hover="lift" className="overflow-hidden">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className={cn(
              'flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center',
              `bg-${priorityColors[recommendation.priority]}-100 text-${priorityColors[recommendation.priority]}-600`,
              `dark:bg-${priorityColors[recommendation.priority]}-950 dark:text-${priorityColors[recommendation.priority]}-400`
            )}>
              <Icon className="w-5 h-5" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-semibold text-foreground">
                  {recommendation.title}
                </h3>
                <Badge variant={priorityColors[recommendation.priority]} size="sm">
                  {recommendation.priority.toLowerCase()} priority
                </Badge>
              </div>

              <p className="text-muted-foreground text-sm mb-4">
                {recommendation.description}
              </p>

              <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>{recommendation.estimatedTime}</span>
                </div>
                {recommendation.templateAvailable && (
                  <div className="flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    <span>Template available</span>
                  </div>
                )}
                {totalSteps > 0 && (
                  <div className="flex items-center gap-1">
                    <Target className="w-3 h-3" />
                    <span>{completedSteps}/{totalSteps} steps</span>
                  </div>
                )}
              </div>

              {totalSteps > 0 && (
                <div className="mb-4">
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-medium">{Math.round(progress)}%</span>
                  </div>
                  <Progress value={progress} color="guardian" size="sm" />
                </div>
              )}

              <div className="flex items-center gap-2">
                {progress === 0 ? (
                  <Button onClick={onStart} size="sm">
                    <Play className="w-3 h-3 mr-1" />
                    Start Action
                  </Button>
                ) : progress === 100 ? (
                  <Button variant="success" size="sm" disabled>
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Completed
                  </Button>
                ) : (
                  <Button onClick={onStart} size="sm">
                    Continue
                  </Button>
                )}

                {recommendation.templateAvailable && (
                  <Button variant="outline" size="sm" onClick={onViewTemplate}>
                    View Template
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// Template card for browsing all available templates
interface TemplateCardProps {
  template: ActionTemplateData
  index: number
  onSelect: () => void
}

const TemplateCard: React.FC<TemplateCardProps> = ({
  template,
  index,
  onSelect,
}) => {
  const Icon = actionIcons[template.type]

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.05 }}
    >
      <Card hover="lift" interactive onClick={onSelect}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-guardian-100 dark:bg-guardian-950 flex items-center justify-center">
              <Icon className="w-4 h-4 text-guardian-600 dark:text-guardian-400" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 mb-1">
                <h4 className="font-medium text-foreground text-sm">
                  {template.title}
                </h4>
                <Badge 
                  variant={
                    template.difficulty === 'Easy' ? 'sage' :
                    template.difficulty === 'Medium' ? 'alert' : 'danger'
                  } 
                  size="sm"
                >
                  {template.difficulty}
                </Badge>
              </div>

              <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
                {template.description}
              </p>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {template.estimatedTime}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {template.popularity}% use this
                  </span>
                </div>
                <span className="text-sage-600 font-medium">
                  {template.successRate}% success
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// Progress tracking card
interface ProgressCardProps {
  recommendation: Recommendation
  onCompleteStep?: (stepId: string) => void
}

const ProgressCard: React.FC<ProgressCardProps> = ({
  recommendation,
  onCompleteStep,
}) => {
  const Icon = actionIcons[recommendation.type]
  const completedSteps = recommendation.steps?.filter(s => s.completed).length || 0
  const totalSteps = recommendation.steps?.length || 0
  const progress = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-guardian-100 dark:bg-guardian-950 flex items-center justify-center">
            <Icon className="w-4 h-4 text-guardian-600 dark:text-guardian-400" />
          </div>
          <div className="flex-1">
            <h4 className="font-medium text-foreground">{recommendation.title}</h4>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-muted-foreground">
                {completedSteps} of {totalSteps} steps completed
              </span>
              <Progress value={progress} color="guardian" size="sm" className="w-20" />
            </div>
          </div>
        </div>

        {recommendation.steps && (
          <div className="space-y-2">
            {recommendation.steps.map((step, index) => (
              <div
                key={step.id}
                className={cn(
                  'flex items-center gap-3 p-2 rounded-lg',
                  step.completed ? 'bg-sage-50 dark:bg-sage-950/20' : 'bg-muted/30'
                )}
              >
                <button
                  onClick={() => onCompleteStep?.(step.id)}
                  className={cn(
                    'flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors',
                    step.completed
                      ? 'bg-sage-500 border-sage-500 text-white'
                      : 'border-muted-foreground hover:border-guardian-500'
                  )}
                >
                  {step.completed && <CheckCircle className="w-3 h-3" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    'text-sm',
                    step.completed 
                      ? 'text-muted-foreground line-through' 
                      : 'text-foreground'
                  )}>
                    {step.title}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  Step {step.order}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Action detail modal (simplified for demo)
interface ActionDetailModalProps {
  recommendation: Recommendation
  onClose: () => void
  onCompleteStep?: (stepId: string) => void
}

const ActionDetailModal: React.FC<ActionDetailModalProps> = ({
  recommendation,
  onClose,
  onCompleteStep,
}) => {
  // This would be a full modal in a real implementation
  // For now, just showing the structure
  return null
}