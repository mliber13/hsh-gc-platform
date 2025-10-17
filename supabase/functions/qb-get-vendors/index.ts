// QuickBooks Get Vendors
// Fetches list of vendors from QuickBooks

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const QB_API_BASE = 'https://sandbox-quickbooks.api.intuit.com/v3/company'

serve(async (req) => {
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
        JSON.stringify({ error: 'No authorization header' }),
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
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('qb_access_token, qb_realm_id')
      .eq('id', user.id)
      .single()

    if (!profile?.qb_access_token) {
      return new Response(
        JSON.stringify({ vendors: [] }),
        { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    // Get all active vendors
    const query = `SELECT * FROM Vendor WHERE Active = true MAXRESULTS 1000`
    const response = await fetch(
      `${QB_API_BASE}/${profile.qb_realm_id}/query?query=${encodeURIComponent(query)}&minorversion=65`,
      {
        headers: {
          'Authorization': `Bearer ${profile.qb_access_token}`,
          'Accept': 'application/json',
        }
      }
    )

    if (!response.ok) {
      const error = await response.text()
      console.error('Failed to fetch vendors:', error)
      return new Response(
        JSON.stringify({ vendors: [], error: 'Failed to fetch vendors' }),
        { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    const result = await response.json()
    const vendors = result.QueryResponse?.Vendor || []
    
    // Return simplified vendor list
    const vendorList = vendors.map((v: any) => ({
      id: v.Id,
      name: v.DisplayName,
      companyName: v.CompanyName
    }))

    return new Response(
      JSON.stringify({ vendors: vendorList }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )
  } catch (error) {
    console.error('Error in qb-get-vendors:', error)
    return new Response(
      JSON.stringify({ vendors: [], error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )
  }
})

