import React from 'react'

const AdminSettings: React.FC = () => {
  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-white">Admin Settings</h1>
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-xl font-semibold text-white mb-4">System Configuration</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-gray-400 mb-2">API Rate Limit</label>
            <input type="number" className="px-3 py-2 bg-gray-700 text-white rounded" defaultValue="1000" />
          </div>
          <div>
            <label className="block text-gray-400 mb-2">Max Upload Size (MB)</label>
            <input type="number" className="px-3 py-2 bg-gray-700 text-white rounded" defaultValue="10" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default AdminSettings
