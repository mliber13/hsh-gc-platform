// ============================================================================
// Email Service
// ============================================================================
//
// Service for sending emails via Supabase Edge Functions or direct API
//

import { supabase } from '@/lib/supabase'

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

    if (data && typeof data === 'object' && 'success' in data) {
      if (data.success === true) {
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

export interface SendDealDocumentShareInput {
  documentId: string
  documentName: string
  toEmail: string
  message?: string
}

/**
 * Share a deal document by email (sends a time-limited link via Edge Function).
 */
export async function sendDealDocumentShare(input: SendDealDocumentShareInput): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke('send-deal-document-share', {
      body: {
        documentId: input.documentId,
        toEmail: input.toEmail.trim(),
        message: input.message?.trim() || undefined,
      },
    })

    if (error) {
      console.error('Error sending deal document share email:', error)
      return false
    }

    if (data && typeof data === 'object' && 'success' in data) {
      if (data.success === true) return true
      if (data.error) console.error('Edge Function error:', data.error)
      return false
    }    return false
  } catch (error) {
    console.error('Error sending deal document share:', error)
    return false
  }
}
