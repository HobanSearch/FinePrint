'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Play, Pause, Monitor, Smartphone, Tablet } from 'lucide-react'
import { cn } from '@/lib/utils'

const deviceViews = [
  { id: 'desktop', name: 'Desktop', icon: Monitor },
  { id: 'tablet', name: 'Tablet', icon: Tablet },
  { id: 'mobile', name: 'Mobile', icon: Smartphone },
]

export function DemoSection() {
  const [isPlaying, setIsPlaying] = useState(false)
  const [activeDevice, setActiveDevice] = useState('desktop')

  return (
    <section className="py-20 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
            See Fine Print AI in Action
          </h2>
          <p className="mt-4 text-xl text-gray-600 max-w-3xl mx-auto">
            Watch how quickly we analyze complex legal documents and surface critical information
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="mt-12"
        >
          {/* Device selector */}
          <div className="flex justify-center mb-8">
            <div className="inline-flex items-center p-1 bg-gray-100 rounded-lg">
              {deviceViews.map((device) => {
                const Icon = device.icon
                return (
                  <button
                    key={device.id}
                    onClick={() => setActiveDevice(device.id)}
                    className={cn(
                      'flex items-center px-4 py-2 rounded-md text-sm font-medium transition-all',
                      activeDevice === device.id
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    )}
                  >
                    <Icon className="h-4 w-4 mr-2" />
                    {device.name}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Demo container */}
          <div className="relative mx-auto max-w-5xl">
            {/* Browser/Device frame */}
            <div className={cn(
              'relative bg-gray-900 rounded-xl shadow-2xl overflow-hidden',
              activeDevice === 'desktop' && 'aspect-[16/9]',
              activeDevice === 'tablet' && 'aspect-[4/3] max-w-3xl mx-auto',
              activeDevice === 'mobile' && 'aspect-[9/16] max-w-sm mx-auto'
            )}>
              {/* Browser bar */}
              <div className="bg-gray-800 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                </div>
                <div className="flex-1 mx-4">
                  <div className="bg-gray-700 rounded-md px-3 py-1 text-xs text-gray-300 text-center">
                    app.fineprint.ai
                  </div>
                </div>
              </div>

              {/* Demo content */}
              <div className="relative bg-gray-100 h-full">
                {/* Placeholder for demo video/animation */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <button
                      onClick={() => setIsPlaying(!isPlaying)}
                      className="inline-flex items-center justify-center w-20 h-20 bg-primary-600 hover:bg-primary-700 rounded-full text-white shadow-lg transition-all hover:scale-105"
                    >
                      {isPlaying ? (
                        <Pause className="h-8 w-8" />
                      ) : (
                        <Play className="h-8 w-8 ml-1" />
                      )}
                    </button>
                    <p className="mt-4 text-gray-600">
                      Interactive demo coming soon
                    </p>
                  </div>
                </div>

                {/* Demo UI mockup overlay */}
                <div className="absolute inset-0 pointer-events-none">
                  <img
                    src="/demo-screenshot.png"
                    alt="Fine Print AI Demo"
                    className="w-full h-full object-cover opacity-20"
                  />
                </div>
              </div>
            </div>

            {/* Shadow */}
            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-3/4 h-8 bg-black/10 blur-xl rounded-full" />
          </div>

          {/* Feature highlights */}
          <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="text-center">
              <div className="text-3xl font-bold text-primary-600">3.7s</div>
              <div className="mt-1 text-gray-600">Average analysis time</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-accent-600">98%</div>
              <div className="mt-1 text-gray-600">Accuracy rate</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-success-600">50+</div>
              <div className="mt-1 text-gray-600">Risk patterns detected</div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}