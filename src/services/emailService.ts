// ============================================================================
// Email Service
// ============================================================================
//
// Service for sending emails via Supabase Edge Functions or direct API
//

import { supabase } from '@/lib/supabase'

export interface SendQuoteRequestEmailInput {
  to: string
  vendorName?: string
  projectName: string
  tradeName?: string
  quoteLink: string
  scopeOfWork: string
  dueDate?: Date | null
  expiresAt: Date | null
}

/**
 * Send quote request email to vendor
 */
export async function sendQuoteRequestEmail(input: SendQuoteRequestEmailInput): Promise<boolean> {
  try {
    // Ensure expiresAt is always a valid ISO string
    const expiresAtDate = input.expiresAt instanceof Date && !isNaN(input.expiresAt.getTime())
      ? input.expiresAt
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // Default 30 days if not provided
    
    // Try using Supabase Edge Function first
    const { data, error } = await supabase.functions.invoke('send-quote-email', {
      body: {
        to: input.to,
        vendorName: input.vendorName,
        projectName: input.projectName,
        tradeName: input.tradeName,
        quoteLink: input.quoteLink,
        scopeOfWork: input.scopeOfWork,
        dueDate: input.dueDate instanceof Date && !isNaN(input.dueDate.getTime()) 
          ? input.dueDate.toISOString() 
          : undefined,
        expiresAt: expiresAtDate.toISOString(),
      },
    })

    if (error) {
      console.error('Error sending email via Edge Function:', error)
      console.error('Error details:', {
        message: error.message,
        status: error.status,
      })
      
      // If we have error context (Response object), try to read the body
      if (error.context instanceof Response) {
        try {
          // Clone the response so we can read it without consuming it
          const clonedResponse = error.context.clone()
          const errorBody = await clonedResponse.json()
          console.error('Edge Function error response:', errorBody)
          if (errorBody.error) {
            console.error('Edge Function error message:', errorBody.error)
          }
        } catch (e) {
          try {
            const clonedResponse = error.context.clone()
            const errorText = await clonedResponse.text()
            console.error('Edge Function error response (text):', errorText)
          } catch (e2) {
            console.error('Could not read error response body. Status:', error.context.status)
            console.error('Status text:', error.context.statusText)
          }
        }
      } else if (error.context?.body) {
        try {
          const errorBody = typeof error.context.body === 'string' 
            ? JSON.parse(error.context.body) 
            : error.context.body
          console.error('Edge Function error response:', errorBody)
        } catch (e) {
          console.error('Could not parse error body:', error.context.body)
        }
      }
      
      return false
    }

    if (data && typeof data === 'object' && 'success' in data) {
      if (data.success === true) {
        console.log('Email sent successfully via Edge Function')
        return true
      } else {
        console.warn('Edge Function returned success: false', data)
        return false
      }
    }

    // If no success field, assume failure
    console.warn('Edge Function response missing success field:', data)
    return false
  } catch (error) {
    console.error('Error sending email:', error)
    if (error instanceof Error) {
      console.error('Error message:', error.message)
      console.error('Error stack:', error.stack)
    }
    return false
  }
}

/**
 * Generate mailto link as fallback
 */
export function generateMailtoLink(input: SendQuoteRequestEmailInput): string {
  const subject = encodeURIComponent(
    `Quote Request: ${input.projectName}${input.tradeName ? ` - ${input.tradeName}` : ''}`
  )

  const body = encodeURIComponent(
    `Hello${input.vendorName ? ` ${input.vendorName}` : ''},

You have been invited to submit a quote for the following project:

Project: ${input.projectName}
${input.tradeName ? `Trade: ${input.tradeName}\n` : ''}
${input.dueDate ? `Due Date: ${input.dueDate.toLocaleDateString()}\n` : ''}

Scope of Work:
${input.scopeOfWork}

Please submit your quote using the following link:
${input.quoteLink}

${input.expiresAt ? `This link will expire on ${input.expiresAt.toLocaleDateString()}.` : 'This link will expire in 30 days.'}

Thank you,
HSH Contractor`
  )

  return `mailto:${input.to}?subject=${subject}&body=${body}`
}

export interface SendFeedbackNotificationInput {
  to: string[]
  feedbackTitle: string
  feedbackType: 'bug' | 'feature-request' | 'general-feedback'
  feedbackDescription: string
  submittedBy: string
  notificationType: 'new' | 'update'
  status?: string
  adminNotes?: string
  updatedBy?: string
}

/**
 * Send feedback notification email
 */
export async function sendFeedbackNotification(input: SendFeedbackNotificationInput): Promise<boolean> {
  try {
    console.log('📧 Calling send-feedback-email Edge Function...')
    console.log('📧 Email details:', {
      to: input.to,
      notificationType: input.notificationType,
      feedbackTitle: input.feedbackTitle,
    })
    
    // Try using Supabase Edge Function first
    const { data, error } = await supabase.functions.invoke('send-feedback-email', {
      body: {
        to: input.to,
        feedbackTitle: input.feedbackTitle,
        feedbackType: input.feedbackType,
        feedbackDescription: input.feedbackDescription,
        submittedBy: input.submittedBy,
        notificationType: input.notificationType,
        status: input.status,
        adminNotes: input.adminNotes,
        updatedBy: input.updatedBy,
      },
    })

    if (error) {
      console.error('❌ Error sending feedback email via Edge Function:', error)
      console.error('Error details:', {
        message: error.message,
        status: error.status,
        context: error.context,
      })
      return false
    }

    console.log('📧 Edge Function response:', data)

    if (data && typeof data === 'object' && 'success' in data) {
      if (data.success === true) {
        console.log('✅ Feedback email sent successfully via Edge Function')
        return true
      } else {
        console.warn('⚠️ Edge Function returned success: false', data)
        if ('error' in data) {
          console.error('Edge Function error:', data.error)
        }
        return false
      }
    }

    // If no success field, assume failure
    console.warn('⚠️ Edge Function response missing success field:', data)
    return false
  } catch (error) {
    console.error('❌ Error sending feedback email:', error)
    if (error instanceof Error) {
      console.error('Error message:', error.message)
      console.error('Error stack:', error.stack)
    }
    return false
  }
}

