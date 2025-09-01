import React, { useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import clsx from 'clsx'
import {
  ChartBarIcon,
  UsersIcon,
  CpuChipIcon,
  BeakerIcon,
  ChartPieIcon,
  ShieldCheckIcon,
  ServerStackIcon,
  DocumentChartBarIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  XMarkIcon,
  BellIcon,
  MagnifyingGlassIcon
} from '@heroicons/react/24/outline'

interface NavItem {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  badge?: string
}

const AdminLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  const navigation: NavItem[] = [
    { name: 'Overview', href: '/admin/dashboard', icon: ChartBarIcon },
    { name: 'Users', href: '/admin/users', icon: UsersIcon, badge: '2.3k' },
    { name: 'AI Models', href: '/admin/models', icon: CpuChipIcon },
    { name: 'A/B Testing', href: '/admin/experiments', icon: BeakerIcon, badge: '3 active' },
    { name: 'Analytics', href: '/admin/analytics', icon: ChartPieIcon },
    { name: 'Security', href: '/admin/security', icon: ShieldCheckIcon },
    { name: 'Infrastructure', href: '/admin/infrastructure', icon: ServerStackIcon },
    { name: 'Reports', href: '/admin/reports', icon: DocumentChartBarIcon },
    { name: 'Settings', href: '/admin/settings', icon: Cog6ToothIcon }
  ]

  const isActive = (href: string) => location.pathname === href

  const handleLogout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    navigate('/auth/login')
  }

  return (
    <div className="min-h-screen bg-gray-900">
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
              className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-gray-800 lg:hidden"
            >
              <div className="flex h-16 items-center justify-between px-6 border-b border-gray-700">
                <Link to="/admin/dashboard" className="flex items-center space-x-2">
                  <ShieldCheckIcon className="h-8 w-8 text-indigo-400" />
                  <span className="text-xl font-bold text-white">Admin Panel</span>
                </Link>
                <button
                  type="button"
                  className="rounded-md text-gray-400 hover:text-gray-300"
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
                        'flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium',
                        isActive(item.href)
                          ? 'bg-gray-900 text-white'
                          : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                      )}
                      onClick={() => setSidebarOpen(false)}
                    >
                      <div className="flex items-center">
                        <item.icon className="mr-3 h-5 w-5" />
                        {item.name}
                      </div>
                      {item.badge && (
                        <span className="inline-flex items-center rounded-full bg-gray-900 px-2 py-0.5 text-xs font-medium text-gray-300">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              </nav>
              <div className="border-t border-gray-700 p-4">
                <button
                  onClick={() => navigate('/app/dashboard')}
                  className="flex w-full items-center rounded-md px-3 py-2 text-sm font-medium text-gray-300 hover:bg-gray-700 hover:text-white mb-2"
                >
                  Back to App
                </button>
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center rounded-md px-3 py-2 text-sm font-medium text-gray-300 hover:bg-gray-700 hover:text-white"
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
        <div className="flex flex-1 flex-col bg-gray-800">
          <div className="flex h-16 items-center px-6 border-b border-gray-700">
            <Link to="/admin/dashboard" className="flex items-center space-x-2">
              <ShieldCheckIcon className="h-8 w-8 text-indigo-400" />
              <span className="text-xl font-bold text-white">Admin Panel</span>
            </Link>
          </div>
          <nav className="flex-1 overflow-y-auto py-4">
            <div className="space-y-1 px-3">
              {navigation.map((item) => (
                <Link
                  key={item.name}
                  to={item.href}
                  className={clsx(
                    'flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive(item.href)
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                  )}
                >
                  <div className="flex items-center">
                    <item.icon className="mr-3 h-5 w-5" />
                    {item.name}
                  </div>
                  {item.badge && (
                    <span className="inline-flex items-center rounded-full bg-gray-900 px-2 py-0.5 text-xs font-medium text-gray-400">
                      {item.badge}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </nav>
          <div className="border-t border-gray-700 p-4">
            <button
              onClick={() => navigate('/app/dashboard')}
              className="flex w-full items-center rounded-md px-3 py-2 text-sm font-medium text-gray-300 hover:bg-gray-700 hover:text-white mb-2"
            >
              Back to App
            </button>
            <button
              onClick={handleLogout}
              className="flex w-full items-center rounded-md px-3 py-2 text-sm font-medium text-gray-300 hover:bg-gray-700 hover:text-white"
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
        <div className="sticky top-0 z-30 flex h-16 items-center gap-x-4 border-b border-gray-700 bg-gray-800 px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8">
          <button
            type="button"
            className="lg:hidden rounded-md text-gray-400 hover:text-gray-300"
            onClick={() => setSidebarOpen(true)}
          >
            <Bars3Icon className="h-6 w-6" />
          </button>

          {/* Separator */}
          <div className="h-6 w-px bg-gray-700 lg:hidden" />

          <div className="flex flex-1 gap-x-4 justify-between items-center lg:gap-x-6">
            {/* Search */}
            <div className="flex flex-1 max-w-md">
              <div className="relative w-full">
                <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  placeholder="Search users, settings..."
                  className="block w-full rounded-md border-0 bg-gray-700 py-1.5 pl-10 pr-3 text-gray-300 placeholder:text-gray-400 focus:bg-gray-600 focus:text-white focus:ring-2 focus:ring-inset focus:ring-indigo-500 sm:text-sm sm:leading-6"
                />
              </div>
            </div>

            <div className="flex items-center gap-x-4">
              {/* System Status */}
              <div className="hidden sm:flex items-center gap-x-2 text-sm">
                <span className="text-gray-400">System:</span>
                <span className="flex items-center gap-x-1">
                  <span className="h-2 w-2 rounded-full bg-green-400"></span>
                  <span className="text-green-400">Operational</span>
                </span>
              </div>

              {/* Notifications */}
              <button
                type="button"
                className="relative rounded-full p-1 text-gray-400 hover:text-gray-300"
              >
                <span className="sr-only">View notifications</span>
                <BellIcon className="h-6 w-6" />
                <span className="absolute top-0 right-0 block h-2 w-2 rounded-full bg-red-400 ring-2 ring-gray-800" />
              </button>

              {/* Profile */}
              <div className="relative">
                <button className="flex items-center rounded-full bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-800">
                  <img
                    className="h-8 w-8 rounded-full"
                    src="https://ui-avatars.com/api/?name=Admin&background=6366f1&color=fff"
                    alt="Admin"
                  />
                </button>
              </div>
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

export default AdminLayout