import React, { Suspense, lazy } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'

// Layouts
import PublicLayout from './layouts/PublicLayout'
import AppLayout from './layouts/AppLayout'
import AdminLayout from './layouts/AdminLayout'

// Auth components
import ProtectedRoute from './components/auth/ProtectedRoute'

// Public pages
import Landing from './pages/public/Landing'
import Pricing from './pages/Pricing'
const About = lazy(() => import('./pages/public/About'))
const Features = lazy(() => import('./pages/public/Features'))
const Contact = lazy(() => import('./pages/public/Contact'))

// Auth pages
import Login from './pages/auth/Login'
import SignUp from './pages/auth/SignUp'
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'))

// App pages (authenticated)
const Dashboard = lazy(() => import('./pages/app/Dashboard'))
const Analyze = lazy(() => import('./pages/app/Analyze'))
const History = lazy(() => import('./pages/app/History'))
const Billing = lazy(() => import('./pages/account/Billing'))
const Profile = lazy(() => import('./pages/app/Profile'))
const Settings = lazy(() => import('./pages/app/Settings'))

// Admin pages
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'))
const AdminUsers = lazy(() => import('./pages/admin/Users'))
const AdminModels = lazy(() => import('./pages/admin/Models'))
const AdminExperiments = lazy(() => import('./pages/admin/Experiments'))
const AdminAnalytics = lazy(() => import('./pages/admin/Analytics'))
const AdminSecurity = lazy(() => import('./pages/admin/Security'))
const AdminInfrastructure = lazy(() => import('./pages/admin/Infrastructure'))
const AdminReports = lazy(() => import('./pages/admin/Reports'))
const AdminSettings = lazy(() => import('./pages/admin/Settings'))

// Create query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
})

// Loading component
const Loading: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
      <p className="text-gray-600">Loading...</p>
    </div>
  </div>
)

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Suspense fallback={<Loading />}>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<PublicLayout />}>
              <Route index element={<Landing />} />
              <Route path="pricing" element={<Pricing />} />
              <Route path="about" element={<About />} />
              <Route path="features" element={<Features />} />
              <Route path="contact" element={<Contact />} />
              <Route path="privacy" element={<div>Privacy Policy</div>} />
              <Route path="terms" element={<div>Terms of Service</div>} />
            </Route>

            {/* Auth routes (no layout) */}
            <Route path="/auth">
              <Route path="login" element={<Login />} />
              <Route path="signup" element={<SignUp />} />
              <Route path="forgot-password" element={<ForgotPassword />} />
            </Route>

            {/* App routes (authenticated) */}
            <Route
              path="/app"
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/app/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="analyze" element={<Analyze />} />
              <Route path="history" element={<History />} />
              <Route path="billing" element={<Billing />} />
              <Route path="profile" element={<Profile />} />
              <Route path="settings" element={<Settings />} />
            </Route>

            {/* Admin routes (admin only) */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute requireAdmin>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/admin/dashboard" replace />} />
              <Route path="dashboard" element={<AdminDashboard />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="models" element={<AdminModels />} />
              <Route path="experiments" element={<AdminExperiments />} />
              <Route path="analytics" element={<AdminAnalytics />} />
              <Route path="security" element={<AdminSecurity />} />
              <Route path="infrastructure" element={<AdminInfrastructure />} />
              <Route path="reports" element={<AdminReports />} />
              <Route path="settings" element={<AdminSettings />} />
            </Route>

            {/* Checkout route (authenticated, special layout) */}
            <Route
              path="/checkout"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<Loading />}>
                    {lazy(() => import('./pages/Checkout'))}
                  </Suspense>
                </ProtectedRoute>
              }
            />

            {/* Catch all - redirect to home */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>

        {/* Global toast notifications */}
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#363636',
              color: '#fff',
            },
            success: {
              style: {
                background: '#10b981',
              },
            },
            error: {
              style: {
                background: '#ef4444',
              },
            },
          }}
        />
      </Router>
    </QueryClientProvider>
  )
}

export default App