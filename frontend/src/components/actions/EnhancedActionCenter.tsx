import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Target, 
  CheckCircle, 
  Clock, 
  AlertTriangle,
  FileText,
  Send,
  Download,
  Copy,
  ExternalLink,
  Plus,
  Filter,
  Search,
  Calendar,
  User,
  MessageSquare,
  Workflow,
  Template,
  ChevronRight,
  ChevronDown,
  Star,
  Archive,
  MoreHorizontal,
  Play,
  Pause,
  CheckSquare,
  Square,
  ArrowRight,
  Bell,
  Settings,
  History,
  Lightbulb,
  Zap,
  Scale,
  BookOpen,
  Mail,
  Phone,
  Globe,
  Eye,
  Edit3,
  Share2,
  TrendingUp,
  Users,
  Shield
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Progress } from '@/components/ui/Progress'
import { cn } from '@/lib/utils'
import type { Finding } from '@/types/analysis'

interface ActionTemplate {
  id: string
  name: string
  description: string
  category: 'email' | 'document' | 'meeting' | 'research' | 'legal' | 'compliance'
  estimatedTime: string
  difficulty: 'easy' | 'medium' | 'hard'
  steps: ActionStep[]
  requiredFields: string[]
  tags: string[]
  successRate: number
  popularity: number
  legalComplexity: 'low' | 'medium' | 'high'
}

interface ActionStep {
  id: string
  title: string
  description: string
  type: 'input' | 'selection' | 'review' | 'action' | 'communication' | 'documentation'
  required: boolean
  completed?: boolean
  data?: any
  estimatedTime?: string
  resources?: string[]
  tips?: string[]
}

interface ActionItem {
  id: string
  title: string
  description: string
  category: string
  severity: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  status: 'pending' | 'in_progress' | 'completed' | 'archived' | 'blocked'
  assignee?: string
  dueDate?: string
  estimatedTime: string
  templates: ActionTemplate[]
  workflow?: {
    currentStep: number
    totalSteps: number
    steps: ActionStep[]
    templateId?: string
  }
  completed: boolean
  createdAt: string
  updatedAt: string
  tags: string[]
  relatedFindingId: string
  impact: 'low' | 'medium' | 'high' | 'critical'
  effort: 'minimal' | 'moderate' | 'significant' | 'extensive'
  resources?: string[]
  notes?: string
}

