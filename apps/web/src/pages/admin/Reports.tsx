import React from 'react'

const Reports: React.FC = () => {
  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-white">Reports</h1>
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-xl font-semibold text-white mb-4">Generate Reports</h3>
        <div className="space-y-4">
          <button className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">
            User Activity Report
          </button>
          <button className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 ml-4">
            Revenue Report
          </button>
        </div>
      </div>
    </div>
  )
}

export default Reports
