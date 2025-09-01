import React from 'react'

const Infrastructure: React.FC = () => {
  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-white">Infrastructure</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-gray-400 text-sm">CPU Usage</h3>
          <p className="text-2xl font-bold text-white mt-2">42%</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-gray-400 text-sm">Memory</h3>
          <p className="text-2xl font-bold text-white mt-2">8.2 GB / 16 GB</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-gray-400 text-sm">Storage</h3>
          <p className="text-2xl font-bold text-white mt-2">124 GB / 500 GB</p>
        </div>
      </div>
    </div>
  )
}

export default Infrastructure
