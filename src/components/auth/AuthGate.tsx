// ============================================================================
// Auth Gate Component
// ============================================================================
//
// Wrapper that shows login/signup or the main app based on auth state
//

import React, { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Login } from './Login'
import { Signup } from './Signup'
import { ResetPassword } from './ResetPassword'

type AuthView = 'login' | 'signup' | 'reset'

interface AuthGateProps {
  children: React.ReactNode
}

export function AuthGate({ children }: AuthGateProps) {
  const { user, loading, isOnline } = useAuth()
  const [authView, setAuthView] = useState<AuthView>('login')

  // Show loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#213069] to-[#1a2654] flex items-center justify-center">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-lg">Loading...</p>
        </div>
      </div>
    )
  }

  // If offline mode, show the app directly without auth
  if (!isOnline) {
    return <>{children}</>
  }

  // If not authenticated, show auth UI
  if (!user) {
    switch (authView) {
      case 'signup':
        return <Signup onSwitchToLogin={() => setAuthView('login')} />
      case 'reset':
        return <ResetPassword onSwitchToLogin={() => setAuthView('login')} />
      default:
        return (
          <Login
            onSwitchToSignup={() => setAuthView('signup')}
            onSwitchToReset={() => setAuthView('reset')}
          />
        )
    }
  }

  // User is authenticated, show the app
  return <>{children}</>
}

