/**
 * Outbound customer/superintendent SMS (CC.1). Office-only; reuses the same Twilio Messaging
 * Service as send-sms. Logs the message to customer_messages (person-keyed thread, tagged to a
 * project) and records the contact on the project for inbound routing (CC.2).
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const smsCorsHeaders = {
  ...corsHeaders,
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
}

interface SendCustomerSmsRequest {
  project_id: string
  recipient_phone: string
  recipient_name?: string
  body: string
}

/** Strip to digits, keep last 10 — the thread/contact key (mirror normalize_phone_10). */
function normalizePhone10(raw: string): string {
  return (raw || '').replace(/\D/g, '').slice(-10)
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...smsCorsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: smsCorsHeaders })

  try {
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')
    const messagingServiceSid = Deno.env.get('TWILIO_MESSAGING_SERVICE_SID')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')

    if (!accountSid || !authToken || !messagingServiceSid) {
      return jsonResponse({ error: 'Twilio secrets not configured' }, 500)
    }
    if (!supabaseUrl || !supabaseAnonKey) {
      return jsonResponse({ error: 'Supabase function environment not configured' }, 500)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'No authorization header' }, 401)

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) return jsonResponse({ error: 'Not authenticated' }, 401)

    const payload: SendCustomerSmsRequest = await req.json()
    const { project_id, recipient_phone, recipient_name, body } = payload
    if (!project_id || !recipient_phone || !body?.trim()) {
      return jsonResponse({ error: 'Missing required fields (project_id, recipient_phone, body)' }, 400)
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()
    if (profileError || !profile?.organization_id) {
      return jsonResponse({ error: 'No org for current user' }, 403)
    }

    const phone10 = normalizePhone10(recipient_phone)
    // Twilio needs E.164; assume US when we have a clean 10-digit number.
    const to = phone10.length === 10 ? `+1${phone10}` : recipient_phone

    const twilioAuth = btoa(`${accountSid}:${authToken}`)
    const formData = new URLSearchParams()
    formData.append('To', to)
    formData.append('MessagingServiceSid', messagingServiceSid)
    formData.append('Body', body)

    const twilioResp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${twilioAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      },
    )
    const twilioJson = await twilioResp.json()
    const success = twilioResp.ok

    // Log the outbound message to the person-keyed thread, tagged to this project.
    const { error: logError } = await supabase.from('customer_messages').insert({
      organization_id: profile.organization_id,
      contact_phone: phone10,
      contact_name: recipient_name ?? null,
      direction: 'outbound',
      body: success ? body : `[FAILED] ${body}`,
      project_id,
      twilio_sid: twilioJson.sid ?? null,
      status: success ? (twilioJson.status ?? 'sent') : 'failed',
      created_by: user.id,
    })
    if (logError) console.error('Failed to log customer_messages row', logError)

    // Record/refresh the project's customer contact so inbound (CC.2) can resolve this phone.
    const { error: contactError } = await supabase.from('customer_project_contacts').upsert(
      {
        organization_id: profile.organization_id,
        project_id,
        contact_name: recipient_name ?? null,
        contact_phone: phone10,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'project_id' },
    )
    if (contactError) console.error('Failed to upsert customer_project_contacts', contactError)

    return jsonResponse(
      {
        success,
        twilio_sid: twilioJson.sid ?? null,
        error: success ? null : twilioJson,
        log_error: logError?.message ?? null,
      },
      success ? 200 : 502,
    )
  } catch (err) {
    console.error('send-customer-sms unexpected error', err)
    return jsonResponse({ error: String(err) }, 500)
  }
})
