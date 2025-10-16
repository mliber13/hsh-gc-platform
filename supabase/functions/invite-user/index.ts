// Supabase Edge Function - Invite User
// This function uses the service role key to securely invite users via email

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface InviteRequest {
  email: string
  role: 'admin' | 'editor' | 'viewer'
  organizationId: string
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
    if (userError) {
      console.error('Auth error:', userError)
      throw new Error(`Unauthorized: ${userError.message}`)
    }
    if (!user) {
      throw new Error('Unauthorized: No user found')
    }

    console.log('User authenticated:', user.id, user.email)

    // Verify the requesting user is an admin
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role, organization_id')
      .eq('id', user.id)
      .single()

    if (profileError) {
      console.error('Profile query error:', profileError)
      throw new Error(`Profile not found: ${profileError.message}`)
    }
    
    if (!profile) {
      throw new Error('Profile not found: No profile exists for this user')
    }

    console.log('User profile:', profile)

    if (profile.role !== 'admin') {
      throw new Error(`Only admins can invite users. Your role: ${profile.role}`)
    }

    // Parse the request body
    const { email, role, organizationId }: InviteRequest = await req.json()

    // Validate inputs
    if (!email || !role || !organizationId) {
      throw new Error('Missing required fields: email, role, organizationId')
    }

    if (organizationId !== profile.organization_id) {
      throw new Error('Cannot invite users to a different organization')
    }

    // Check if user already exists
    const { data: existingUser } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', email.toLowerCase())
      .eq('organization_id', organizationId)
      .single()

    if (existingUser) {
      throw new Error('User already exists in your organization')
    }

    // Check for existing pending invitation
    const { data: existingInvite } = await supabaseAdmin
      .from('user_invitations')
      .select('*')
      .eq('email', email.toLowerCase())
      .eq('organization_id', organizationId)
      .eq('status', 'pending')
      .single()

    if (existingInvite) {
      throw new Error('Invitation already sent to this email')
    }

    // Create invitation record in the database
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7) // 7 days expiration

    const { data: invitation, error: inviteDbError } = await supabaseAdmin
      .from('user_invitations')
      .insert({
        organization_id: organizationId,
        email: email.toLowerCase(),
        role,
        invited_by: user.id,
        status: 'pending',
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single()

    if (inviteDbError) {
      throw inviteDbError
    }

    // Use Supabase's built-in invite functionality
    // This will send an email to the user with a magic link
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email.toLowerCase(),
      {
        data: {
          organization_id: organizationId,
          role: role,
          invited_by: user.id,
          invitation_id: invitation.id
        },
        redirectTo: `${Deno.env.get('PUBLIC_APP_URL') || 'https://hsh-gc-platform.vercel.app'}/accept-invitation`
      }
    )

    if (inviteError) {
      console.error('Supabase invite error:', inviteError)
      throw inviteError
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Invitation sent to ${email}`,
        invitation,
        inviteData
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Error in invite-user function:', error)
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

