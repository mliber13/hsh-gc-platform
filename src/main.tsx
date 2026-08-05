import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './contexts/AuthContext'
import './index.css'

// Geist variable fonts (loaded once globally)
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'

// Register PWA Service Worker
import { registerSW } from 'virtual:pwa-register'

const updateSW = registerSW({
  immediate: true, // Check for updates immediately
  onNeedRefresh() {
    // Auto-reload when update is available (don't wait for user confirmation)
    updateSW(true)
  },
  onRegistered(registration) {
    if (!registration) return
    const checkForUpdate = () => {
      void registration.update().catch(() => {})
    }
    // Backstop interval while the app stays open.
    setInterval(checkForUpdate, 15 * 60 * 1000)
    // Check whenever the app returns to the foreground (reopening the PWA,
    // switching back to the tab) so field devices pick up deploys promptly
    // instead of waiting for the next interval tick.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkForUpdate()
    })
    window.addEventListener('focus', checkForUpdate)
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