const ACTION_TEMPLATES: ActionTemplate[] = [
  {
    id: 'gdpr-data-request',
    name: 'GDPR Data Access Request',
    description: 'Request all personal data the company has collected about you under GDPR Article 15',
    category: 'legal',
    estimatedTime: '15-20 minutes',
    difficulty: 'easy',
    successRate: 92,
    popularity: 94,
    legalComplexity: 'low',
    steps: [
      {
        id: 'identify-contact',
        title: 'Identify Data Protection Contact',
        description: 'Find the company\'s Data Protection Officer or privacy contact information',
        type: 'research',
        required: true,
        estimatedTime: '5 minutes',
        resources: ['Company privacy policy', 'Contact page', 'Legal notices'],
        tips: ['Look for "Data Protection Officer" or "Privacy Officer"', 'Check the privacy policy footer']
      },
      {
        id: 'prepare-request',
        title: 'Prepare Request Letter',
        description: 'Use our template to create a formal GDPR data access request',
        type: 'documentation',
        required: true,
        estimatedTime: '8 minutes',
        resources: ['GDPR Article 15 template', 'Identity verification documents'],
        tips: ['Include specific data categories you want', 'Mention your right to portability']
      },
      {
        id: 'submit-request',
        title: 'Submit Request',
        description: 'Send the request via certified mail or secure email',
        type: 'communication',
        required: true,
        estimatedTime: '5 minutes',
        tips: ['Keep a copy for your records', 'Note the submission date']
      },
      {
        id: 'track-response',
        title: 'Track Response',
        description: 'Monitor for response within 30 days (GDPR requirement)',
        type: 'action',
        required: true,
        estimatedTime: '2 minutes',
        tips: ['Set a calendar reminder', 'Follow up if no response after 30 days']
      }
    ],
    requiredFields: ['company_name', 'dpo_email', 'your_account_email', 'identification_method'],
    tags: ['gdpr', 'privacy', 'data-access', 'rights', 'compliance']
  },
  {
    id: 'arbitration-opt-out',
    name: 'Arbitration Clause Opt-Out',
    description: 'Reject mandatory arbitration clauses to preserve your right to sue in court',
    category: 'legal',
    estimatedTime: '10-15 minutes',
    difficulty: 'easy',
    successRate: 89,
    popularity: 78,
    legalComplexity: 'medium',
    steps: [
      {
        id: 'review-terms',
        title: 'Review Arbitration Terms',
        description: 'Understand the arbitration clause and opt-out deadline',
        type: 'review',
        required: true,
        estimatedTime: '5 minutes',
        resources: ['Terms of Service', 'User Agreement', 'Privacy Policy']
      },
      {
        id: 'draft-opt-out',
        title: 'Draft Opt-Out Notice',
        description: 'Create formal notice of arbitration clause rejection',
        type: 'documentation',
        required: true,
        estimatedTime: '8 minutes',
        tips: ['Include your account information', 'Reference the specific clause', 'Send within deadline']
      },
      {
        id: 'send-notice',
        title: 'Send Opt-Out Notice',
        description: 'Submit notice via required method (usually email or mail)',
        type: 'communication',
        required: true,
        estimatedTime: '3 minutes'
      }
    ],
    requiredFields: ['company_name', 'account_identifier', 'opt_out_deadline', 'submission_method'],
    tags: ['arbitration', 'legal-rights', 'opt-out', 'litigation', 'consumer-protection']
  },
  {
    id: 'account-deletion',
    name: 'Complete Account Deletion',
    description: 'Request full deletion of your account and associated personal data',
    category: 'compliance',
    estimatedTime: '20-30 minutes',
    difficulty: 'medium',
    successRate: 85,
    popularity: 71,
    legalComplexity: 'medium',
    steps: [
      {
        id: 'backup-data',
        title: 'Backup Important Data',
        description: 'Download any data you want to keep before deletion',
        type: 'action',
        required: false,
        estimatedTime: '10 minutes',
        tips: ['Export contacts, messages, files', 'Save important conversations']
      },
      {
        id: 'cancel-subscriptions',
        title: 'Cancel Active Subscriptions',
        description: 'Cancel any paid subscriptions or services',
        type: 'action',
        required: true,
        estimatedTime: '5 minutes'
      },
      {
        id: 'submit-deletion-request',
        title: 'Submit Deletion Request',
        description: 'Use account settings or contact support for deletion',
        type: 'communication',
        required: true,
        estimatedTime: '10 minutes',
        tips: ['Reference GDPR/CCPA rights if applicable', 'Request confirmation']
      },
      {
        id: 'verify-deletion',
        title: 'Verify Complete Deletion',
        description: 'Confirm account and data have been fully deleted',
        type: 'review',
        required: true,
        estimatedTime: '5 minutes',
        tips: ['Try to log in after waiting period', 'Check if profile is still visible']
      }
    ],
    requiredFields: ['account_email', 'account_username', 'deletion_reason', 'jurisdiction'],
    tags: ['account-deletion', 'privacy', 'data-protection', 'gdpr', 'ccpa']
  },
  {
    id: 'contract-amendment-request',
    name: 'Contract Amendment Request',
    description: 'Formally request changes to problematic contract terms',
    category: 'legal',
    estimatedTime: '45-60 minutes',
    difficulty: 'hard',
    successRate: 65,
    popularity: 45,
    legalComplexity: 'high',
    steps: [
      {
        id: 'analyze-clause',
        title: 'Analyze Problematic Clause',
        description: 'Document the specific issues with the contract term',
        type: 'review',
        required: true,
        estimatedTime: '15 minutes',
        resources: ['Contract document', 'Legal precedents', 'Industry standards']
      },
      {
        id: 'research-alternatives',
        title: 'Research Alternative Language',
        description: 'Find better contract language that protects your interests',
        type: 'research',
        required: true,
        estimatedTime: '20 minutes',
        resources: ['Standard contract libraries', 'Legal databases', 'Industry templates']
      },
      {
        id: 'draft-proposal',
        title: 'Draft Amendment Proposal',
        description: 'Create formal proposal with specific language changes',
        type: 'documentation',
        required: true,
        estimatedTime: '15 minutes',
        tips: ['Highlight mutual benefits', 'Provide clear rationale', 'Suggest specific wording']
      },
      {
        id: 'submit-proposal',
        title: 'Submit Amendment Request',
        description: 'Send proposal to appropriate stakeholders',
        type: 'communication',
        required: true,
        estimatedTime: '10 minutes'
      }
    ],
    requiredFields: ['contract_section', 'current_language', 'proposed_language', 'business_justification'],
    tags: ['contract', 'amendment', 'negotiation', 'legal-review', 'business-terms']
  },
  {
    id: 'compliance-audit-request',
    name: 'Request Compliance Audit',
    description: 'Request internal audit of data handling and privacy practices',
    category: 'compliance',
    estimatedTime: '30-40 minutes',
    difficulty: 'medium',
    successRate: 73,
    popularity: 56,
    legalComplexity: 'medium',
    steps: [
      {
        id: 'identify-concerns',
        title: 'Document Compliance Concerns',
        description: 'List specific areas where compliance may be lacking',
        type: 'documentation',
        required: true,
        estimatedTime: '15 minutes'
      },
      {
        id: 'reference-regulations',
        title: 'Reference Applicable Regulations',
        description: 'Identify which laws and regulations apply',
        type: 'research',
        required: true,
        estimatedTime: '10 minutes',
        resources: ['GDPR', 'CCPA', 'COPPA', 'Industry regulations']
      },
      {
        id: 'submit-audit-request',
        title: 'Submit Audit Request',
        description: 'Formally request compliance review',
        type: 'communication',
        required: true,
        estimatedTime: '10 minutes'
      },
      {
        id: 'follow-up',
        title: 'Follow Up on Progress',
        description: 'Monitor audit progress and request updates',
        type: 'action',
        required: true,
        estimatedTime: '5 minutes'
      }
    ],
    requiredFields: ['compliance_area', 'regulations_cited', 'priority_level', 'deadline_requested'],
    tags: ['compliance', 'audit', 'governance', 'risk-management', 'regulatory']
  }
]

export interface EnhancedActionCenterProps {
  findings: Finding[]
  className?: string
}

