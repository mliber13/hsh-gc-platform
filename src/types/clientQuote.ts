// ============================================================================
// Client-facing GC quotes (client_quotes / client_quote_* tables)
// Distinct from vendor quote_requests / submitted_quotes.
// ============================================================================

export type ClientQuoteStatus =
  | 'draft'
  | 'sent'
  | 'accepted'
  | 'declined'
  | 'expired'
  | 'superseded'

export const CLIENT_QUOTE_STATUS: Record<
  ClientQuoteStatus,
  { label: string; pillClass: string }
> = {
  draft: {
    label: 'Draft',
    pillClass: 'bg-muted text-muted-foreground border-border',
  },
  sent: {
    label: 'Sent',
    pillClass: 'bg-sky-500/15 text-sky-700 border-sky-500/30 dark:text-sky-300',
  },
  accepted: {
    label: 'Accepted',
    pillClass: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300',
  },
  declined: {
    label: 'Declined',
    pillClass: 'bg-rose-500/15 text-rose-700 border-rose-500/30 dark:text-rose-300',
  },
  expired: {
    label: 'Expired',
    pillClass: 'bg-amber-500/15 text-amber-800 border-amber-500/30 dark:text-amber-200',
  },
  superseded: {
    label: 'Superseded',
    pillClass: 'bg-muted text-muted-foreground border-border',
  },
}

export interface PreparedFor {
  company: string
  attn_name: string
  attn_title?: string
  mailing_address: string
  phone?: string
  email?: string
}

export interface ClientQuote {
  id: string
  organization_id: string
  project_id: string
  quote_number: string
  revision: number
  status: ClientQuoteStatus
  prepared_for: PreparedFor | null
  project_address_override: string | null
  scope_narrative: string | null
  inclusions: string[]
  exclusions: string[]
  validity_days: number
  issued_at: string | null
  expires_at: string | null
  accepted_at: string | null
  declined_at: string | null
  sent_total: number | null
  sent_pdf_url: string | null
  superseded_by_id: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}

export interface ClientQuoteLineItem {
  id: string
  organization_id: string
  client_quote_id: string
  trade_category: string
  display_label: string
  amount: number
  sort_order: number
}

export interface ClientQuoteOption {
  id: string
  organization_id: string
  client_quote_id: string
  label: string
  description: string | null
  amount: number
  sort_order: number
}

export interface ClientQuoteWithChildren extends ClientQuote {
  line_items: ClientQuoteLineItem[]
  options: ClientQuoteOption[]
}

/** List row with optional live rollup for draft totals */
export interface ClientQuoteListRow extends ClientQuote {
  draft_live_total: number | null
}

export interface DraftClientQuoteInput {
  project_id: string
  prepared_for?: PreparedFor
  project_address_override?: string | null
  scope_narrative?: string | null
  inclusions?: string[]
  exclusions?: string[]
  validity_days?: number
  line_items?: Array<Omit<ClientQuoteLineItem, 'id' | 'organization_id' | 'client_quote_id'>>
  options?: Array<Omit<ClientQuoteOption, 'id' | 'organization_id' | 'client_quote_id'>>
}
