// ============================================================================
// CrewSignupPage — public invite-based crew account creation (D.6.1)
// ============================================================================

import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import {
  consumeCrewInviteToken,
  fetchCrewInviteByToken,
} from '@/services/crewInviteService'
import type { CrewInviteToken } from '@/types/crew'
import hshLogo from '/HSH Contractor Logo - Color.png'

export function CrewSignupPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') ?? ''

  const [invite, setInvite] = useState<CrewInviteToken | null | undefined>(undefined)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!token.trim()) {
      setInvite(null)
      return
    }
    let cancelled = false
    fetchCrewInviteByToken(token)
      .then((row) => {
        if (!cancelled) {
          setInvite(row)
          if (row?.invitedEmail) setEmail(row.invitedEmail)
        }
      })
      .catch(() => {
        if (!cancelled) setInvite(null)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!token.trim() || !invite) {
      setError('This invite link is no longer valid.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setLoading(true)
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      })

      if (signUpError) {
        setError(signUpError.message)
        return
      }

      const userId = data.user?.id
      if (!userId) {
        setError('Account could not be created. Please try again.')
        return
      }

      if (!data.session) {
        setError(
          'Check your email to verify your account, then sign in. You may need a new invite link after verifying.',
        )
        return
      }

      await consumeCrewInviteToken(token, { userId })
      navigate('/crew', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed')
    } finally {
      setLoading(false)
    }
  }

  if (invite === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#213069] to-[#1a2654] p-4">
        <div className="size-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
      </div>
    )
  }

  if (!invite) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#213069] to-[#1a2654] p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-4">
            <div className="flex justify-center">
              <img src={hshLogo} alt="HSH Contractor" className="h-20 w-auto" />
            </div>
            <CardTitle className="text-center">Invite link unavailable</CardTitle>
            <CardDescription className="text-center">
              This invite link is no longer valid. It may have expired, already been used, or
              been revoked. Contact your office administrator for a new link.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#213069] to-[#1a2654] p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4">
          <div className="flex justify-center">
            <img src={hshLogo} alt="HSH Contractor" className="h-20 w-auto" />
          </div>
          <CardTitle className="text-center">Create your crew account</CardTitle>
          <CardDescription className="text-center">
            Set a password to access your assigned projects and field updates.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-red-700">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="crew-email">Email</Label>
              <Input
                id="crew-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="crew-password">Password</Label>
              <Input
                id="crew-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="crew-confirm">Confirm password</Label>
              <Input
                id="crew-confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-[#E65133] to-[#C0392B] hover:from-[#D14520] hover:to-[#A93226]"
              disabled={loading}
            >
              {loading ? 'Creating account…' : 'Create account'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
