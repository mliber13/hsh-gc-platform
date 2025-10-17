// QuickBooks Create Check
// Creates a check payment in QuickBooks Online

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const QB_API_BASE = 'https://quickbooks.api.intuit.com/v3/company'
const QB_DEFAULT_EXPENSE_ACCOUNT = '80' // Default expense account - user should configure this
const QB_DEFAULT_BANK_ACCOUNT = '35' // Default bank account - user should configure this

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
    // Get user from authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { 
          status: 401, 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          } 
        }
      )
    }

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // Get current user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { 
          status: 401, 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          } 
        }
      )
    }

    // Get QB tokens from user profile
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('qb_access_token, qb_realm_id, qb_token_expires_at')
      .eq('id', user.id)
      .single()

    if (profileError || !profile?.qb_access_token) {
      return new Response(
        JSON.stringify({ error: 'QuickBooks not connected' }),
        { 
          status: 400, 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          } 
        }
      )
    }

    // Check if token is expired (refresh if needed)
    // For now, we'll just use the token - token refresh can be added later

    const { vendorName, amount, description, date, projectName, category } = await req.json()

    // Step 1: Find or create vendor
    let vendorId = await findVendor(profile.qb_access_token, profile.qb_realm_id, vendorName)
    
    if (!vendorId) {
      vendorId = await createVendor(profile.qb_access_token, profile.qb_realm_id, vendorName)
    }

    if (!vendorId) {
      return new Response(
        JSON.stringify({ error: 'Failed to find or create vendor' }),
        { 
          status: 500, 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          } 
        }
      )
    }

    // Step 2: Create check
    const check = {
      TxnDate: new Date(date).toISOString().split('T')[0],
      PrivateNote: `${projectName ? `Project: ${projectName} - ` : ''}${description}${category ? ` (${category})` : ''}`,
      Line: [
        {
          Amount: amount,
          DetailType: 'AccountBasedExpenseLineDetail',
          AccountBasedExpenseLineDetail: {
            AccountRef: {
              value: QB_DEFAULT_EXPENSE_ACCOUNT
            }
          },
          Description: description
        }
      ],
      EntityRef: {
        value: vendorId,
        name: vendorName
      },
      BankAccountRef: {
        value: QB_DEFAULT_BANK_ACCOUNT
      }
    }

    const checkResponse = await fetch(
      `${QB_API_BASE}/${profile.qb_realm_id}/check?minorversion=65`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${profile.qb_access_token}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(check)
      }
    )

    if (!checkResponse.ok) {
      const error = await checkResponse.text()
      console.error('QB check creation failed:', error)
      return new Response(
        JSON.stringify({ error: 'Failed to create check in QuickBooks', details: error }),
        { 
          status: 500, 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          } 
        }
      )
    }

    const result = await checkResponse.json()
    
    return new Response(
      JSON.stringify({ success: true, Check: result.Check }),
      { 
        status: 200,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      }
    )
  } catch (error) {
    console.error('Error in qb-create-check:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        } 
      }
    )
  }
})

// Helper: Find vendor by name
async function findVendor(accessToken: string, realmId: string, vendorName: string): Promise<string | null> {
  const query = `SELECT * FROM Vendor WHERE DisplayName = '${vendorName}'`
  
  const response = await fetch(
    `${QB_API_BASE}/${realmId}/query?query=${encodeURIComponent(query)}&minorversion=65`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      }
    }
  )

  if (!response.ok) return null

  const result = await response.json()
  const vendors = result.QueryResponse?.Vendor || []
  
  return vendors.length > 0 ? vendors[0].Id : null
}

// Helper: Create vendor
async function createVendor(accessToken: string, realmId: string, vendorName: string): Promise<string | null> {
  const vendor = {
    DisplayName: vendorName,
  }

  const response = await fetch(
    `${QB_API_BASE}/${realmId}/vendor?minorversion=65`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(vendor)
    }
  )

  if (!response.ok) {
    console.error('Failed to create vendor:', await response.text())
    return null
  }

  const result = await response.json()
  return result.Vendor?.Id || null
}

