// Naming and typing for files kept on a drywall job (Photos & Files → Project Documents).
// Mark, 2026-10-15: a job holds its own prints, sent quotes and POs, so nothing is hand-saved
// to Google Drive. Crew read only Plans and Specifications (RLS), so the type decides who sees it.

import type { DocumentType } from '@/types'

/** Crew see these, and only these, on their job screen. */
export const CREW_VISIBLE_DOCUMENT_TYPES: readonly DocumentType[] = ['plan', 'specification']

/** MM-DD-YYYY of an instant, in local time — file names cannot carry a slash. */
function fileDate(iso: string): string {
  const d = new Date(iso)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}-${dd}-${d.getFullYear()}`
}

/**
 * "Quote DW-2026-041 rev 2 - sent 10-15-2026.pdf". The revision counts the quote PDFs already
 * filed on the job, so the first send is rev 1 and each re-send after an unlock is the next.
 */
export function sentQuoteFileName(quoteNumber: string | undefined, revision: number, sentAtIso: string): string {
  const num = quoteNumber?.trim() ? quoteNumber.trim() : 'Quote'
  const label = num.toLowerCase().startsWith('quote') ? num : `Quote ${num}`
  return `${label} rev ${revision} - sent ${fileDate(sentAtIso)}.pdf`
}

/**
 * A sensible type for a file just picked for upload on a drywall job: a PDF is usually a print
 * set (Plan, which crew can open), unless its name says it is money paperwork crew must not see.
 * Only a starting point — the type picker is right beside it.
 */
export function guessDrywallDocumentType(fileName: string, mimeType: string): DocumentType | null {
  const n = fileName.toLowerCase()
  if (/\bquote\b|\bestimate\b|\bbid\b/.test(n)) return 'quote'
  if (/\bp\.?o\b|purchase.?order/.test(n)) return 'purchase-order'
  if (/\binvoice\b/.test(n)) return 'invoice'
  if (/contract|agreement/.test(n)) return 'contract'
  if (/\bspec/.test(n)) return 'specification'
  if (mimeType === 'application/pdf' || n.endsWith('.pdf')) return 'plan'
  return null
}
