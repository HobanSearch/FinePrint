import React, { Suspense } from 'react'
import { 
  BrowserRouter, 
  Routes, 
  Route, 
  Navigate 
} from 'react-router-dom'
import { ErrorBoundary } from 'react-error-boundary'
import { ProtectedRoute } from './ProtectedRoute'
import { DashboardLayout } from '../layout/DashboardLayout'
import { AuthLayout } from '../layout/AuthLayout'
import { PublicLayout } from '../layout/PublicLayout'
import { LoadingPage } from '../ui/LoadingPage'
import { ErrorFallback } from '../ui/ErrorFallback'

// Lazy load pages for code splitting
const Dashboard = React.lazy(() => import('../../pages/Dashboard'))
const Analysis = React.lazy(() => import('../../pages/Analysis'))
const AnalysisDetail = React.lazy(() => import('../../pages/AnalysisDetail'))
const Upload = React.lazy(() => import('../../pages/Upload'))
const Actions = React.lazy(() => import('../../pages/Actions'))
const Documents = React.lazy(() => import('../../pages/Documents'))
const Settings = React.lazy(() => import('../../pages/Settings'))
const Profile = React.lazy(() => import('../../pages/Profile'))

// Auth pages
const Login = React.lazy(() => import('../../pages/auth/Login'))
const Signup = React.lazy(() => import('../../pages/auth/Signup'))
const ForgotPassword = React.lazy(() => import('../../pages/auth/ForgotPassword'))
const ResetPassword = React.lazy(() => import('../../pages/auth/ResetPassword'))
const VerifyEmail = React.lazy(() => import('../../pages/auth/VerifyEmail'))

// Public pages
const Landing = React.lazy(() => import('../../pages/public/Landing'))
const About = React.lazy(() => import('../../pages/public/About'))
const Privacy = React.lazy(() => import('../../pages/public/Privacy'))
const Terms = React.lazy(() => import('../../pages/public/Terms'))

// Error pages
const NotFound = React.lazy(() => import('../../pages/errors/NotFound'))
const Unauthorized = React.lazy(() => import('../../pages/errors/Unauthorized'))
const ServerError = React.lazy(() => import('../../pages/errors/ServerError'))

