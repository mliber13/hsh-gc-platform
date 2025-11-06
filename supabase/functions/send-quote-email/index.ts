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
// 4. Deploy: supabase functions deploy send-quote-email
//

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'onboarding@resend.dev'

interface EmailRequest {
  to: string
  vendorName?: string
  projectName: string
  tradeName?: string
  quoteLink: string
  scopeOfWork: string
  dueDate?: string
  expiresAt: string
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { to, vendorName, projectName, tradeName, quoteLink, scopeOfWork, dueDate, expiresAt }: EmailRequest = await req.json()

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

    // Format email content
    const subject = `Quote Request: ${projectName}${tradeName ? ` - ${tradeName}` : ''}`
    const htmlBody = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #0E79C9; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f9f9f9; }
            .button { display: inline-block; padding: 12px 24px; background-color: #0E79C9; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Quote Request</h1>
            </div>
            <div class="content">
              <p>Hello${vendorName ? ` ${vendorName}` : ''},</p>
              <p>You have been invited to submit a quote for the following project:</p>
              <h2>${projectName}</h2>
              ${tradeName ? `<p><strong>Trade:</strong> ${tradeName}</p>` : ''}
              ${dueDate ? `<p><strong>Due Date:</strong> ${new Date(dueDate).toLocaleDateString()}</p>` : ''}
              <h3>Scope of Work:</h3>
              <p style="white-space: pre-wrap;">${scopeOfWork}</p>
              <div style="text-align: center;">
                <a href="${quoteLink}" class="button">Submit Quote</a>
              </div>
              <p style="margin-top: 20px; font-size: 12px; color: #666;">
                This link will expire on ${new Date(expiresAt).toLocaleDateString()}.
              </p>
            </div>
            <div class="footer">
              <p>Thank you,<br>HSH Contractor</p>
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
      const errorData = await resendResponse.json().catch(() => ({ message: await resendResponse.text() }))
      console.error('Resend API error:', errorData)
      return new Response(
        JSON.stringify({ success: false, error: errorData.message || 'Failed to send email' }),
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
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

