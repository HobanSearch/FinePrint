import { Metadata } from 'next'
import { DemoInterface } from '@/components/sections/DemoInterface'

export const metadata: Metadata = {
  title: 'Live Demo | Fine Print AI',
  description: 'Try Fine Print AI with sample documents. See how quickly we analyze terms of service and privacy policies.',
}

export default function DemoPage() {
  return (
    <main className="pt-16 min-h-screen bg-gray-50">
      <DemoInterface />
    </main>
  )
}