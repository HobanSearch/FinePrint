import React from 'react'

const AdminDashboard: React.FC = () => {
  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-white">Admin Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-gray-800 p-6 rounded-lg">
          <h3 className="text-gray-400 text-sm">Total Users</h3>
          <p className="text-3xl font-bold text-white mt-2">2,341</p>
        </div>
        <div className="bg-gray-800 p-6 rounded-lg">
          <h3 className="text-gray-400 text-sm">Active Sessions</h3>
          <p className="text-3xl font-bold text-white mt-2">142</p>
        </div>
        <div className="bg-gray-800 p-6 rounded-lg">
          <h3 className="text-gray-400 text-sm">API Calls Today</h3>
          <p className="text-3xl font-bold text-white mt-2">8,429</p>
        </div>
        <div className="bg-gray-800 p-6 rounded-lg">
          <h3 className="text-gray-400 text-sm">System Health</h3>
          <p className="text-3xl font-bold text-green-400 mt-2">99.9%</p>
        </div>
      </div>
    </div>
  )
}

export default AdminDashboard
