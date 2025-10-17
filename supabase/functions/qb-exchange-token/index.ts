// QuickBooks OAuth Token Exchange
// Exchanges authorization code for access/refresh tokens

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const QB_CLIENT_ID = Deno.env.get('QB_CLIENT_ID') || ''
const QB_CLIENT_SECRET = Deno.env.get('QB_CLIENT_SECRET') || ''
const QB_TOKEN_ENDPOINT = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'

serve(async (req) => {
  // CORS headers
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      }
    })
  }

  try {
    const { code, redirect_uri } = await req.json()
    
    if (!code || !redirect_uri) {
      return new Response(
        JSON.stringify({ error: 'Missing code or redirect_uri' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Exchange code for tokens
    const authString = btoa(`${QB_CLIENT_ID}:${QB_CLIENT_SECRET}`)
    
    const tokenResponse = await fetch(QB_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${authString}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirect_uri,
      }),
    })

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text()
      console.error('QB token exchange failed:', error)
      return new Response(
        JSON.stringify({ error: 'Token exchange failed' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const tokens = await tokenResponse.json()
    
    return new Response(
      JSON.stringify(tokens),
      { 
        status: 200,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      }
    )
  } catch (error) {
    console.error('Error in qb-exchange-token:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})

