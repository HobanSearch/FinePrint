import React from 'react'

const Models: React.FC = () => {
  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-white">AI Models</h1>
      <div className="grid gap-6">
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-xl font-semibold text-white mb-4">Phi-2 (2.7B)</h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-gray-400">Status:</span>
              <span className="text-green-400 ml-2">Active</span>
            </div>
            <div>
              <span className="text-gray-400">Accuracy:</span>
              <span className="text-white ml-2">94.2%</span>
            </div>
            <div>
              <span className="text-gray-400">Latency:</span>
              <span className="text-white ml-2">120ms</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Models
