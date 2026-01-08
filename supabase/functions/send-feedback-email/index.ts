// ============================================================================
// Supabase Edge Function: Send Feedback Notification Email
// ============================================================================
//
// This function sends feedback notification emails using Resend
// 
// Setup Instructions:
// 1. Install Supabase CLI: npm install -g supabase
// 2. Link your project: supabase link --project-ref YOUR_PROJECT_REF
// 3. Set environment variables (if not already set):
//    supabase secrets set RESEND_API_KEY=re_YOUR_API_KEY_HERE
//    supabase secrets set FROM_EMAIL=onboarding@resend.dev (or your verified domain)
// 4. Deploy: supabase functions deploy send-feedback-email
//

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'onboarding@resend.dev'

interface FeedbackEmailRequest {
  to: string[]
  feedbackTitle: string
  feedbackType: 'bug' | 'feature-request' | 'general-feedback'
  feedbackDescription: string
  submittedBy: string
  feedbackId?: string
  notificationType: 'new' | 'update'
  status?: string
  adminNotes?: string
  updatedBy?: string
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
    let requestBody: FeedbackEmailRequest
    try {
      requestBody = await req.json()
    } catch (e) {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    const { 
      to, 
      feedbackTitle, 
      feedbackType, 
      feedbackDescription, 
      submittedBy,
      notificationType,
      status,
      adminNotes,
      updatedBy
    } = requestBody

    if (!to || to.length === 0 || !feedbackTitle) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: to, feedbackTitle' }),
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

    // Format email content based on notification type
    const typeLabels: Record<string, string> = {
      'bug': 'Bug Report',
      'feature-request': 'Feature Request',
      'general-feedback': 'General Feedback'
    }

    const statusLabels: Record<string, string> = {
      'new': 'New',
      'reviewing': 'Reviewing',
      'in-progress': 'In Progress',
      'completed': 'Completed',
      'rejected': 'Rejected',
      'duplicate': 'Duplicate'
    }

    let subject: string
    let htmlBody: string

    if (notificationType === 'new') {
      subject = `New ${typeLabels[feedbackType] || 'Feedback'}: ${feedbackTitle}`
      htmlBody = `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: #0E79C9; color: white; padding: 20px; text-align: center; }
              .content { padding: 20px; background-color: #f9f9f9; }
              .badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold; margin-left: 8px; }
              .badge-bug { background-color: #ef4444; color: white; }
              .badge-feature { background-color: #3b82f6; color: white; }
              .badge-general { background-color: #6b7280; color: white; }
              .description { background-color: white; padding: 15px; border-radius: 5px; margin: 15px 0; white-space: pre-wrap; }
              .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>New Feedback Submitted</h1>
              </div>
              <div class="content">
                <p>Hello,</p>
                <p>A new ${typeLabels[feedbackType] || 'feedback'} has been submitted:</p>
                <h2>${feedbackTitle} <span class="badge badge-${feedbackType === 'bug' ? 'bug' : feedbackType === 'feature-request' ? 'feature' : 'general'}">${typeLabels[feedbackType] || 'Feedback'}</span></h2>
                <p><strong>Submitted by:</strong> ${submittedBy}</p>
                <div class="description">
                  <strong>Description:</strong><br>
                  ${feedbackDescription}
                </div>
                <p style="margin-top: 20px; font-size: 14px; color: #666;">
                  Please review this feedback in the app and provide an update when available.
                </p>
              </div>
              <div class="footer">
                <p>Thank you,<br>HSH GC Platform</p>
              </div>
            </div>
          </body>
        </html>
      `
    } else {
      // Update notification
      subject = `Feedback Update: ${feedbackTitle}`
      htmlBody = `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: #0E79C9; color: white; padding: 20px; text-align: center; }
              .content { padding: 20px; background-color: #f9f9f9; }
              .badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold; margin-left: 8px; }
              .badge-bug { background-color: #ef4444; color: white; }
              .badge-feature { background-color: #3b82f6; color: white; }
              .badge-general { background-color: #6b7280; color: white; }
              .status-badge { display: inline-block; padding: 6px 14px; border-radius: 4px; font-size: 13px; font-weight: bold; margin-top: 10px; }
              .status-new { background-color: #fbbf24; color: #78350f; }
              .status-reviewing { background-color: #60a5fa; color: #1e3a8a; }
              .status-in-progress { background-color: #34d399; color: #064e3b; }
              .status-completed { background-color: #10b981; color: white; }
              .status-rejected { background-color: #ef4444; color: white; }
              .status-duplicate { background-color: #9ca3af; color: white; }
              .update-box { background-color: white; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #0E79C9; }
              .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Feedback Update</h1>
              </div>
              <div class="content">
                <p>Hello,</p>
                <p>The following feedback has been updated:</p>
                <h2>${feedbackTitle} <span class="badge badge-${feedbackType === 'bug' ? 'bug' : feedbackType === 'feature-request' ? 'feature' : 'general'}">${typeLabels[feedbackType] || 'Feedback'}</span></h2>
                ${status ? `<p><strong>Status:</strong> <span class="status-badge status-${status}">${statusLabels[status] || status}</span></p>` : ''}
                ${updatedBy ? `<p><strong>Updated by:</strong> ${updatedBy}</p>` : ''}
                ${adminNotes ? `
                  <div class="update-box">
                    <strong>Admin Response:</strong><br>
                    <div style="white-space: pre-wrap; margin-top: 8px;">${adminNotes}</div>
                  </div>
                ` : ''}
                <p style="margin-top: 20px; font-size: 14px; color: #666;">
                  View all feedback and updates in the app.
                </p>
              </div>
              <div class="footer">
                <p>Thank you,<br>HSH GC Platform</p>
              </div>
            </div>
          </body>
        </html>
      `
    }

    // Send email using Resend API
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: to,
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

