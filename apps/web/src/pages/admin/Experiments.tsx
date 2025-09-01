import React from 'react'

const Experiments: React.FC = () => {
  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-white">A/B Testing</h1>
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-xl font-semibold text-white mb-4">Active Experiments</h3>
        <p className="text-gray-400">No active experiments</p>
      </div>
    </div>
  )
}

export default Experiments
