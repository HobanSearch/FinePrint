import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { initializePerformanceOptimizations, setPerformanceUtils } from './lib/performance'

// Initialize performance optimizations
initializePerformanceOptimizations().then(utils => {
  setPerformanceUtils(utils)
  
  // Track app initialization performance
  if (window.performance && window.performance.mark) {
    window.performance.mark('app-init-complete')
  }
}).catch(console.error)

// Register service worker for PWA functionality
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', {
      scope: '/'
    }).then((registration) => {
      console.log('SW registered: ', registration)
    }).catch((registrationError) => {
      console.log('SW registration failed: ', registrationError)
    })
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)