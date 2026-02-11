// ============================================================================
// Supabase Edge Function: Send Quote Request Email
// ============================================================================
//
// This function sends quote request emails to vendors using Resend
// 
// Setup Instructions:
// 1. Install Supabase CLI: npm install -g supabase
// 2. Link your project: supabase link --project-ref YOUR_PROJECT_REF
// 3. Set environment variables:
//    supabase secrets set RESEND_API_KEY=re_YOUR_API_KEY_HERE
//    supabase secrets set FROM_EMAIL=onboarding@resend.dev (or your verified domain)
//    supabase secrets set EMAIL_LOGO_URL=https://your-app.com/HSH%20Contractor%20Logo%20-%20Color.png (optional – HSH logo in email header)
// 4. Deploy: supabase functions deploy send-quote-email
//

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'onboarding@resend.dev'
/** Optional: full URL to HSH Contractor logo for email header (e.g. from your deployed app) */
const LOGO_URL = Deno.env.get('EMAIL_LOGO_URL')

// HSH brand colors
const HSH_PRIMARY = '#0E79C9'
const HSH_PRIMARY_DARK = '#0A5A96'
const HSH_TEXT = '#1e293b'
const HSH_MUTED = '#64748b'

interface EmailRequest {
  to: string
  vendorName?: string
  projectName: string
  tradeName?: string
  quoteLink: string
  scopeOfWork: string
  dueDate?: string
  expiresAt: string
  attachmentUrls?: string[]
  /** Display names for attachment links (same order as attachmentUrls) */
  attachmentNames?: string[]
}

