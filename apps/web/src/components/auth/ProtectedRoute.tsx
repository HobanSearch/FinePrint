import React, { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { apiClient } from '../../services/api'

interface ProtectedRouteProps {
  children: React.ReactNode
  requireAdmin?: boolean
  requirePaid?: boolean
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  requireAdmin = false,
  requirePaid = false 
}) => {
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [subscriptionTier, setSubscriptionTier] = useState<string | null>(null)
  const location = useLocation()

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      // Check if user is authenticated
      const authenticated = apiClient.isAuthenticated()
      if (!authenticated) {
        setIsAuthenticated(false)
        setIsLoading(false)
        return
      }

      // Get user info from token or API
      const token = localStorage.getItem('access_token')
      if (token) {
        // Decode JWT to get user info (simple implementation)
        const payload = JSON.parse(atob(token.split('.')[1]))
        setUserRole(payload.role || 'user')
        setSubscriptionTier(payload.subscription || 'free')
        setIsAuthenticated(true)
      }
    } catch (error) {
      console.error('Auth check failed:', error)
      setIsAuthenticated(false)
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    // Redirect to login with return URL
    return <Navigate to="/auth/login" state={{ from: location }} replace />
  }

  if (requireAdmin && userRole !== 'admin') {
    // Non-admin trying to access admin route
    return <Navigate to="/app/dashboard" replace />
  }

  if (requirePaid && subscriptionTier === 'free') {
    // Free user trying to access paid feature
    return <Navigate to="/pricing" state={{ message: 'This feature requires a paid subscription' }} replace />
  }

  return <>{children}</>
}

export default ProtectedRoute