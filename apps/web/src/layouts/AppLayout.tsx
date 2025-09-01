import React, { useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import clsx from 'clsx'
import {
  HomeIcon,
  DocumentMagnifyingGlassIcon,
  ClockIcon,
  CreditCardIcon,
  UserCircleIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  XMarkIcon,
  BellIcon,
  QuestionMarkCircleIcon
} from '@heroicons/react/24/outline'

interface NavItem {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

const AppLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  const navigation: NavItem[] = [
    { name: 'Dashboard', href: '/app/dashboard', icon: HomeIcon },
    { name: 'Analyze', href: '/app/analyze', icon: DocumentMagnifyingGlassIcon },
    { name: 'History', href: '/app/history', icon: ClockIcon },
    { name: 'Billing', href: '/app/billing', icon: CreditCardIcon },
    { name: 'Profile', href: '/app/profile', icon: UserCircleIcon },
    { name: 'Settings', href: '/app/settings', icon: Cog6ToothIcon }
  ]

  const isActive = (href: string) => location.pathname === href

  const handleLogout = () => {
    // Clear auth tokens
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    // Navigate to login
    navigate('/auth/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-gray-600 bg-opacity-75 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />

            {/* Sidebar */}
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'tween', duration: 0.3 }}
              className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-white lg:hidden"
            >
              <div className="flex h-16 items-center justify-between px-6 border-b border-gray-200">
                <Link to="/app/dashboard" className="flex items-center space-x-2">
                  <DocumentMagnifyingGlassIcon className="h-8 w-8 text-indigo-600" />
                  <span className="text-xl font-bold text-gray-900">Fine Print AI</span>
                </Link>
                <button
                  type="button"
                  className="rounded-md text-gray-400 hover:text-gray-500"
                  onClick={() => setSidebarOpen(false)}
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto py-4">
                <div className="space-y-1 px-3">
                  {navigation.map((item) => (
                    <Link
                      key={item.name}
                      to={item.href}
                      className={clsx(
                        'flex items-center rounded-md px-3 py-2 text-sm font-medium',
                        isActive(item.href)
                          ? 'bg-indigo-50 text-indigo-600'
                          : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                      )}
                      onClick={() => setSidebarOpen(false)}
                    >
                      <item.icon className="mr-3 h-5 w-5" />
                      {item.name}
                    </Link>
                  ))}
                </div>
              </nav>
              <div className="border-t border-gray-200 p-4">
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                >
                  <ArrowRightOnRectangleIcon className="mr-3 h-5 w-5" />
                  Sign Out
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-72 lg:flex-col">
        <div className="flex flex-1 flex-col bg-white border-r border-gray-200">
          <div className="flex h-16 items-center px-6 border-b border-gray-200">
            <Link to="/app/dashboard" className="flex items-center space-x-2">
              <DocumentMagnifyingGlassIcon className="h-8 w-8 text-indigo-600" />
              <span className="text-xl font-bold text-gray-900">Fine Print AI</span>
            </Link>
          </div>
          <nav className="flex-1 overflow-y-auto py-4">
            <div className="space-y-1 px-3">
              {navigation.map((item) => (
                <Link
                  key={item.name}
                  to={item.href}
                  className={clsx(
                    'flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive(item.href)
                      ? 'bg-indigo-50 text-indigo-600'
                      : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                  )}
                >
                  <item.icon className="mr-3 h-5 w-5" />
                  {item.name}
                </Link>
              ))}
            </div>
          </nav>
          <div className="border-t border-gray-200 p-4">
            <button
              onClick={handleLogout}
              className="flex w-full items-center rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900"
            >
              <ArrowRightOnRectangleIcon className="mr-3 h-5 w-5" />
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-72">
        {/* Top bar */}
        <div className="sticky top-0 z-30 flex h-16 items-center gap-x-4 border-b border-gray-200 bg-white px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8">
          <button
            type="button"
            className="lg:hidden rounded-md text-gray-700 hover:text-gray-900"
            onClick={() => setSidebarOpen(true)}
          >
            <Bars3Icon className="h-6 w-6" />
          </button>

          {/* Separator */}
          <div className="h-6 w-px bg-gray-200 lg:hidden" />

          <div className="flex flex-1 gap-x-4 justify-end lg:gap-x-6">
            {/* Notifications */}
            <button
              type="button"
              className="relative rounded-full p-1 text-gray-400 hover:text-gray-500"
            >
              <span className="sr-only">View notifications</span>
              <BellIcon className="h-6 w-6" />
              <span className="absolute top-0 right-0 block h-2 w-2 rounded-full bg-red-400 ring-2 ring-white" />
            </button>

            {/* Help */}
            <button
              type="button"
              className="rounded-full p-1 text-gray-400 hover:text-gray-500"
            >
              <span className="sr-only">Help</span>
              <QuestionMarkCircleIcon className="h-6 w-6" />
            </button>

            {/* Profile dropdown placeholder */}
            <div className="relative">
              <button className="flex items-center rounded-full bg-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
                <img
                  className="h-8 w-8 rounded-full"
                  src="https://ui-avatars.com/api/?name=User&background=6366f1&color=fff"
                  alt="User"
                />
              </button>
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="py-8">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

export default AppLayout