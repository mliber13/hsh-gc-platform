/**
 * The quote's checklist strip (Mark, 2026-10-14 — the Field steps' "checklist feel" on the quote).
 *
 * Drafting a quote goes back and forth, so unlike Field nothing folds or gates: each item is read
 * from the quote and says where it stands, and clicking it goes to where it is fixed. Only Sent is
 * a real gate in the app (it locks the quote); the rest are reminders.
 *
 * "PDF set up" was proposed and dropped: every quote starts with default PDF settings, so there is
 * no honest signal for it. Customer details are what a missing value actually shows on the PDF.
 */
import type { DrywallQuoteOutcome } from '@/types/drywall'

export type QuoteCheckState = 'done' | 'todo' | 'warn' | 'bad'
export type QuoteCheckKey = 'lines' | 'scope' | 'margin' | 'customer' | 'sent' | 'outcome'

export interface QuoteCheckItem {
  key: QuoteCheckKey
  label: string
  state: QuoteCheckState
  detail: string
}

export interface QuoteChecklistInput {
  lineCount: number
  total: number
  useCustomScope: boolean
  customScopeText: string
  ceilingFinish: string
  wallFinish: string
  marginPct: number | null
  marginIndicator: 'red' | 'yellow' | 'green' | 'neutral' | string
  floorPct: number
  client: string
  address: string
  outcome: DrywallQuoteOutcome
  sentAt?: string | null
  approvedAt?: string | null
  lostAt?: string | null
}

function day(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const pct = (n: number) => `${(n * 100).toFixed(1).replace(/\.0$/, '')}%`

export function buildQuoteChecklist(input: QuoteChecklistInput): QuoteCheckItem[] {
  const items: QuoteCheckItem[] = []
  const priced = input.lineCount > 0 && input.total > 0

  items.push({
    key: 'lines',
    label: 'Line items',
    state: priced ? 'done' : 'todo',
    detail: priced
      ? `${input.lineCount} line${input.lineCount === 1 ? '' : 's'}`
      : input.lineCount > 0
        ? 'Lines added, nothing priced yet'
        : 'No lines yet — add them or import from Togal',
  })

  const scopeDone = input.useCustomScope
    ? input.customScopeText.trim().length > 0
    : Boolean(input.ceilingFinish || input.wallFinish)
  items.push({
    key: 'scope',
    label: 'Scope',
    state: scopeDone ? 'done' : 'todo',
    detail: scopeDone
      ? input.useCustomScope
        ? 'Custom scope written'
        : [input.ceilingFinish && `Ceilings ${input.ceilingFinish}`, input.wallFinish && `Walls ${input.wallFinish}`]
            .filter(Boolean)
            .join(' · ')
      : input.useCustomScope
        ? 'Custom scope is on but empty'
        : 'Finishes not set',
  })

  const floor = pct(input.floorPct)
  items.push(
    !priced || input.marginPct == null
      ? { key: 'margin', label: 'Margin', state: 'todo', detail: `Floor ${floor}` }
      : {
          key: 'margin',
          label: 'Margin',
          state: input.marginIndicator === 'red' ? 'bad' : input.marginIndicator === 'yellow' ? 'warn' : 'done',
          detail: `${pct(input.marginPct)} · floor ${floor}`,
        },
  )

  const missing = [!input.client.trim() && 'client', !input.address.trim() && 'address'].filter(Boolean)
  items.push({
    key: 'customer',
    label: 'Customer details',
    state: missing.length === 0 ? 'done' : 'todo',
    detail: missing.length === 0 ? input.client.trim() : `No ${missing.join(' or ')} — it prints on the quote`,
  })

  const sent = input.outcome === 'sent' || input.outcome === 'approved' || input.outcome === 'lost'
  items.push({
    key: 'sent',
    label: 'Sent',
    state: sent ? 'done' : 'todo',
    detail: sent ? (day(input.sentAt) ? `Sent ${day(input.sentAt)}` : 'Sent') : 'Not sent yet',
  })

  items.push(
    input.outcome === 'approved'
      ? { key: 'outcome', label: 'Outcome', state: 'done', detail: day(input.approvedAt) ? `Approved ${day(input.approvedAt)}` : 'Approved' }
      : input.outcome === 'lost'
        ? { key: 'outcome', label: 'Outcome', state: 'done', detail: day(input.lostAt) ? `Lost ${day(input.lostAt)}` : 'Lost' }
        : { key: 'outcome', label: 'Outcome', state: 'todo', detail: sent ? 'Waiting on the customer' : 'After it is sent' },
  )

  return items
}
