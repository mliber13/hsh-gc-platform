// Shared QuickBooks helpers for Edge Functions
// Handles token refresh when access token is expired

const QB_TOKEN_ENDPOINT = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'

const QB_SANDBOX_BASE = 'https://sandbox-quickbooks.api.intuit.com/v3/company'
const QB_PRODUCTION_BASE = 'https://quickbooks.api.intuit.com/v3/company'

/** QuickBooks API base URL. Set Supabase secret QB_USE_PRODUCTION=true to use your real QB company. */
export function getQBApiBase(): string {
  return Deno.env.get('QB_USE_PRODUCTION') === 'true' ? QB_PRODUCTION_BASE : QB_SANDBOX_BASE
}
const EXPIRY_BUFFER_MS = 5 * 60 * 1000 // refresh if expiring in next 5 minutes

export interface QBTokenResult {
  accessToken: string
  realmId: string
}

/**
 * Returns a valid QuickBooks access token for the user, refreshing if expired.
 * Returns null if not connected or refresh fails.
 */
export async function getValidQbToken(
  supabaseClient: { from: (t: string) => any },
  userId: string
): Promise<QBTokenResult | null> {
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

  if (!profile.qb_refresh_token || !clientId || !clientSecret) {
    return null
  }

  const authString = btoa(`${clientId}:${clientSecret}`)
  const refreshResponse = await fetch(QB_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${authString}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: profile.qb_refresh_token,
    }),
  })

  if (!refreshResponse.ok) {
    const err = await refreshResponse.text()
    console.error('QB token refresh failed:', err)
    return null
  }

  const tokens = await refreshResponse.json()
  const accessToken = tokens.access_token
  const refreshToken = tokens.refresh_token ?? profile.qb_refresh_token
  const expiresIn = tokens.expires_in ?? 3600
  const newExpiresAt = new Date(now + expiresIn * 1000).toISOString()

  await supabaseClient
    .from('profiles')
    .update({
      qb_access_token: accessToken,
      qb_refresh_token: refreshToken,
      qb_token_expires_at: newExpiresAt,
    })
    .eq('id', userId)

  return { accessToken, realmId: profile.qb_realm_id }
}
