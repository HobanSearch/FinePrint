import React, { useState } from 'react'
import { BellIcon, EnvelopeIcon, GlobeAltIcon, ShieldCheckIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const Settings: React.FC = () => {
  const [notifications, setNotifications] = useState({
    email: true,
    push: false,
    analysisComplete: true,
    weeklyReport: true,
    securityAlerts: true
  })

  const handleNotificationChange = (key: string) => {
    setNotifications(prev => ({
      ...prev,
      [key]: !prev[key]
    }))
    toast.success('Settings updated')
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-2">Manage your application preferences</p>
      </div>

      {/* Notifications */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-center mb-6">
          <BellIcon className="h-6 w-6 text-gray-400 mr-3" />
          <h2 className="text-xl font-semibold text-gray-900">Notifications</h2>
        </div>
        
        <div className="space-y-4">
          {Object.entries(notifications).map(([key, value]) => (
            <label key={key} className="flex items-center justify-between cursor-pointer">
              <span className="text-gray-700 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
              <input
                type="checkbox"
                checked={value}
                onChange={() => handleNotificationChange(key)}
                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
              />
            </label>
          ))}
        </div>
      </div>

      {/* Privacy */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-center mb-6">
          <ShieldCheckIcon className="h-6 w-6 text-gray-400 mr-3" />
          <h2 className="text-xl font-semibold text-gray-900">Privacy</h2>
        </div>
        
        <div className="space-y-4">
          <label className="flex items-center justify-between">
            <span className="text-gray-700">Share usage analytics</span>
            <input type="checkbox" className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded" />
          </label>
          <label className="flex items-center justify-between">
            <span className="text-gray-700">Allow marketing emails</span>
            <input type="checkbox" className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded" />
          </label>
        </div>
      </div>
    </div>
  )
}

export default Settings
