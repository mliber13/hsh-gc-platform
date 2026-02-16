// QuickBooks Test Connection
// Verifies the stored token works by fetching company info (refreshes token if expired)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getValidQbToken, getQBApiBase } from '../_shared/qb.ts'

serve(async (req) => {
  const QB_API_BASE = getQBApiBase()
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      }
    })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ connected: false, error: 'No authorization header', details: null }),
        { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      return new Response(
        JSON.stringify({ connected: false, error: 'Unauthorized', details: null }),
        { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    const tokenResult = await getValidQbToken(supabaseClient, user.id)
    if (!tokenResult) {
      return new Response(
        JSON.stringify({ connected: false, error: 'QuickBooks not connected or token refresh failed', details: null }),
        { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    // Verify token by fetching company info
    const query = 'SELECT * FROM CompanyInfo MAXRESULTS 1'
    const response = await fetch(
      `${QB_API_BASE}/${tokenResult.realmId}/query?query=${encodeURIComponent(query)}&minorversion=65`,
      {
        headers: {
          'Authorization': `Bearer ${tokenResult.accessToken}`,
          'Accept': 'application/json',
        }
      }
    )

    if (!response.ok) {
      const errText = await response.text()
      console.error('QB API error:', errText)
      return new Response(
        JSON.stringify({
          connected: false,
          error: 'QuickBooks API request failed',
          details: { status: response.status, body: errText }
        }),
        { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    const result = await response.json()
    const companyInfo = result.QueryResponse?.CompanyInfo?.[0]
    const companyName = companyInfo?.CompanyName ?? 'QuickBooks Company'

    return new Response(
      JSON.stringify({
        connected: true,
        company: companyName,
        bankAccounts: [],
        expenseAccounts: []
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )
  } catch (error) {
    console.error('qb-test-connection error:', error)
    return new Response(
      JSON.stringify({
        connected: false,
        error: (error as Error).message,
        details: null
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )
  }
})
