import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../stores'
import { Skeleton } from '../ui/Skeleton'

interface ProtectedRouteProps {
  children: React.ReactNode
  requiresAuth?: boolean
  requiredPermissions?: string[]
  fallback?: React.ReactNode
}

export function ProtectedRoute({ 
  children, 
  requiresAuth = true,
  requiredPermissions = [],
  fallback 
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth()
  const location = useLocation()

  // Show loading state while checking authentication
  if (isLoading) {
    return fallback || <AuthLoadingSkeleton />
  }

  // Redirect to login if authentication is required but user is not authenticated
  if (requiresAuth && !isAuthenticated) {
    return (
      <Navigate 
        to="/login" 
        state={{ from: location.pathname }}
        replace 
      />
    )
  }

  // Redirect to dashboard if trying to access auth pages while authenticated
  if (!requiresAuth && isAuthenticated) {
    const authPaths = ['/login', '/signup', '/forgot-password', '/reset-password']
    if (authPaths.includes(location.pathname)) {
      return <Navigate to="/dashboard" replace />
    }
  }

  // Check permissions if specified
  if (requiredPermissions.length > 0 && user) {
    const hasPermissions = checkUserPermissions(user, requiredPermissions)
    if (!hasPermissions) {
      return <Navigate to="/unauthorized" replace />
    }
  }

  return <>{children}</>
}

// Helper component for loading state
function AuthLoadingSkeleton() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="space-y-4 w-full max-w-md mx-auto p-6">
        <Skeleton className="h-8 w-3/4 mx-auto" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-32 w-full" />
        <div className="flex space-x-2">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 flex-1" />
        </div>
      </div>
    </div>
  )
}

// Permission checking helper
function checkUserPermissions(user: any, requiredPermissions: string[]): boolean {
  // This would integrate with your actual permission system
  // For now, we'll use a simple role-based check
  
  if (!user.role) return false

  const rolePermissions: Record<string, string[]> = {
    admin: ['*'], // Admin has all permissions
    moderator: [
      'analysis:read',
      'analysis:write',
      'document:read',
      'document:write',
      'user:read'
    ],
    user: [
      'analysis:read',
      'analysis:write',
      'document:read',
      'document:write'
    ]
  }

  const userPermissions = rolePermissions[user.role] || []
  
  // Check if user has admin privileges (wildcard permission)
  if (userPermissions.includes('*')) {
    return true
  }

  // Check if user has all required permissions
  return requiredPermissions.every(permission => 
    userPermissions.includes(permission)
  )
}

// Higher-order component version
export function withProtectedRoute<P extends object>(
  Component: React.ComponentType<P>,
  options: Omit<ProtectedRouteProps, 'children'> = {}
) {
  const ProtectedComponent = (props: P) => (
    <ProtectedRoute {...options}>
      <Component {...props} />
    </ProtectedRoute>
  )

  ProtectedComponent.displayName = `withProtectedRoute(${Component.displayName || Component.name})`
  
  return ProtectedComponent
}

// Route guard hook for programmatic navigation
export function useRouteGuard() {
  const { isAuthenticated, user } = useAuth()
  const location = useLocation()

  const canAccess = (path: string, requiredPermissions: string[] = []) => {
    // Public routes
    const publicRoutes = ['/', '/about', '/privacy', '/terms']
    if (publicRoutes.includes(path)) {
      return true
    }

    // Auth routes (only accessible when not authenticated)
    const authRoutes = ['/login', '/signup', '/forgot-password']
    if (authRoutes.includes(path)) {
      return !isAuthenticated
    }

    // Protected routes require authentication
    if (!isAuthenticated) {
      return false
    }

    // Check permissions if specified
    if (requiredPermissions.length > 0 && user) {
      return checkUserPermissions(user, requiredPermissions)
    }

    return true
  }

  const requiresRedirect = (targetPath: string) => {
    if (!isAuthenticated && !publicRoutes.includes(targetPath)) {
      return '/login'
    }

    if (isAuthenticated && authRoutes.includes(targetPath)) {
      return '/dashboard'
    }

    return null
  }

  return {
    canAccess,
    requiresRedirect,
    isAuthenticated,
    currentPath: location.pathname
  }
}

export default ProtectedRoute