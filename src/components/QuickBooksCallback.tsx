// ============================================================================
// QuickBooks OAuth Callback Handler
// ============================================================================
//
// Handles the OAuth redirect from QuickBooks after user authorizes
//

import React, { useEffect, useState } from 'react'
import { handleQBOAuthCallback } from '@/services/quickbooksService'
import { Loader2, CheckCircle, XCircle } from 'lucide-react'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'

interface QuickBooksCallbackProps {
  onComplete: () => void
}

export function QuickBooksCallback({ onComplete }: QuickBooksCallbackProps) {
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    handleCallback()
  }, [])

  const handleCallback = async () => {
    try {
      // Get code and state from URL
      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')
      const state = params.get('state')
      const realmId = params.get('realmId') // QB Company ID
      
      if (!code || !state) {
        setStatus('error')
        setErrorMessage('Missing authorization code or state')
        return
      }

      console.log('Processing QB OAuth callback...')
      console.log('Code:', code.substring(0, 20) + '...')
      console.log('State:', state)
      console.log('Realm ID:', realmId)

      // Exchange code for tokens
      const success = await handleQBOAuthCallback(code, state, realmId || '')
      
      if (success) {
        setStatus('success')
        // Redirect to QB settings after 2 seconds
        setTimeout(() => {
          onComplete()
        }, 2000)
      } else {
        setStatus('error')
        setErrorMessage('Failed to connect to QuickBooks. Please try again.')
      }
    } catch (error) {
      console.error('Error in QB callback:', error)
      setStatus('error')
      setErrorMessage((error as Error).message || 'Unknown error occurred')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          {status === 'processing' && (
            <div className="text-center space-y-4">
              <Loader2 className="w-12 h-12 animate-spin text-[#0E79C9] mx-auto" />
              <h2 className="text-xl font-semibold">Connecting to QuickBooks...</h2>
              <p className="text-gray-600">Please wait while we complete the connection.</p>
            </div>
          )}

          {status === 'success' && (
            <div className="text-center space-y-4">
              <CheckCircle className="w-12 h-12 text-green-600 mx-auto" />
              <h2 className="text-xl font-semibold text-green-700">Successfully Connected!</h2>
              <p className="text-gray-600">QuickBooks is now connected. Redirecting...</p>
            </div>
          )}

          {status === 'error' && (
            <div className="text-center space-y-4">
              <XCircle className="w-12 h-12 text-red-600 mx-auto" />
              <h2 className="text-xl font-semibold text-red-700">Connection Failed</h2>
              <p className="text-gray-600">{errorMessage}</p>
              <Button onClick={onComplete} variant="outline">
                Go Back
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

