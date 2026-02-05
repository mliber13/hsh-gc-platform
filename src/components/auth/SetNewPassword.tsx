// ============================================================================
// Set New Password Component
// ============================================================================
//
// Shown when user lands via the password-reset email link. They must set a
// new password before they can use the app.
//

import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import hshLogo from '/HSH Contractor Logo - Color.png'

interface SetNewPasswordProps {
  onSuccess: () => void
}

export function SetNewPassword({ onSuccess }: SetNewPasswordProps) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
    onSuccess()
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#213069] to-[#1a2654] flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex justify-center">
              <img src={hshLogo} alt="HSH Contractor" className="h-24 w-auto" />
            </div>
            <CardTitle className="text-2xl text-center text-green-600">
              Password updated
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-center text-gray-700">
              Your password has been set. You can now use the app.
            </p>
            <Button
              onClick={onSuccess}
              className="w-full bg-gradient-to-r from-[#E65133] to-[#C0392B] hover:from-[#D14520] hover:to-[#A93226]"
            >
              Continue to app
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#213069] to-[#1a2654] flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4">
          <div className="flex justify-center">
            <img src={hshLogo} alt="HSH Contractor" className="h-24 w-auto" />
          </div>
          <CardTitle className="text-2xl text-center">Set new password</CardTitle>
          <CardDescription className="text-center">
            Enter your new password below. You’ll use this to sign in from now on.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Same as above"
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-[#E65133] to-[#C0392B] hover:from-[#D14520] hover:to-[#A93226]"
              disabled={loading}
            >
              {loading ? 'Updating...' : 'Set password'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
