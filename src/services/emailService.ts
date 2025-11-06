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
  expiresAt: Date
}

/**
 * Send quote request email to vendor
 */
export async function sendQuoteRequestEmail(input: SendQuoteRequestEmailInput): Promise<boolean> {
  try {
    // Try using Supabase Edge Function first
    const { data, error } = await supabase.functions.invoke('send-quote-email', {
      body: {
        to: input.to,
        vendorName: input.vendorName,
        projectName: input.projectName,
        tradeName: input.tradeName,
        quoteLink: input.quoteLink,
        scopeOfWork: input.scopeOfWork,
        dueDate: input.dueDate?.toISOString(),
        expiresAt: input.expiresAt.toISOString(),
      },
    })

    if (error) {
      console.error('Error sending email via Edge Function:', error)
      // Fallback to mailto link
      return false
    }

    return data?.success === true
  } catch (error) {
    console.error('Error sending email:', error)
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

This link will expire on ${input.expiresAt.toLocaleDateString()}.

Thank you,
HSH Contractor`
  )

  return `mailto:${input.to}?subject=${subject}&body=${body}`
}

