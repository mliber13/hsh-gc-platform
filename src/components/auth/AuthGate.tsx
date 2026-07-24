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
import { SetNewPassword } from './SetNewPassword'
import { PendingAccount } from './PendingAccount'

/**
 * An account is "unprovisioned" when it has authenticated but was never linked
 * to an org and holds no real role — only a bare `viewer` (or nothing). Every
 * legitimate user has either a real role (owner, office, field, or crew) or an
 * organization; this fingerprint is the orphaned crew-signup that would
 * otherwise get read access to every operator workspace.
 */
function isUnprovisioned(
  organizationId: string | null | undefined,
  roles: string[],
): boolean {
  const hasOrg = Boolean(organizationId)
  const hasRealRole = roles.some((r) => r && r !== 'viewer')
  return !hasOrg && !hasRealRole
}

type AuthView = 'login' | 'signup' | 'reset'

interface AuthGateProps {
  children: React.ReactNode
}

export function AuthGate({ children }: AuthGateProps) {
  const { user, loading, isOnline, needsNewPassword, clearRecoveryMode, profile, profileLoading } =
    useAuth()
  const [authView, setAuthView] = useState<AuthView>('login')

  // User landed via password-reset link: show set-new-password form instead of app
  if (user && needsNewPassword) {
    return (
      <SetNewPassword
        onSuccess={() => {
          clearRecoveryMode()
        }}
      />
    )
  }

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

  // Authenticated but never linked to an org/role: park them on a "pending"
  // screen instead of dropping them into the app as a read-everything viewer.
  // Wait for the profile to load first so a legit user isn't flashed the screen
  // during the initial fetch.
  if (!profileLoading && isUnprovisioned(profile?.organization_id, profile?.roles ?? [])) {
    return <PendingAccount />
  }

  // User is authenticated, show the app
  return <>{children}</>
}

