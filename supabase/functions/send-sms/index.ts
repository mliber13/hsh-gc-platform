import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const smsCorsHeaders = {
  ...corsHeaders,
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
}

interface SendSmsRequest {
  schedule_item_id: string
  project_id: string
  recipient_phone: string
  recipient_company_id: string
  body: string
  message_type?: string
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

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return jsonResponse({ error: 'Not authenticated' }, 401)

    const payload: SendSmsRequest = await req.json()
    const {
      schedule_item_id,
      project_id,
      recipient_phone,
      recipient_company_id,
      body,
      message_type,
    } = payload
    const messageType = message_type || 'assignment_publish'

    if (!schedule_item_id || !project_id || !recipient_phone || !recipient_company_id || !body) {
      return jsonResponse({ error: 'Missing required SMS payload fields' }, 400)
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (profileError || !profile?.organization_id) {
      return jsonResponse({ error: 'No org for current user' }, 403)
    }

    const twilioAuth = btoa(`${accountSid}:${authToken}`)
    const formData = new URLSearchParams()
    formData.append('To', recipient_phone)
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

    const logEntry = {
      organization_id: profile.organization_id,
      project_id,
      schedule_item_id,
      direction: 'outbound',
      channel: 'sms',
      author_user_id: user.id,
      author_company_id: null,
      author_label: 'system',
      body: success ? body : `[FAILED] ${body}`,
      metadata: success
        ? {
          type: messageType,
          twilio_sid: twilioJson.sid,
          recipient_phone,
          recipient_company_id,
        }
        : {
          type: messageType,
          failed: true,
          error: twilioJson,
          recipient_phone,
          recipient_company_id,
        },
    }

    const { error: logError } = await supabase
      .from('communication_log_entries')
      .insert(logEntry)
    if (logError) console.error('Failed to write comms log entry', logError)

    let updateErrorMessage: string | null = null
    if (success) {
      const { error: updateError } = await supabase
        .from('schedule_items')
        .update({
          confirmation_status: 'pending',
          confirmation_last_sent_at: new Date().toISOString(),
        })
        .eq('id', schedule_item_id)

      if (updateError) {
        updateErrorMessage = updateError.message
        console.error('Failed to update schedule_item', updateError)
      }
    }

    return jsonResponse(
      {
        success,
        twilio_sid: twilioJson.sid ?? null,
        error: success ? null : twilioJson,
        log_error: logError?.message ?? null,
        update_error: updateErrorMessage,
      },
      success ? 200 : 502,
    )
  } catch (err) {
    console.error('send-sms unexpected error', err)
    return jsonResponse({ error: String(err) }, 500)
  }
})
