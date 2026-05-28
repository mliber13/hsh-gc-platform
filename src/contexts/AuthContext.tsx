// ============================================================================
// Authentication Context
// ============================================================================

import React, { createContext, useContext, useEffect, useState } from 'react'
import { User, Session, AuthError } from '@supabase/supabase-js'
import { supabase, isOnlineMode } from '@/lib/supabase'
import { getCurrentUserProfile, UserProfile } from '@/services/userService'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  /** Full profile row (legacy + Phase 1 RBAC fields). */
  profile: UserProfile | null
  profileLoading: boolean
  /** RBAC role array from profiles.roles */
  roles: string[]
  isMeetingOperator: boolean
  canAdminQb: boolean
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
  const [needsNewPassword, setNeedsNewPassword] = useState(false)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(true)

  useEffect(() => {
    if (!isOnline) {
      setLoading(false)
      return
    }

    const pathname = window.location.pathname
    const hashRaw = window.location.hash.replace(/^#/, '')
    const hashParams = new URLSearchParams(hashRaw)
    const searchParams = new URLSearchParams(window.location.search)
    const isRecoveryUrl =
      hashParams.get('type') === 'recovery' ||
      searchParams.get('type') === 'recovery' ||
      (window.location.hash || '').includes('type=recovery')

    if (pathname === '/reset-password' && isRecoveryUrl) {
      setNeedsNewPassword(true)
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setNeedsNewPassword(true)
      }
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [isOnline])

  useEffect(() => {
    if (!isOnline || !user) {
      setProfile(null)
      setProfileLoading(false)
      return
    }

    let cancelled = false
    setProfileLoading(true)
    getCurrentUserProfile()
      .then((p) => {
        if (!cancelled) setProfile(p)
      })
      .catch((error) => {
        console.error('Error loading user profile:', error)
        if (!cancelled) setProfile(null)
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [isOnline, user?.id])

  const clearRecoveryMode = () => {
    setNeedsNewPassword(false)
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
    setProfile(null)
  }

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    return { error }
  }

  const roles = profile?.roles ?? []
  const isMeetingOperator = Boolean(
    profile?.is_meeting_operator ?? profile?.isMeetingOperator,
  )
  const canAdminQb = Boolean(profile?.can_admin_qb ?? profile?.canAdminQb)

  const value = {
    user,
    session,
    loading,
    profile,
    profileLoading,
    roles,
    isMeetingOperator,
    canAdminQb,
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