export function AppRouter() {
  return (
    <BrowserRouter>
      <ErrorBoundary
        FallbackComponent={ErrorFallback}
        onError={(error, errorInfo) => {
          console.error('Router Error:', error, errorInfo)
          // You could send this to an error reporting service
        }}
      >
        <Suspense fallback={<LoadingPage />}>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<PublicLayout />}>
              <Route index element={<Landing />} />
              <Route path="about" element={<About />} />
              <Route path="privacy" element={<Privacy />} />
              <Route path="terms" element={<Terms />} />
            </Route>

            {/* Auth routes - only accessible when not authenticated */}
            <Route
              path="/auth"
              element={
                <ProtectedRoute requiresAuth={false}>
                  <AuthLayout />
                </ProtectedRoute>
              }
            >
              <Route path="login" element={<Login />} />
              <Route path="signup" element={<Signup />} />
              <Route path="forgot-password" element={<ForgotPassword />} />
              <Route path="reset-password" element={<ResetPassword />} />
              <Route path="verify-email" element={<VerifyEmail />} />
            </Route>

            {/* Legacy auth routes (redirect to /auth) */}
            <Route path="/login" element={<Navigate to="/auth/login" replace />} />
            <Route path="/signup" element={<Navigate to="/auth/signup" replace />} />
            <Route path="/forgot-password" element={<Navigate to="/auth/forgot-password" replace />} />

            {/* Protected app routes */}
            <Route
              path="/app"
              element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              {/* Dashboard */}
              <Route index element={<Navigate to="/app/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />

              {/* Analysis routes */}
              <Route path="analysis">
                <Route index element={<Analysis />} />
                <Route path=":analysisId" element={<AnalysisDetail />} />
              </Route>

              {/* Upload */}
              <Route path="upload" element={<Upload />} />

              {/* Actions */}
              <Route path="actions" element={<Actions />} />

              {/* Documents */}
              <Route path="documents" element={<Documents />} />

              {/* Settings and Profile */}
              <Route path="settings" element={<Settings />} />
              <Route path="profile" element={<Profile />} />
            </Route>

            {/* Legacy dashboard route (redirect to /app) */}
            <Route path="/dashboard" element={<Navigate to="/app/dashboard" replace />} />

            {/* Admin routes - require admin permissions */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute 
                  requiredPermissions={['admin:read']}
                  fallback={<LoadingPage message="Checking permissions..." />}
                >
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<AdminDashboard />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="system" element={<AdminSystem />} />
              <Route path="analytics" element={<AdminAnalytics />} />
            </Route>

            {/* Error routes */}
            <Route path="/unauthorized" element={<Unauthorized />} />
            <Route path="/server-error" element={<ServerError />} />
            <Route path="/404" element={<NotFound />} />

            {/* Catch all - redirect to 404 */}
            <Route path="*" element={<Navigate to="/404" replace />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </BrowserRouter>
  )
}

// Admin layout (lazy loaded)
const AdminLayout = React.lazy(() => import('../layout/AdminLayout'))
const AdminDashboard = React.lazy(() => import('../../pages/admin/Dashboard'))
const AdminUsers = React.lazy(() => import('../../pages/admin/Users'))
const AdminSystem = React.lazy(() => import('../../pages/admin/System'))
const AdminAnalytics = React.lazy(() => import('../../pages/admin/Analytics'))

// Route configuration for dynamic routing (if needed)
export const routeConfig = {
  public: [
    { path: '/', element: 'Landing', layout: 'PublicLayout' },
    { path: '/about', element: 'About', layout: 'PublicLayout' },
    { path: '/privacy', element: 'Privacy', layout: 'PublicLayout' },
    { path: '/terms', element: 'Terms', layout: 'PublicLayout' }
  ],
  auth: [
    { path: '/auth/login', element: 'Login', layout: 'AuthLayout' },
    { path: '/auth/signup', element: 'Signup', layout: 'AuthLayout' },
    { path: '/auth/forgot-password', element: 'ForgotPassword', layout: 'AuthLayout' },
    { path: '/auth/reset-password', element: 'ResetPassword', layout: 'AuthLayout' },
    { path: '/auth/verify-email', element: 'VerifyEmail', layout: 'AuthLayout' }
  ],
  protected: [
    { path: '/app/dashboard', element: 'Dashboard', layout: 'DashboardLayout' },
    { path: '/app/analysis', element: 'Analysis', layout: 'DashboardLayout' },
    { path: '/app/analysis/:analysisId', element: 'AnalysisDetail', layout: 'DashboardLayout' },
    { path: '/app/upload', element: 'Upload', layout: 'DashboardLayout' },
    { path: '/app/actions', element: 'Actions', layout: 'DashboardLayout' },
    { path: '/app/documents', element: 'Documents', layout: 'DashboardLayout' },
    { path: '/app/settings', element: 'Settings', layout: 'DashboardLayout' },
    { path: '/app/profile', element: 'Profile', layout: 'DashboardLayout' }
  ],
  admin: [
    { path: '/admin', element: 'AdminDashboard', layout: 'AdminLayout', permissions: ['admin:read'] },
    { path: '/admin/users', element: 'AdminUsers', layout: 'AdminLayout', permissions: ['admin:read', 'user:read'] },
    { path: '/admin/system', element: 'AdminSystem', layout: 'AdminLayout', permissions: ['admin:read', 'system:config'] },
    { path: '/admin/analytics', element: 'AdminAnalytics', layout: 'AdminLayout', permissions: ['admin:read'] }
  ]
}

// Navigation helpers
export const navigationPaths = {
  // Public
  home: '/',
  about: '/about',
  privacy: '/privacy',
  terms: '/terms',

  // Auth
  login: '/auth/login',
  signup: '/auth/signup',
  forgotPassword: '/auth/forgot-password',
  resetPassword: '/auth/reset-password',
  verifyEmail: '/auth/verify-email',

  // App
  dashboard: '/app/dashboard',
  analysis: '/app/analysis',
  analysisDetail: (id: string) => `/app/analysis/${id}`,
  upload: '/app/upload',
  actions: '/app/actions',
  documents: '/app/documents',
  settings: '/app/settings',
  profile: '/app/profile',

  // Admin
  admin: '/admin',
  adminUsers: '/admin/users',
  adminSystem: '/admin/system',
  adminAnalytics: '/admin/analytics',

  // Errors
  unauthorized: '/unauthorized',
  serverError: '/server-error',
  notFound: '/404'
}

export default AppRouter