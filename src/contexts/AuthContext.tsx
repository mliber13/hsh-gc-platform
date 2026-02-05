// ============================================================================
// Authentication Context
// ============================================================================

import React, { createContext, useContext, useEffect, useState } from 'react'
import { User, Session, AuthError } from '@supabase/supabase-js'
import { supabase, isOnlineMode } from '@/lib/supabase'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: AuthError | null }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>
  isOnline: boolean
  /** True when user landed via password-reset link; they must set a new password before using the app */
  needsNewPassword: boolean
  clearRecoveryMode: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [isOnline] = useState(isOnlineMode())
  // User landed via password-reset link; must set new password before using app
  const [needsNewPassword, setNeedsNewPassword] = useState(false)

  useEffect(() => {
    // Only set up auth if we're in online mode
    if (!isOnline) {
      setLoading(false)
      return
    }

    // Detect password-reset link: URL is /reset-password with type=recovery in hash (read before Supabase consumes it)
    const pathname = window.location.pathname
    const hash = window.location.hash || ''
    if (pathname === '/reset-password' && hash.includes('type=recovery')) {
      setNeedsNewPassword(true)
    }

    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for changes on auth state (sign in, sign out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [isOnline])

  const clearRecoveryMode = () => {
    setNeedsNewPassword(false)
    // Clean URL so the recovery link is no longer in the address bar
    if (window.history.replaceState) {
      const cleanUrl = window.location.pathname.replace(/^\/reset-password\/?$/, '/') || '/'
      window.history.replaceState({}, '', cleanUrl)
    }
  }

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    return { error }
  }

  const signUp = async (email: string, password: string, fullName?: string) => {
    const { error, data } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    })

    // Create user profile
    if (data.user && !error) {
      await supabase.from('profiles').insert({
        id: data.user.id,
        email: data.user.email!,
        full_name: fullName || null,
      })
    }

    return { error }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    return { error }
  }

  const value = {
    user,
    session,
    loading,
    signIn,
    signUp,
    signOut,
    resetPassword,
    isOnline,
    needsNewPassword,
    clearRecoveryMode,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

