// ============================================================================
// Reset Password Component
// ============================================================================

import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/AuthContext'
import hshLogo from '/HSH Contractor Logo - Color.png'

interface ResetPasswordProps {
  onSwitchToLogin: () => void
}

export function ResetPassword({ onSwitchToLogin }: ResetPasswordProps) {
  const { resetPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = await resetPassword(email)
    
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSuccess(true)
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#213069] to-[#1a2654] flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-4">
            <div className="flex justify-center">
              <img src={hshLogo} alt="HSH Contractor" className="h-24 w-auto" />
            </div>
            <CardTitle className="text-2xl text-center text-green-600">
              Check Your Email! ✅
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-center text-gray-700">
              We've sent you a password reset link. Please check your email and follow the instructions.
            </p>
            <Button
              onClick={onSwitchToLogin}
              className="w-full bg-gradient-to-r from-[#E65133] to-[#C0392B] hover:from-[#D14520] hover:to-[#A93226]"
            >
              Back to Login
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
          <CardTitle className="text-2xl text-center">Reset Password</CardTitle>
          <CardDescription className="text-center">
            Enter your email and we'll send you a reset link
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-[#E65133] to-[#C0392B] hover:from-[#D14520] hover:to-[#A93226]"
              disabled={loading}
            >
              {loading ? 'Sending...' : 'Send Reset Link'}
            </Button>

            <div className="text-sm text-center text-gray-600">
              Remember your password?{' '}
              <button
                type="button"
                onClick={onSwitchToLogin}
                className="text-blue-600 hover:underline font-semibold"
              >
                Sign in
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

