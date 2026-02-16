// QuickBooks Get Projects
// Lists QB Projects (jobs) for linking to app projects

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getValidQbToken, getQBApiBase } from '../_shared/qb.ts'

const MINOR_VERSION = 65

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
        JSON.stringify({ error: 'No authorization header', projects: [] }),
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
        JSON.stringify({ error: 'Unauthorized', projects: [] }),
        { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    const tokenResult = await getValidQbToken(supabaseClient, user.id)
    if (!tokenResult) {
      return new Response(
        JSON.stringify({ projects: [], error: 'QuickBooks not connected' }),
        { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    const { accessToken, realmId } = tokenResult

    // Try REST Query for Project entity (supported in some QBO versions)
    const query = 'SELECT * FROM Project WHERE Active = true MAXRESULTS 500'
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
      console.error('QB get projects failed:', response.status, errText)
      return new Response(
        JSON.stringify({
          projects: [],
          error: 'Could not fetch projects (Project entity may require a different API)',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    const result = await response.json()
    const raw = result.QueryResponse?.Project || []
    const projects = raw.map((p: any) => ({
      id: String(p.Id),
      name: p.Name ?? p.DisplayName ?? '',
    }))

    return new Response(
      JSON.stringify({ projects }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )
  } catch (error) {
    console.error('qb-get-projects error:', error)
    return new Response(
      JSON.stringify({
        projects: [],
        error: (error as Error).message,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )
  }
})
