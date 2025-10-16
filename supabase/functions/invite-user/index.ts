// ============================================================================
// Supabase Edge Function: Invite User
// ============================================================================
//
// Securely invites a user using Supabase Admin API
// This must run server-side to protect the service role key
//

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
    // Get request body
    const { email, role, organizationId } = await req.json()

    if (!email || !role || !organizationId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: email, role, organizationId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase admin client
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

    // Get the authenticated user (the one sending the invitation)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify the inviter is an admin
    const token = authHeader.replace('Bearer ', '')
    const { data: { user: inviter }, error: userError } = await supabaseAdmin.auth.getUser(token)
    
    if (userError || !inviter) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check inviter's role
    const { data: inviterProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role, organization_id')
      .eq('id', inviter.id)
      .single()

    if (profileError || !inviterProfile) {
      return new Response(
        JSON.stringify({ error: 'Failed to verify inviter profile' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (inviterProfile.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Only admins can invite users' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if user already exists
    const { data: existingUser } = await supabaseAdmin.auth.admin.listUsers()
    const userExists = existingUser?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase())

    if (userExists) {
      // User exists - check if they're in the organization
      const { data: existingProfile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('id', userExists.id)
        .eq('organization_id', organizationId)
        .single()

      if (existingProfile) {
        return new Response(
          JSON.stringify({ error: 'User already exists in your organization' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Invite the user using Supabase Auth
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email.toLowerCase(),
      {
        redirectTo: `${Deno.env.get('PUBLIC_SITE_URL') || 'http://localhost:5173'}/auth/callback`,
        data: {
          organization_id: organizationId,
          role: role,
          invited_by: inviter.id,
        }
      }
    )

    if (inviteError) {
      console.error('Error inviting user:', inviteError)
      return new Response(
        JSON.stringify({ error: `Failed to invite user: ${inviteError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create invitation record in database
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    const { data: invitation, error: invitationError } = await supabaseAdmin
      .from('user_invitations')
      .insert({
        organization_id: organizationId,
        email: email.toLowerCase(),
        role: role,
        invited_by: inviter.id,
        status: 'pending',
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single()

    if (invitationError) {
      console.error('Error creating invitation record:', invitationError)
      // Don't fail the whole request - the email was sent
    }

    console.log(`✅ Invitation sent to ${email} with role ${role}`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Invitation email sent to ${email}`,
        invitation: invitation || inviteData
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in invite-user function:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

