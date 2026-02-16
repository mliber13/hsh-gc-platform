// ============================================================================
// QuickBooks Connection Component
// ============================================================================
//
// Allows users to connect/disconnect their QuickBooks Online account
//

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { isQBConnected, initiateQBOAuth, disconnectQB, testQBConnection } from '@/services/quickbooksService'

export function QuickBooksConnect() {
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    checkConnection()
  }, [])

  const checkConnection = async () => {
    setLoading(true)
    const isConnected = await isQBConnected()
    setConnected(isConnected)
    setLoading(false)
  }

  const handleConnect = () => {
    initiateQBOAuth()
  }

  const handleDisconnect = async () => {
    if (confirm('Are you sure you want to disconnect QuickBooks? Automatic syncing will stop.')) {
      await disconnectQB()
      setConnected(false)
    }
  }

  const handleTestConnection = async () => {
    setTesting(true)
    const testResult = await testQBConnection()
    setTesting(false)
    
    if (testResult) {
      alert('✅ QuickBooks connection is working!')
    } else {
      alert('❌ QuickBooks connection failed. Please reconnect.')
      setConnected(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <img 
            src="https://plugin.intuitcdn.net/designsystem/assets/2023/06/27102126/quickbooks-logo.svg" 
            alt="QuickBooks" 
            className="h-6"
          />
          QuickBooks Online
          {import.meta.env.VITE_QB_USE_PRODUCTION === 'true' && (
            <span className="text-xs font-normal bg-green-100 text-green-800 px-2 py-0.5 rounded">Production</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2">
            {connected ? (
              <>
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="font-medium text-green-700">Connected</span>
              </>
            ) : (
              <>
                <XCircle className="w-5 h-5 text-gray-400" />
                <span className="font-medium text-gray-600">Not Connected</span>
              </>
            )}
          </div>
          {connected && (
            <Button
              onClick={handleTestConnection}
              variant="outline"
              size="sm"
              disabled={testing}
            >
              {testing ? (
                <>
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  Testing...
                </>
              ) : (
                'Test'
              )}
            </Button>
          )}
        </div>

        {connected ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              ✅ Project actuals will automatically sync to QuickBooks as Check payments
            </p>
            <Button
              onClick={handleDisconnect}
              variant="outline"
              className="w-full text-red-600 border-red-300 hover:bg-red-50"
            >
              Disconnect QuickBooks
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Connect QuickBooks to automatically create Check payments when you enter project actuals.
            </p>
            <Button
              onClick={handleConnect}
              className="w-full bg-[#2ca01c] hover:bg-[#248f17] text-white"
            >
              Connect to QuickBooks
            </Button>
            <p className="text-xs text-gray-500">
              Requires QuickBooks Online account. Actuals entries will sync as Checks.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

