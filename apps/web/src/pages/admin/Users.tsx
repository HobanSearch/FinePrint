import React from 'react'

const Users: React.FC = () => {
  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-white">User Management</h1>
      <div className="bg-gray-800 rounded-lg p-6">
        <table className="min-w-full">
          <thead>
            <tr className="text-left text-gray-400">
              <th className="pb-4">User</th>
              <th className="pb-4">Email</th>
              <th className="pb-4">Plan</th>
              <th className="pb-4">Status</th>
              <th className="pb-4">Actions</th>
            </tr>
          </thead>
          <tbody className="text-gray-300">
            <tr>
              <td className="py-2">John Doe</td>
              <td className="py-2">john@example.com</td>
              <td className="py-2">Professional</td>
              <td className="py-2"><span className="text-green-400">Active</span></td>
              <td className="py-2">
                <button className="text-indigo-400 hover:text-indigo-300">Edit</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default Users