export const EnhancedActionCenter: React.FC<EnhancedActionCenterProps> = ({
  findings,
  className,
}) => {
  const [selectedCategory, setSelectedCategory] = React.useState<string>('all')
  const [selectedStatus, setSelectedStatus] = React.useState<string>('all')
  const [selectedPriority, setSelectedPriority] = React.useState<string>('all')
  const [searchQuery, setSearchQuery] = React.useState('')
  const [showCompleted, setShowCompleted] = React.useState(false)
  const [activeTab, setActiveTab] = React.useState<'actions' | 'templates' | 'analytics'>('actions')
  const [selectedAction, setSelectedAction] = React.useState<ActionItem | null>(null)
  const [showWorkflow, setShowWorkflow] = React.useState(false)
  
  const [actionItems, setActionItems] = React.useState<ActionItem[]>(() => {
    // Generate action items from findings with enhanced metadata
    return findings.map(finding => ({
      id: finding.id,
      title: `Address ${finding.title}`,
      description: finding.description,
      category: finding.category,
      severity: finding.severity,
      priority: finding.severity === 'CRITICAL' ? 'critical' : 
                finding.severity === 'HIGH' ? 'high' : 
                finding.severity === 'MEDIUM' ? 'medium' : 'low',
      status: 'pending' as const,
      estimatedTime: finding.severity === 'CRITICAL' ? '2-4 hours' : 
                    finding.severity === 'HIGH' ? '1-2 hours' : '30-60 minutes',
      templates: ACTION_TEMPLATES.filter(template => {
        // Smart template matching based on finding characteristics
        if (finding.category.includes('DATA') && template.tags.includes('privacy')) return true
        if (finding.category.includes('LIABILITY') && template.tags.includes('legal-rights')) return true
        if (finding.category.includes('TERMINATION') && template.tags.includes('account-deletion')) return true
        if (finding.category.includes('DISPUTE') && template.tags.includes('arbitration')) return true
        return template.difficulty === 'easy' // Default to easy templates
      }),
      completed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: [
        finding.category.toLowerCase().replace('_', '-'), 
        finding.severity.toLowerCase(),
        finding.category.includes('DATA') ? 'privacy' : 'legal',
        'auto-generated'
      ],
      relatedFindingId: finding.id,
      dueDate: finding.severity === 'CRITICAL' ? 
        new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : 
        finding.severity === 'HIGH' ?
        new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString() :
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      impact: finding.severity === 'CRITICAL' ? 'critical' : 
              finding.severity === 'HIGH' ? 'high' : 
              finding.severity === 'MEDIUM' ? 'medium' : 'low',
      effort: finding.category.includes('TERMINATION') ? 'extensive' :
              finding.category.includes('LIABILITY') ? 'significant' :
              finding.category.includes('DATA') ? 'moderate' : 'minimal',
      resources: [
        'Finding details',
        'Legal templates',
        'Compliance guides',
        'Contact information'
      ]
    }))
  })

  const filteredActions = React.useMemo(() => {
    return actionItems.filter(action => {
      const matchesCategory = selectedCategory === 'all' || action.category === selectedCategory
      const matchesStatus = selectedStatus === 'all' || action.status === selectedStatus
      const matchesPriority = selectedPriority === 'all' || action.priority === selectedPriority
      const matchesCompleted = showCompleted || !action.completed
      const matchesSearch = !searchQuery || 
        action.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        action.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        action.tags.some(tag => tag.includes(searchQuery.toLowerCase()))
      
      return matchesCategory && matchesStatus && matchesPriority && matchesCompleted && matchesSearch
    })
  }, [actionItems, selectedCategory, selectedStatus, selectedPriority, showCompleted, searchQuery])

  const stats = React.useMemo(() => {
    const total = actionItems.length
    const completed = actionItems.filter(a => a.completed).length
    const inProgress = actionItems.filter(a => a.status === 'in_progress').length
    const overdue = actionItems.filter(a => 
      a.dueDate && new Date(a.dueDate) < new Date() && !a.completed
    ).length
    const critical = actionItems.filter(a => a.priority === 'critical').length
    const blocked = actionItems.filter(a => a.status === 'blocked').length
    
    return { total, completed, inProgress, overdue, critical, blocked }
  }, [actionItems])

  const updateActionStatus = (actionId: string, status: ActionItem['status']) => {
    setActionItems(prev => prev.map(action => 
      action.id === actionId 
        ? { 
            ...action, 
            status, 
            completed: status === 'completed', 
            updatedAt: new Date().toISOString() 
          }
        : action
    ))
  }

  const startWorkflow = (action: ActionItem, template: ActionTemplate) => {
    const workflow = {
      currentStep: 0,
      totalSteps: template.steps.length,
      steps: template.steps.map(step => ({ ...step, completed: false })),
      templateId: template.id
    }
    
    setActionItems(prev => prev.map(item => 
      item.id === action.id
        ? { ...item, workflow, status: 'in_progress' }
        : item
    ))
    
    setSelectedAction({ ...action, workflow })
    setShowWorkflow(true)
  }

  const completeWorkflowStep = (actionId: string, stepId: string) => {
    setActionItems(prev => prev.map(action => {
      if (action.id !== actionId || !action.workflow) return action
      
      const updatedSteps = action.workflow.steps.map(step => 
        step.id === stepId ? { ...step, completed: true } : step
      )
      
      const completedSteps = updatedSteps.filter(s => s.completed).length
      const newCurrentStep = Math.min(completedSteps, action.workflow.totalSteps - 1)
      
      const isWorkflowComplete = completedSteps === action.workflow.totalSteps
      
      return {
        ...action,
        workflow: {
          ...action.workflow,
          currentStep: newCurrentStep,
          steps: updatedSteps,
        },
        status: isWorkflowComplete ? 'completed' : 'in_progress',
        completed: isWorkflowComplete,
        updatedAt: new Date().toISOString(),
      }
    }))
  }

  const createCustomAction = () => {
    // Implementation would open a form to create custom actions
    console.log('Create custom action')
  }

  const exportActionPlan = () => {
    // Implementation would generate comprehensive action plan
    console.log('Export action plan')
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Enhanced Header with Metrics */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <Target className="w-8 h-8 text-guardian-500" />
            Action Center
          </h1>
          <p className="text-muted-foreground text-lg">
            Transform findings into actionable steps with guided workflows
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            onClick={exportActionPlan}
            leftIcon={<Download className="w-4 h-4" />}
          >
            Export Plan
          </Button>
          <Button onClick={createCustomAction} leftIcon={<Plus className="w-4 h-4" />}>
            Custom Action
          </Button>
        </div>
      </div>

      {/* Enhanced Stats Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Card className="relative overflow-hidden">
          <CardContent className="p-4 text-center">
            <div className="absolute inset-0 bg-gradient-to-br from-guardian-500/10 to-transparent" />
            <div className="relative">
              <div className="text-2xl font-bold text-guardian-600">{stats.total}</div>
              <div className="text-xs text-muted-foreground">Total Actions</div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="relative overflow-hidden">
          <CardContent className="p-4 text-center">
            <div className="absolute inset-0 bg-gradient-to-br from-sage-500/10 to-transparent" />
            <div className="relative">
              <div className="text-2xl font-bold text-sage-600">{stats.completed}</div>
              <div className="text-xs text-muted-foreground">Completed</div>
              <div className="text-xs text-sage-600 font-medium">
                {Math.round((stats.completed / Math.max(1, stats.total)) * 100)}%
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="relative overflow-hidden">
          <CardContent className="p-4 text-center">
            <div className="absolute inset-0 bg-gradient-to-br from-guardian-500/10 to-transparent" />
            <div className="relative">
              <div className="text-2xl font-bold text-guardian-600">{stats.inProgress}</div>
              <div className="text-xs text-muted-foreground">In Progress</div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="relative overflow-hidden">
          <CardContent className="p-4 text-center">
            <div className="absolute inset-0 bg-gradient-to-br from-danger-500/10 to-transparent" />
            <div className="relative">
              <div className="text-2xl font-bold text-danger-600">{stats.overdue}</div>
              <div className="text-xs text-muted-foreground">Overdue</div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="relative overflow-hidden">
          <CardContent className="p-4 text-center">
            <div className="absolute inset-0 bg-gradient-to-br from-alert-500/10 to-transparent" />
            <div className="relative">
              <div className="text-2xl font-bold text-alert-600">{stats.critical}</div>
              <div className="text-xs text-muted-foreground">Critical</div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="relative overflow-hidden">
          <CardContent className="p-4 text-center">
            <div className="absolute inset-0 bg-gradient-to-br from-neutral-500/10 to-transparent" />
            <div className="relative">
              <div className="text-2xl font-bold text-neutral-600">{stats.blocked}</div>
              <div className="text-xs text-muted-foreground">Blocked</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Progress Overview */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Overall Progress
            </CardTitle>
            <div className="text-sm text-muted-foreground">
              {stats.completed} of {stats.total} actions completed
            </div>
          </div>
          <Progress 
            value={(stats.completed / Math.max(1, stats.total)) * 100}
            className="h-3"
            indicatorClassName="bg-gradient-to-r from-guardian-500 via-sage-500 to-guardian-600"
          />
        </CardHeader>
      </Card>

      {/* Enhanced Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 p-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
          {[
            { id: 'actions', label: 'Actions', icon: Target, count: filteredActions.length },
            { id: 'templates', label: 'Templates', icon: Template, count: ACTION_TEMPLATES.length },
            { id: 'analytics', label: 'Analytics', icon: TrendingUp, count: 0 },
          ].map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200',
                  activeTab === tab.id
                    ? 'bg-white dark:bg-neutral-700 text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {tab.count > 0 && (
                  <Badge variant="secondary" size="sm">
                    {tab.count}
                  </Badge>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'actions' && (
        <div className="space-y-6">
          {/* Enhanced Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-4">
                <Input
                  placeholder="Search actions, tags, or descriptions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  leftIcon={<Search className="w-4 h-4" />}
                  className="flex-1 min-w-64"
                />
                
                <div className="flex items-center gap-2">
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="px-3 py-2 text-sm border rounded-md bg-background min-w-32"
                  >
                    <option value="all">All Status</option>
                    <option value="pending">Pending</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="blocked">Blocked</option>
                    <option value="archived">Archived</option>
                  </select>
                  
                  <select
                    value={selectedPriority}
                    onChange={(e) => setSelectedPriority(e.target.value)}
                    className="px-3 py-2 text-sm border rounded-md bg-background min-w-32"
                  >
                    <option value="all">All Priority</option>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                  
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="px-3 py-2 text-sm border rounded-md bg-background min-w-40"
                  >
                    <option value="all">All Categories</option>
                    <option value="DATA_COLLECTION">Data Collection</option>
                    <option value="USER_RIGHTS">User Rights</option>
                    <option value="LIABILITY">Liability</option>
                    <option value="TERMINATION">Termination</option>
                    <option value="DISPUTE_RESOLUTION">Dispute Resolution</option>
                  </select>
                </div>
                
                <Button
                  variant={showCompleted ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setShowCompleted(!showCompleted)}
                  leftIcon={showCompleted ? <CheckSquare className="w-3 h-3" /> : <Square className="w-3 h-3" />}
                >
                  Show Completed
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Actions List */}
          <div className="space-y-4">
            {filteredActions.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <Target className="w-16 h-16 mx-auto mb-4 opacity-30" />
                  <h3 className="text-lg font-semibold mb-2">No actions found</h3>
                  <p className="text-muted-foreground mb-4">
                    No actions match your current filters.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedCategory('all')
                      setSelectedStatus('all')
                      setSelectedPriority('all')
                      setSearchQuery('')
                      setShowCompleted(false)
                    }}
                  >
                    Clear All Filters
                  </Button>
                </CardContent>
              </Card>
            ) : (
              filteredActions
                .sort((a, b) => {
                  // Enhanced sorting: priority -> due date -> impact -> effort
                  const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 }
                  const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority]
                  if (priorityDiff !== 0) return priorityDiff
                  
                  if (a.dueDate && b.dueDate) {
                    const dateDiff = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
                    if (dateDiff !== 0) return dateDiff
                  }
                  
                  const impactOrder = { critical: 4, high: 3, medium: 2, low: 1 }
                  return impactOrder[b.impact] - impactOrder[a.impact]
                })
                .map((action, index) => (
                  <motion.div
                    key={action.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                  >
                    <EnhancedActionCard
                      action={action}
                      onStatusChange={updateActionStatus}
                      onStartWorkflow={startWorkflow}
                      onCompleteStep={completeWorkflowStep}
                    />
                  </motion.div>
                ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'templates' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {ACTION_TEMPLATES.map((template, index) => (
              <motion.div
                key={template.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
              >
                <TemplateCard
                  template={template}
                  onSelect={(template) => {
                    // Create action from template
                    const newAction: ActionItem = {
                      id: `template-${template.id}-${Date.now()}`,
                      title: template.name,
                      description: template.description,
                      category: template.category.toUpperCase(),
                      severity: 'MEDIUM',
                      priority: 'medium',
                      status: 'pending',
                      estimatedTime: template.estimatedTime,
                      templates: [template],
                      completed: false,
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                      tags: template.tags,
                      relatedFindingId: '',
                      impact: 'medium',
                      effort: template.difficulty === 'hard' ? 'significant' : 
                              template.difficulty === 'medium' ? 'moderate' : 'minimal',
                      resources: template.steps.flatMap(s => s.resources || [])
                    }
                    setActionItems(prev => [...prev, newAction])
                    startWorkflow(newAction, template)
                  }}
                />
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'analytics' && (
        <div className="space-y-6">
          <ActionAnalytics actions={actionItems} />
        </div>
      )}

      {/* Enhanced Workflow Modal */}
      <AnimatePresence>
        {showWorkflow && selectedAction && (
          <EnhancedWorkflowModal
            action={selectedAction}
            onClose={() => setShowWorkflow(false)}
            onCompleteStep={completeWorkflowStep}
            onUpdateNotes={(notes) => {
              setActionItems(prev => prev.map(item =>
                item.id === selectedAction.id ? { ...item, notes } : item
              ))
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// Enhanced Action Card Component with more features
interface EnhancedActionCardProps {
  action: ActionItem
  onStatusChange: (actionId: string, status: ActionItem['status']) => void
  onStartWorkflow: (action: ActionItem, template: ActionTemplate) => void
  onCompleteStep: (actionId: string, stepId: string) => void
}

const EnhancedActionCard: React.FC<EnhancedActionCardProps> = ({
  action,
  onStatusChange,
  onStartWorkflow,
  onCompleteStep,
}) => {
  const [expanded, setExpanded] = React.useState(false)
  const [selectedTemplate, setSelectedTemplate] = React.useState<ActionTemplate | null>(null)

  const isOverdue = action.dueDate && new Date(action.dueDate) < new Date() && !action.completed
  const progressPercentage = action.workflow 
    ? (action.workflow.steps.filter(s => s.completed).length / action.workflow.totalSteps) * 100
    : 0

  const getPriorityColor = (priority: ActionItem['priority']) => {
    switch (priority) {
      case 'critical': return 'border-l-danger-500 bg-danger-50 dark:bg-danger-950'
      case 'high': return 'border-l-alert-500 bg-alert-50 dark:bg-alert-950'
      case 'medium': return 'border-l-guardian-500 bg-guardian-50 dark:bg-guardian-950'
      case 'low': return 'border-l-sage-500 bg-sage-50 dark:bg-sage-950'
      default: return ''
    }
  }

  const getStatusIcon = (status: ActionItem['status']) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-4 h-4 text-sage-500" />
      case 'in_progress': return <Play className="w-4 h-4 text-guardian-500" />
      case 'blocked': return <AlertTriangle className="w-4 h-4 text-alert-500" />
      case 'archived': return <Archive className="w-4 h-4 text-neutral-400" />
      default: return <Clock className="w-4 h-4 text-muted-foreground" />
    }
  }

  const getEffortBadgeColor = (effort: ActionItem['effort']) => {
    switch (effort) {
      case 'extensive': return 'destructive'
      case 'significant': return 'default'
      case 'moderate': return 'secondary'
      case 'minimal': return 'outline'
      default: return 'outline'
    }
  }

  return (
    <Card className={cn(
      'transition-all duration-300 border-l-4',
      action.completed && 'opacity-75',
      isOverdue && 'ring-2 ring-danger-200 animate-pulse',
      getPriorityColor(action.priority)
    )}>
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 mt-1">
            {getStatusIcon(action.status)}
          </div>
          
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className={cn(
                    'font-semibold text-lg',
                    action.completed && 'line-through text-muted-foreground'
                  )}>
                    {action.title}
                  </h3>
                  {isOverdue && (
                    <Badge variant="destructive" size="sm" className="animate-pulse">
                      <Clock className="w-3 h-3 mr-1" />
                      Overdue
                    </Badge>
                  )}
                </div>
                
                <p className="text-muted-foreground mb-3">
                  {action.description}
                </p>
              </div>
              
              <div className="flex items-center gap-2">
                <Badge variant={action.priority === 'critical' ? 'destructive' : 
                              action.priority === 'high' ? 'default' : 
                              action.priority === 'medium' ? 'secondary' : 'outline'} 
                       size="sm">
                  {action.priority.toUpperCase()}
                </Badge>
                <Badge variant={getEffortBadgeColor(action.effort)} size="sm">
                  {action.effort}
                </Badge>
              </div>
            </div>
            
            {/* Metadata */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span>{action.estimatedTime}</span>
              </div>
              {action.dueDate && (
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span className={cn(isOverdue && 'text-danger-600 font-medium')}>
                    {new Date(action.dueDate).toLocaleDateString()}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
                <span className="capitalize">{action.impact} impact</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <span>{action.templates.length} templates</span>
              </div>
            </div>
            
            {/* Tags */}
            <div className="flex items-center gap-1 mb-4 flex-wrap">
              {action.tags.slice(0, expanded ? undefined : 3).map(tag => (
                <Badge key={tag} variant="outline" size="sm" className="text-xs">
                  {tag}
                </Badge>
              ))}
              {!expanded && action.tags.length > 3 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-2 text-xs"
                  onClick={() => setExpanded(true)}
                >
                  +{action.tags.length - 3} more
                </Button>
              )}
            </div>
            
            {/* Workflow Progress */}
            {action.workflow && (
              <div className="mb-4 p-3 bg-neutral-50 dark:bg-neutral-900 rounded-lg">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="font-medium">Workflow Progress</span>
                  <span>{action.workflow.steps.filter(s => s.completed).length}/{action.workflow.totalSteps} steps</span>
                </div>
                <Progress value={progressPercentage} className="h-2 mb-2" />
                <div className="text-xs text-muted-foreground">
                  Current: {action.workflow.steps[action.workflow.currentStep]?.title}
                </div>
              </div>
            )}
            
            {/* Action Buttons */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {action.status === 'pending' && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => onStatusChange(action.id, 'in_progress')}
                      leftIcon={<Play className="w-3 h-3" />}
                    >
                      Start
                    </Button>
                    {action.templates.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onStartWorkflow(action, action.templates[0])}
                        leftIcon={<Workflow className="w-3 h-3" />}
                      >
                        Use Template
                      </Button>
                    )}
                  </>
                )}
                
                {action.status === 'in_progress' && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => onStatusChange(action.id, 'completed')}
                      leftIcon={<CheckCircle className="w-3 h-3" />}
                    >
                      Complete
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onStatusChange(action.id, 'blocked')}
                      leftIcon={<AlertTriangle className="w-3 h-3" />}
                    >
                      Block
                    </Button>
                  </>
                )}
                
                {action.status === 'blocked' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onStatusChange(action.id, 'in_progress')}
                    leftIcon={<Play className="w-3 h-3" />}
                  >
                    Unblock
                  </Button>
                )}
                
                {action.completed && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onStatusChange(action.id, 'pending')}
                  >
                    Reopen
                  </Button>
                )}
                
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<ExternalLink className="w-3 h-3" />}
                >
                  View Finding
                </Button>
              </div>
              
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setExpanded(!expanded)}
                  leftIcon={expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                >
                  {expanded ? 'Less' : 'More'}
                </Button>
                <Button variant="ghost" size="sm" leftIcon={<MoreHorizontal className="w-3 h-3" />} />
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// Enhanced Template Card with more details
interface TemplateCardProps {
  template: ActionTemplate
  onSelect: (template: ActionTemplate) => void
}

const TemplateCard: React.FC<TemplateCardProps> = ({ template, onSelect }) => {
  const [expanded, setExpanded] = React.useState(false)

  const getCategoryIcon = (category: ActionTemplate['category']) => {
    switch (category) {
      case 'email': return <Mail className="w-4 h-4" />
      case 'document': return <FileText className="w-4 h-4" />
      case 'meeting': return <Calendar className="w-4 h-4" />
      case 'research': return <Search className="w-4 h-4" />
      case 'legal': return <Scale className="w-4 h-4" />
      case 'compliance': return <Shield className="w-4 h-4" />
      default: return <Template className="w-4 h-4" />
    }
  }

  const getDifficultyColor = (difficulty: ActionTemplate['difficulty']) => {
    switch (difficulty) {
      case 'easy': return 'sage'
      case 'medium': return 'alert'
      case 'hard': return 'danger'
      default: return 'outline'
    }
  }

  const getLegalComplexityColor = (complexity: ActionTemplate['legalComplexity']) => {
    switch (complexity) {
      case 'low': return 'sage'
      case 'medium': return 'alert'
      case 'high': return 'danger'
      default: return 'outline'
    }
  }

  return (
    <Card className="h-full hover:shadow-lg transition-all duration-200 cursor-pointer group">
      <CardContent className="p-6 h-full flex flex-col">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            {getCategoryIcon(template.category)}
            <h3 className="font-semibold text-lg group-hover:text-guardian-600 transition-colors">
              {template.name}
            </h3>
          </div>
          
          <div className="flex items-center gap-2">
            <Badge variant={getDifficultyColor(template.difficulty)} size="sm">
              {template.difficulty}
            </Badge>
            <Badge variant={getLegalComplexityColor(template.legalComplexity)} size="sm">
              {template.legalComplexity} legal
            </Badge>
          </div>
        </div>
        
        <p className="text-muted-foreground mb-4 flex-1">
          {template.description}
        </p>
        
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Clock className="w-3 h-3 text-muted-foreground" />
              <span>{template.estimatedTime}</span>
            </div>
            <div className="flex items-center gap-2">
              <Target className="w-3 h-3 text-muted-foreground" />
              <span>{template.steps.length} steps</span>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-3 h-3 text-sage-500" />
              <span>{template.successRate}% success</span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="w-3 h-3 text-guardian-500" />
              <span>{template.popularity}% use this</span>
            </div>
          </div>
          
          <div className="flex items-center gap-1 flex-wrap">
            {template.tags.slice(0, 3).map(tag => (
              <Badge key={tag} variant="outline" size="sm" className="text-xs">
                {tag}
              </Badge>
            ))}
            {template.tags.length > 3 && (
              <span className="text-xs text-muted-foreground">
                +{template.tags.length - 3} more
              </span>
            )}
          </div>
          
          <div className="flex items-center justify-between pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              leftIcon={expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            >
              {expanded ? 'Hide' : 'Preview'} Steps
            </Button>
            <Button
              size="sm"
              onClick={() => onSelect(template)}
              leftIcon={<Play className="w-3 h-3" />}
            >
              Use Template
            </Button>
          </div>
          
          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="pt-3 border-t space-y-2"
            >
              {template.steps.map((step, index) => (
                <div key={step.id} className="flex items-start gap-2 text-sm">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-guardian-100 dark:bg-guardian-900 flex items-center justify-center text-xs font-medium">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">{step.title}</div>
                    <div className="text-xs text-muted-foreground">{step.description}</div>
                    {step.estimatedTime && (
                      <div className="text-xs text-guardian-600 mt-1">~{step.estimatedTime}</div>
                    )}
                  </div>
                  {step.required && <Star className="w-3 h-3 text-alert-500 flex-shrink-0 mt-0.5" />}
                </div>
              ))}
            </motion.div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// Enhanced Workflow Modal with step-by-step guide
interface EnhancedWorkflowModalProps {
  action: ActionItem
  onClose: () => void
  onCompleteStep: (actionId: string, stepId: string) => void
  onUpdateNotes: (notes: string) => void
}

const EnhancedWorkflowModal: React.FC<EnhancedWorkflowModalProps> = ({ 
  action, 
  onClose, 
  onCompleteStep,
  onUpdateNotes 
}) => {
  const [notes, setNotes] = React.useState(action.notes || '')
  const [activeStepNotes, setActiveStepNotes] = React.useState<Record<string, string>>({})

  if (!action.workflow) return null

  const currentStep = action.workflow.steps[action.workflow.currentStep]
  const completedSteps = action.workflow.steps.filter(s => s.completed).length
  const progress = (completedSteps / action.workflow.totalSteps) * 100

  const handleCompleteStep = (stepId: string) => {
    onCompleteStep(action.id, stepId)
    // Auto-advance to next incomplete step
    const nextIncompleteIndex = action.workflow!.steps.findIndex(s => !s.completed)
    if (nextIncompleteIndex !== -1) {
      // Focus on next step
    }
  }

  const getStepIcon = (step: ActionStep, index: number) => {
    if (step.completed) {
      return <CheckCircle className="w-5 h-5 text-sage-500" />
    }
    if (index === action.workflow!.currentStep) {
      return (
        <div className="w-5 h-5 border-2 border-guardian-500 rounded-full flex items-center justify-center bg-guardian-100 dark:bg-guardian-900">
          <div className="w-2 h-2 bg-guardian-500 rounded-full" />
        </div>
      )
    }
    return (
      <div className="w-5 h-5 border-2 border-neutral-300 rounded-full flex items-center justify-center text-xs font-medium">
        {index + 1}
      </div>
    )
  }

  const getStepTypeIcon = (type: ActionStep['type']) => {
    switch (type) {
      case 'input': return <Edit3 className="w-3 h-3" />
      case 'selection': return <CheckSquare className="w-3 h-3" />
      case 'review': return <Eye className="w-3 h-3" />
      case 'action': return <Zap className="w-3 h-3" />
      case 'communication': return <MessageSquare className="w-3 h-3" />
      case 'documentation': return <FileText className="w-3 h-3" />
      default: return <ArrowRight className="w-3 h-3" />
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white dark:bg-neutral-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b bg-gradient-to-r from-guardian-50 to-sage-50 dark:from-guardian-950 dark:to-sage-950">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Workflow className="w-6 h-6 text-guardian-500" />
              Action Workflow
            </h2>
            <Button variant="ghost" size="sm" onClick={onClose}>
              ×
            </Button>
          </div>
          
          <div className="space-y-2">
            <h3 className="font-semibold">{action.title}</h3>
            <p className="text-sm text-muted-foreground">{action.description}</p>
          </div>
          
          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-muted-foreground">
              Step {action.workflow.currentStep + 1} of {action.workflow.totalSteps}
            </div>
            <div className="text-sm font-medium">
              {completedSteps}/{action.workflow.totalSteps} completed ({Math.round(progress)}%)
            </div>
          </div>
          <Progress value={progress} className="h-2 mt-2" />
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 lg:grid-cols-3 h-full">
            {/* Steps Sidebar */}
            <div className="border-r bg-neutral-50 dark:bg-neutral-900 p-4 space-y-3">
              <h4 className="font-semibold text-sm text-muted-foreground mb-3">WORKFLOW STEPS</h4>
              {action.workflow.steps.map((step, index) => (
                <div
                  key={step.id}
                  className={cn(
                    'flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-all',
                    step.completed && 'bg-sage-100 dark:bg-sage-900/20',
                    index === action.workflow!.currentStep && !step.completed && 
                      'bg-guardian-100 dark:bg-guardian-900/20 ring-2 ring-guardian-200 dark:ring-guardian-800',
                    index > action.workflow!.currentStep && 'opacity-50'
                  )}
                >
                  <div className="flex-shrink-0 mt-0.5">
                    {getStepIcon(step, index)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {getStepTypeIcon(step.type)}
                      <h5 className="font-medium text-sm">{step.title}</h5>
                      {step.required && <Star className="w-3 h-3 text-alert-500" />}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {step.description}
                    </p>
                    {step.estimatedTime && (
                      <div className="text-xs text-guardian-600 mt-1">
                        ~{step.estimatedTime}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            
            {/* Current Step Detail */}
            <div className="lg:col-span-2 p-6">
              {currentStep ? (
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      {getStepTypeIcon(currentStep.type)}
                      <h3 className="text-lg font-semibold">{currentStep.title}</h3>
                      {currentStep.required && (
                        <Badge variant="destructive" size="sm">Required</Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground">{currentStep.description}</p>
                    {currentStep.estimatedTime && (
                      <div className="text-sm text-guardian-600 mt-2">
                        Estimated time: {currentStep.estimatedTime}
                      </div>
                    )}
                  </div>
                  
                  {/* Resources */}
                  {currentStep.resources && currentStep.resources.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2 flex items-center gap-2">
                        <BookOpen className="w-4 h-4" />
                        Resources
                      </h4>
                      <div className="space-y-1">
                        {currentStep.resources.map((resource, index) => (
                          <div key={index} className="flex items-center gap-2 text-sm">
                            <div className="w-1 h-1 bg-guardian-500 rounded-full" />
                            <span>{resource}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Tips */}
                  {currentStep.tips && currentStep.tips.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2 flex items-center gap-2">
                        <Lightbulb className="w-4 h-4" />
                        Tips
                      </h4>
                      <div className="space-y-2">
                        {currentStep.tips.map((tip, index) => (
                          <div key={index} className="flex items-start gap-2 text-sm p-2 bg-guardian-50 dark:bg-guardian-950 rounded">
                            <div className="w-1 h-1 bg-guardian-500 rounded-full mt-2 flex-shrink-0" />
                            <span>{tip}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Step Notes */}
                  <div>
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <MessageSquare className="w-4 h-4" />
                      Step Notes
                    </h4>
                    <textarea
                      value={activeStepNotes[currentStep.id] || ''}
                      onChange={(e) => setActiveStepNotes(prev => ({
                        ...prev,
                        [currentStep.id]: e.target.value
                      }))}
                      placeholder="Add notes for this step..."
                      className="w-full p-3 border rounded-lg resize-none bg-background"
                      rows={3}
                    />
                  </div>
                  
                  {/* Step Actions */}
                  <div className="flex items-center gap-3">
                    <Button
                      onClick={() => handleCompleteStep(currentStep.id)}
                      leftIcon={<CheckCircle className="w-4 h-4" />}
                      className="flex-1"
                    >
                      Complete Step
                    </Button>
                    
                    {currentStep.type === 'communication' && (
                      <Button
                        variant="outline"
                        leftIcon={<Mail className="w-4 h-4" />}
                      >
                        Send Email
                      </Button>
                    )}
                    
                    {currentStep.type === 'documentation' && (
                      <Button
                        variant="outline"
                        leftIcon={<Download className="w-4 h-4" />}
                      >
                        Download Template
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <CheckCircle className="w-16 h-16 mx-auto mb-4 text-sage-500" />
                  <h3 className="text-lg font-semibold mb-2">Workflow Complete!</h3>
                  <p className="text-muted-foreground">
                    You've successfully completed all steps in this workflow.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div className="p-6 border-t bg-neutral-50 dark:bg-neutral-900">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Started {new Date(action.updatedAt).toLocaleString()}
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={() => onUpdateNotes(notes)}
                leftIcon={<MessageSquare className="w-4 h-4" />}
              >
                Save Notes
              </Button>
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
              {completedSteps === action.workflow.totalSteps && (
                <Button leftIcon={<CheckCircle className="w-4 h-4" />}>
                  Workflow Complete
                </Button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

// Action Analytics Component
interface ActionAnalyticsProps {
  actions: ActionItem[]
}

const ActionAnalytics: React.FC<ActionAnalyticsProps> = ({ actions }) => {
  const analytics = React.useMemo(() => {
    const total = actions.length
    const completed = actions.filter(a => a.completed).length
    const completionRate = total > 0 ? (completed / total) * 100 : 0
    
    const averageTimeToComplete = actions
      .filter(a => a.completed)
      .reduce((acc, action) => {
        const created = new Date(action.createdAt).getTime()
        const updated = new Date(action.updatedAt).getTime()
        return acc + (updated - created)
      }, 0) / Math.max(1, completed)
    
    const priorityBreakdown = actions.reduce((acc, action) => {
      acc[action.priority] = (acc[action.priority] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    
    const categoryBreakdown = actions.reduce((acc, action) => {
      acc[action.category] = (acc[action.category] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    
    return {
      total,
      completed,
      completionRate,
      averageTimeToComplete: Math.round(averageTimeToComplete / (1000 * 60 * 60)), // hours
      priorityBreakdown,
      categoryBreakdown
    }
  }, [actions])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6 text-center">
            <div className="text-3xl font-bold text-guardian-600 mb-1">
              {analytics.completionRate.toFixed(1)}%
            </div>
            <div className="text-sm text-muted-foreground">Completion Rate</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6 text-center">
            <div className="text-3xl font-bold text-sage-600 mb-1">
              {analytics.averageTimeToComplete}h
            </div>
            <div className="text-sm text-muted-foreground">Avg. Time to Complete</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6 text-center">
            <div className="text-3xl font-bold text-guardian-600 mb-1">
              {Object.keys(analytics.categoryBreakdown).length}
            </div>
            <div className="text-sm text-muted-foreground">Categories</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6 text-center">
            <div className="text-3xl font-bold text-alert-600 mb-1">
              {analytics.priorityBreakdown.critical || 0}
            </div>
            <div className="text-sm text-muted-foreground">Critical Actions</div>
          </CardContent>
        </Card>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Priority Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(analytics.priorityBreakdown).map(([priority, count]) => (
                <div key={priority} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      'w-3 h-3 rounded-full',
                      priority === 'critical' && 'bg-danger-500',
                      priority === 'high' && 'bg-alert-500',
                      priority === 'medium' && 'bg-guardian-500',
                      priority === 'low' && 'bg-sage-500'
                    )} />
                    <span className="capitalize">{priority}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{count}</span>
                    <span className="text-sm text-muted-foreground">
                      ({Math.round((count / analytics.total) * 100)}%)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Category Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(analytics.categoryBreakdown)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 6)
                .map(([category, count]) => (
                <div key={category} className="flex items-center justify-between">
                  <span className="text-sm">{category.replace(/_/g, ' ')}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 bg-neutral-200 dark:bg-neutral-700 rounded-full h-2">
                      <div 
                        className="bg-guardian-500 h-2 rounded-full"
                        style={{ width: `${(count / analytics.total) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium w-8 text-right">{count}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default EnhancedActionCenter