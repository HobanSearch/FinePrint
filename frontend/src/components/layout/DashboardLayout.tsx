import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Menu, 
  X, 
  Home, 
  FileSearch, 
  Shield, 
  Activity, 
  Settings, 
  HelpCircle,
  Moon,
  Sun,
  Bell,
  User,
  LogOut
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import { ANIMATION_VARIANTS } from '@/lib/constants'

export interface DashboardLayoutProps {
  children: React.ReactNode
  title?: string
  subtitle?: string
  actions?: React.ReactNode
  className?: string
  sidebarContent?: React.ReactNode
  showBreadcrumbs?: boolean
  breadcrumbs?: Array<{ label: string; href?: string }>
}

interface NavigationItem {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  href: string
  badge?: string | number
  active?: boolean
}

const navigation: NavigationItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: Home, href: '/', active: true },
  { id: 'analyze', label: 'Analyze', icon: FileSearch, href: '/analyze' },
  { id: 'monitoring', label: 'Monitoring', icon: Activity, href: '/monitoring', badge: 3 },
  { id: 'actions', label: 'Action Center', icon: Shield, href: '/actions', badge: 'New' },
  { id: 'settings', label: 'Settings', icon: Settings, href: '/settings' },
  { id: 'help', label: 'Help & Support', icon: HelpCircle, href: '/help' },
]

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  title,
  subtitle,
  actions,
  className,
  sidebarContent,
  showBreadcrumbs = false,
  breadcrumbs = [],
}) => {
  const [sidebarOpen, setSidebarOpen] = React.useState(false)
  const [darkMode, setDarkMode] = React.useState(false)

  // Close sidebar on route change (mobile)
  React.useEffect(() => {
    setSidebarOpen(false)
  }, [title])

  return (
    <div className={cn('min-h-screen bg-background', className)}>
      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={cn(
        'fixed top-0 left-0 z-50 h-full w-64 transform bg-card border-r border-border transition-transform duration-300 ease-in-out lg:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg gradient-guardian flex items-center justify-center">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="font-bold text-foreground">Fine Print AI</div>
                <div className="text-xs text-muted-foreground">Guardian Sage</div>
              </div>
            </div>
            
            <Button
              variant="ghost"
              size="icon-sm"
              className="lg:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-2 space-y-1">
            {navigation.map((item) => (
              <a
                key={item.id}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                  item.active
                    ? 'bg-guardian-100 text-guardian-700 dark:bg-guardian-950 dark:text-guardian-300'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1">{item.label}</span>
                {item.badge && (
                  <Badge 
                    variant={typeof item.badge === 'string' ? 'guardian' : 'secondary'} 
                    size="sm"
                  >
                    {item.badge}
                  </Badge>
                )}
              </a>
            ))}
          </nav>

          {/* Custom sidebar content */}
          {sidebarContent && (
            <div className="p-4 border-t border-border">
              {sidebarContent}
            </div>
          )}

          {/* User Profile */}
          <div className="p-4 border-t border-border">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-guardian-100 dark:bg-guardian-950 flex items-center justify-center">
                <User className="w-4 h-4 text-guardian-600 dark:text-guardian-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground truncate">
                  John Doe
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  Pro Plan
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setDarkMode(!darkMode)}
                title="Toggle theme"
              >
                {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </Button>
              
              <Button
                variant="ghost"
                size="icon-sm"
                title="Notifications"
              >
                <Bell className="w-4 h-4" />
              </Button>
              
              <Button
                variant="ghost"
                size="icon-sm"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:ml-64">
        {/* Top bar */}
        <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-sm border-b border-border">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon-sm"
                className="lg:hidden"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="w-4 h-4" />
              </Button>

              <div className="space-y-1">
                {showBreadcrumbs && breadcrumbs.length > 0 && (
                  <nav className="flex items-center space-x-1 text-sm text-muted-foreground">
                    {breadcrumbs.map((crumb, index) => (
                      <React.Fragment key={index}>
                        {index > 0 && <span>/</span>}
                        {crumb.href ? (
                          <a 
                            href={crumb.href}
                            className="hover:text-foreground transition-colors"
                          >
                            {crumb.label}
                          </a>
                        ) : (
                          <span className="text-foreground">{crumb.label}</span>
                        )}
                      </React.Fragment>
                    ))}
                  </nav>
                )}
                
                {title && (
                  <h1 className="text-xl font-bold text-foreground">
                    {title}
                  </h1>
                )}
                
                {subtitle && (
                  <p className="text-sm text-muted-foreground">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>

            {actions && (
              <div className="flex items-center gap-2">
                {actions}
              </div>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-6">
          <motion.div
            variants={ANIMATION_VARIANTS.fadeIn}
            initial="initial"
            animate="animate"
            className="mx-auto max-w-7xl"
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  )
}

// Quick stats component for dashboard
export interface QuickStatsProps {
  stats: Array<{
    id: string
    label: string
    value: string | number
    change?: {
      value: number
      direction: 'up' | 'down' | 'neutral'
      period: string
    }
    icon?: React.ComponentType<{ className?: string }>
    color?: 'guardian' | 'sage' | 'alert' | 'danger' | 'neutral'
  }>
  className?: string
}

export const QuickStats: React.FC<QuickStatsProps> = ({ stats, className }) => {
  return (
    <div className={cn('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4', className)}>
      {stats.map((stat, index) => (
        <motion.div
          key={stat.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
        >
          <Card hover="lift" className="p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                {stat.change && (
                  <div className={cn(
                    'flex items-center gap-1 text-xs font-medium',
                    stat.change.direction === 'up' && 'text-sage-600',
                    stat.change.direction === 'down' && 'text-danger-600',
                    stat.change.direction === 'neutral' && 'text-muted-foreground'
                  )}>
                    <span>
                      {stat.change.direction === 'up' && '+'}
                      {stat.change.value}%
                    </span>
                    <span className="text-muted-foreground">vs {stat.change.period}</span>
                  </div>
                )}
              </div>
              
              {stat.icon && (
                <div className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center',
                  stat.color === 'guardian' && 'bg-guardian-100 text-guardian-600 dark:bg-guardian-950 dark:text-guardian-400',
                  stat.color === 'sage' && 'bg-sage-100 text-sage-600 dark:bg-sage-950 dark:text-sage-400',
                  stat.color === 'alert' && 'bg-alert-100 text-alert-600 dark:bg-alert-950 dark:text-alert-400',
                  stat.color === 'danger' && 'bg-danger-100 text-danger-600 dark:bg-danger-950 dark:text-danger-400',
                  (!stat.color || stat.color === 'neutral') && 'bg-muted text-muted-foreground'
                )}>
                  <stat.icon className="w-4 h-4" />
                </div>
              )}
            </div>
          </Card>
        </motion.div>
      ))}
    </div>
  )
}