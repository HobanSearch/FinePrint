import React from 'react'

const Security: React.FC = () => {
  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-white">Security</h1>
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-xl font-semibold text-white mb-4">Security Events</h3>
        <p className="text-gray-400">No security incidents in the last 30 days</p>
      </div>
    </div>
  )
}

export default Security
