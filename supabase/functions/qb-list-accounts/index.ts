/**
 * QuickBooks Chart of Accounts
 * Returns active accounts with Id, Name, AccountType, AcctNum for wage-account selection.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ----- Inlined from _shared/qb.ts (so deploy works without _shared bundle) -----
const QB_TOKEN_ENDPOINT = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'
const QB_SANDBOX_BASE = 'https://sandbox-quickbooks.api.intuit.com/v3/company'
const QB_PRODUCTION_BASE = 'https://quickbooks.api.intuit.com/v3/company'
const EXPIRY_BUFFER_MS = 5 * 60 * 1000

function getQBApiBase(): string {
  return Deno.env.get('QB_USE_PRODUCTION') === 'true' ? QB_PRODUCTION_BASE : QB_SANDBOX_BASE
}

async function getValidQbToken(
  supabaseClient: { from: (t: string) => any },
  userId: string
): Promise<{ accessToken: string; realmId: string } | null> {
  const clientId = Deno.env.get('QB_CLIENT_ID') ?? ''
  const clientSecret = Deno.env.get('QB_CLIENT_SECRET') ?? ''
  const { data: profile } = await supabaseClient
    .from('profiles')
    .select('qb_access_token, qb_refresh_token, qb_token_expires_at, qb_realm_id')
    .eq('id', userId)
    .single()
  if (!profile?.qb_access_token || !profile?.qb_realm_id) return null
  const expiresAt = profile.qb_token_expires_at ? new Date(profile.qb_token_expires_at).getTime() : 0
  const now = Date.now()
  if (expiresAt > now + EXPIRY_BUFFER_MS) {
    return { accessToken: profile.qb_access_token, realmId: profile.qb_realm_id }
  }
  if (!profile.qb_refresh_token || !clientId || !clientSecret) return null
  const authString = btoa(`${clientId}:${clientSecret}`)
  const refreshResponse = await fetch(QB_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Basic ${authString}` },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: profile.qb_refresh_token }),
  })
  if (!refreshResponse.ok) return null
  const tokens = await refreshResponse.json()
  const accessToken = tokens.access_token
  const refreshToken = tokens.refresh_token ?? profile.qb_refresh_token
  const expiresIn = tokens.expires_in ?? 3600
  await supabaseClient.from('profiles').update({
    qb_access_token: accessToken,
    qb_refresh_token: refreshToken,
    qb_token_expires_at: new Date(now + expiresIn * 1000).toISOString(),
  }).eq('id', userId)
  return { accessToken, realmId: profile.qb_realm_id }
}
// ----- End inlined _shared/qb.ts -----

const MINOR_VERSION = 65

serve(async (req) => {
  const QB_API_BASE = getQBApiBase()
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header', accounts: [] }),
        { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
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
        JSON.stringify({ error: 'Unauthorized', accounts: [] }),
        { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    const tokenResult = await getValidQbToken(supabaseClient, user.id)
    if (!tokenResult) {
      return new Response(
        JSON.stringify({ accounts: [], error: 'QuickBooks not connected' }),
        { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    const { accessToken, realmId } = tokenResult
    const query = 'SELECT Id, Name, AccountType, AcctNum FROM Account WHERE Active = true MAXRESULTS 1000'
    const response = await fetch(
      `${QB_API_BASE}/${realmId}/query?query=${encodeURIComponent(query)}&minorversion=${MINOR_VERSION}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      }
    )

    if (!response.ok) {
      const errText = await response.text()
      console.error('QB list accounts failed:', response.status, errText)
      return new Response(
        JSON.stringify({ accounts: [], error: 'Could not fetch Chart of Accounts' }),
        { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    const result = await response.json()
    const raw: any[] = result.QueryResponse?.Account ?? []
    const accounts = raw.map((a: any) => ({
      id: String(a.Id),
      name: a.Name ?? '',
      accountType: a.AccountType ?? '',
      accountNumber: a.AcctNum != null ? String(a.AcctNum) : '',
    }))

    return new Response(
      JSON.stringify({ accounts }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )
  } catch (error) {
    console.error('qb-list-accounts error:', error)
    return new Response(
      JSON.stringify({
        accounts: [],
        error: (error as Error).message,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )
  }
})
