// ============================================================================
// Supabase Edge Function: Share Deal Document by Email
// ============================================================================
//
// Sends an email with a time-limited link to a deal document using Resend.
// Uses the caller's JWT so RLS ensures they can only share documents they can access.
//
// Setup: Same as send-feedback-email (RESEND_API_KEY, FROM_EMAIL).
// Deploy: supabase functions deploy send-deal-document-share
//

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'onboarding@resend.dev'

// 24 hours
const SIGNED_URL_EXPIRY_SEC = 86400

interface ShareRequest {
  documentId: string
  toEmail: string
  message?: string
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let body: ShareRequest
    try {
      body = await req.json()
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { documentId, toEmail, message } = body

    if (!documentId || !toEmail?.trim()) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: documentId, toEmail' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!isValidEmail(toEmail.trim())) {
      return new Response(
        JSON.stringify({ error: 'Invalid email address' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: doc, error: docError } = await supabase
      .from('deal_documents')
      .select('id, name, file_path, file_url')
      .eq('id', documentId)
      .single()

    if (docError || !doc) {
      return new Response(
        JSON.stringify({ error: 'Document not found or access denied' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let filePath: string | null = doc.file_path || null
    let bucketName = 'deal-documents'

    if (!filePath && doc.file_url) {
      const fromUrl = doc.file_url.split('/deal-documents/')
      if (fromUrl.length >= 2) {
        filePath = fromUrl[1].split('?')[0]
      } else {
        const alt = doc.file_url.split('/deal_documents/')
        if (alt.length >= 2) {
          filePath = alt[1].split('?')[0]
          bucketName = 'deal_documents'
        }
      }
    }

    if (!filePath) {
      return new Response(
        JSON.stringify({ error: 'Document file path could not be determined' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let { data: signedData, error: signedError } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(filePath, SIGNED_URL_EXPIRY_SEC)

    if (signedError && signedError.message?.includes('Bucket not found')) {
      bucketName = bucketName === 'deal-documents' ? 'deal_documents' : 'deal-documents'
      const retry = await supabase.storage
        .from(bucketName)
        .createSignedUrl(filePath, SIGNED_URL_EXPIRY_SEC)
      signedData = retry.data
      signedError = retry.error
    }

    if (signedError || !signedData?.signedUrl) {
      console.error('Signed URL error:', signedError)
      return new Response(
        JSON.stringify({ error: 'Could not generate share link' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, message: 'Email service not configured' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const subject = `Shared document: ${doc.name}`
    const htmlBody = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #0E79C9; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f9f9f9; }
            .link-box { background-color: white; padding: 15px; border-radius: 5px; margin: 15px 0; word-break: break-all; border: 1px solid #e5e7eb; }
            .link-box a { color: #0E79C9; }
            .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
            .expiry { font-size: 12px; color: #6b7280; margin-top: 10px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Document shared with you</h1>
            </div>
            <div class="content">
              <p>Hello,</p>
              <p>A document has been shared with you from HSH GC Platform:</p>
              <p><strong>${doc.name}</strong></p>
              ${message?.trim() ? `<p style="white-space: pre-wrap;">${message.trim().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>` : ''}
              <p>Click the link below to view or download the document:</p>
              <div class="link-box">
                <a href="${signedData.signedUrl}">${signedData.signedUrl}</a>
              </div>
              <p class="expiry">This link expires in 24 hours.</p>
            </div>
            <div class="footer">
              <p>Thank you,<br>HSH GC Platform</p>
            </div>
          </div>
        </body>
      </html>
    `

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [toEmail.trim()],
        subject,
        html: htmlBody,
      }),
    })

    if (!resendResponse.ok) {
      let errMsg = 'Failed to send email'
      try {
        const errData = await resendResponse.json()
        errMsg = errData.message || errData.error?.message || errMsg
      } catch {
        errMsg = await resendResponse.text() || errMsg
      }
      return new Response(
        JSON.stringify({ success: false, error: errMsg }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const result = await resendResponse.json()
    return new Response(
      JSON.stringify({ success: true, messageId: result.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in send-deal-document-share:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