serve(async (req) => {
  // Handle CORS preflight - must be first and return immediately
  if (req.method === 'OPTIONS') {
    return new Response('ok', { 
      status: 200,
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      }
    })
  }

  try {
    // Only parse JSON for non-OPTIONS requests
    let requestBody: EmailRequest
    try {
      requestBody = await req.json()
    } catch (e) {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    const { to, vendorName, projectName, tradeName, quoteLink, scopeOfWork, dueDate, expiresAt, attachmentUrls, attachmentNames } = requestBody
    const attachmentList = Array.isArray(attachmentUrls) ? attachmentUrls : []
    const namesList = Array.isArray(attachmentNames) && attachmentNames.length === attachmentList.length ? attachmentNames : []
    const getAttachmentLabel = (i: number) => (namesList[i] && namesList[i].trim()) ? namesList[i].trim() : `Document ${i + 1}`

    if (!to || !quoteLink) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: to, quoteLink' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // If no email service configured, return success but log that email wasn't sent
    if (!RESEND_API_KEY) {
      console.warn('RESEND_API_KEY not configured. Email not sent.')
      return new Response(
        JSON.stringify({ success: false, message: 'Email service not configured' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Format email content – HSH branding, logo, and attachment names
    const subject = `Quote Request: ${projectName}${tradeName ? ` - ${tradeName}` : ''}`
    const logoHtml = LOGO_URL
      ? `<img src="${LOGO_URL}" alt="HSH Contractor" style="max-width: 200px; height: auto; display: block; margin: 0 auto;" />`
      : `<span style="font-size: 24px; font-weight: 700; letter-spacing: 0.02em;">HSH Contractor</span>`

    const htmlBody = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; line-height: 1.6; color: ${HSH_TEXT}; margin: 0; background-color: #f1f5f9; }
            .wrapper { max-width: 600px; margin: 0 auto; padding: 24px 16px; }
            .card { background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.08); }
            .header { background: linear-gradient(135deg, ${HSH_PRIMARY} 0%, ${HSH_PRIMARY_DARK} 100%); color: white; padding: 28px 24px; text-align: center; }
            .header .logo-wrap { margin-bottom: 12px; }
            .header h1 { margin: 0; font-size: 18px; font-weight: 600; letter-spacing: 0.02em; opacity: 0.98; }
            .content { padding: 28px 24px; }
            .content p { margin: 0 0 12px; color: ${HSH_TEXT}; }
            .content h2 { margin: 0 0 8px; font-size: 20px; color: ${HSH_PRIMARY_DARK}; font-weight: 700; }
            .content h3 { margin: 20px 0 8px; font-size: 14px; font-weight: 600; color: ${HSH_MUTED}; text-transform: uppercase; letter-spacing: 0.04em; }
            .meta { background: #f8fafc; border-radius: 8px; padding: 14px 16px; margin: 16px 0; border-left: 4px solid ${HSH_PRIMARY}; }
            .meta p { margin: 4px 0; font-size: 14px; }
            .sow { white-space: pre-wrap; font-size: 14px; color: ${HSH_TEXT}; background: #f8fafc; padding: 14px; border-radius: 8px; margin: 8px 0 20px; }
            .attachments { margin: 20px 0; }
            .attachments-title { font-size: 14px; font-weight: 600; color: ${HSH_TEXT}; margin-bottom: 10px; }
            .attachments-list { list-style: none; padding: 0; margin: 0; }
            .attachments-list li { margin: 6px 0; }
            .attachments-list a { color: ${HSH_PRIMARY}; text-decoration: none; font-weight: 500; }
            .attachments-list a:hover { text-decoration: underline; }
            .button-wrap { text-align: center; margin: 28px 0 20px; }
            .button { display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, ${HSH_PRIMARY} 0%, ${HSH_PRIMARY_DARK} 100%); color: white !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; box-shadow: 0 2px 4px rgba(14,121,201,0.3); }
            .button:hover { opacity: 0.95; }
            .expiry { font-size: 12px; color: ${HSH_MUTED}; margin-top: 20px; }
            .footer { padding: 20px 24px; text-align: center; color: ${HSH_MUTED}; font-size: 12px; border-top: 1px solid #e2e8f0; }
          </style>
        </head>
        <body>
          <div class="wrapper">
            <div class="card">
              <div class="header">
                <div class="logo-wrap">${logoHtml}</div>
                <h1>Quote Request</h1>
              </div>
              <div class="content">
                <p>Hello${vendorName ? ` ${vendorName}` : ''},</p>
                <p>You have been invited to submit a quote for the following project.</p>
                <h2>${projectName}</h2>
                <div class="meta">
                  ${tradeName ? `<p><strong>Trade:</strong> ${tradeName}</p>` : ''}
                  ${dueDate ? `<p><strong>Due date:</strong> ${new Date(dueDate).toLocaleDateString()}</p>` : ''}
                </div>
                <h3>Scope of Work</h3>
                <div class="sow">${scopeOfWork}</div>
                ${attachmentList.length > 0 ? `
                <div class="attachments">
                  <p class="attachments-title">Attached documents (click to open)</p>
                  <ul class="attachments-list">
                    ${attachmentList.map((url: string, i: number) => `<li><a href="${url}">${getAttachmentLabel(i)}</a></li>`).join('')}
                  </ul>
                </div>
                ` : ''}
                <div class="button-wrap">
                  <a href="${quoteLink}" class="button">Submit Quote</a>
                </div>
                <p class="expiry">This link expires on ${new Date(expiresAt).toLocaleDateString()}.</p>
              </div>
              <div class="footer">
                <p>Thank you,<br><strong>HSH Contractor</strong></p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `

    // Send email using Resend API
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [to],
        subject: subject,
        html: htmlBody,
      }),
    })

    if (!resendResponse.ok) {
      let errorMessage = 'Failed to send email'
      try {
        const errorData = await resendResponse.json()
        errorMessage = errorData.message || errorData.error?.message || errorMessage
        console.error('Resend API error:', errorData)
      } catch (e) {
        const errorText = await resendResponse.text()
        console.error('Resend API error (text):', errorText)
        errorMessage = errorText || errorMessage
      }
      return new Response(
        JSON.stringify({ success: false, error: errorMessage }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const result = await resendResponse.json()
    console.log('Email sent successfully:', result)

    return new Response(
      JSON.stringify({ success: true, messageId: result.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error sending email:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

