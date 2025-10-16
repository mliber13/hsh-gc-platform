// Supabase Edge Function - Accept Invitation
// This function handles when a user accepts an invitation via magic link

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get the authorization header from the request
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Missing authorization header')
    }

    // Create Supabase client with service role key for admin operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Extract the JWT token from the Authorization header
    const token = authHeader.replace('Bearer ', '')
    
    // Verify the JWT token and get the user
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)
    if (userError || !user) {
      throw new Error('Unauthorized: Invalid token')
    }

    console.log('Processing invitation acceptance for user:', user.id, user.email)

    // Check if this user has a pending invitation
    const { data: invitation, error: inviteError } = await supabaseAdmin
      .from('user_invitations')
      .select('*')
      .eq('email', user.email?.toLowerCase())
      .eq('status', 'pending')
      .single()

    if (inviteError || !invitation) {
      console.log('No pending invitation found for user:', user.email)
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No pending invitation to accept'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }

    console.log('Found invitation:', invitation)

    // Check if user already has a profile
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (existingProfile) {
      console.log('User already has profile:', existingProfile)
      
      // Update invitation status to accepted
      await supabaseAdmin
        .from('user_invitations')
        .update({ status: 'accepted' })
        .eq('id', invitation.id)

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Invitation accepted - profile already exists'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }

    // Create user profile from invitation data
    const { data: newProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: user.id,
        email: user.email?.toLowerCase(),
        full_name: user.user_metadata?.full_name || null,
        organization_id: invitation.organization_id,
        role: invitation.role,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (profileError) {
      console.error('Error creating profile:', profileError)
      throw profileError
    }

    // Update invitation status to accepted
    await supabaseAdmin
      .from('user_invitations')
      .update({ status: 'accepted' })
      .eq('id', invitation.id)

    console.log('Successfully created profile and accepted invitation:', newProfile)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Invitation accepted successfully',
        profile: newProfile
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Error in accept-invitation function:', error)
    return new Response(
      JSON.stringify({
        error: error.message || 'An error occurred'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
