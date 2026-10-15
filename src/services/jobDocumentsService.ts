// Files a drywall job keeps on its own (Mark, 2026-10-15) — so the quote that went out and the
// customer's PO live on the job instead of being downloaded and saved to Google Drive by hand.
// Stored as project_documents (Photos & Files tab); see lib/drywall/jobDocuments.

import { supabase } from '@/lib/supabase'
import { sentQuoteFileName } from '@/lib/drywall/jobDocuments'
import { formatQuoteMoney } from '@/lib/drywall/quoteV3Math'
import { fetchOrgDrywallCatalogs } from './drywallCatalogsService'
import { fetchDrywallProjectById, getQuoteOutcomeFromLegacy, quoteV2V3FromLegacy } from './drywallProjectsService'
import { uploadProjectDocument } from './supabaseService'
import { isDrywallQuoteV3 } from '@/types/drywall'

async function countDocuments(projectId: string, type: string): Promise<number> {
  const { count, error } = await supabase
    .from('project_documents')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .eq('type', type)
  if (error) throw error
  return count ?? 0
}

/**
 * Save the quote PDF exactly as it was sent, as the job's next quote revision. Called right
 * after Mark Sent succeeds, reading the quote back from the database so the file is what was
 * stored, not what the page happened to hold. Throws on failure — the caller reports it; the
 * quote stays sent either way.
 *
 * v3 quotes only: the v2 PDF builder can only trigger a download, and every v2 quote is
 * already past sending.
 */
export async function fileSentQuotePdf(projectId: string): Promise<string> {
  const [project, catalogs] = await Promise.all([fetchDrywallProjectById(projectId), fetchOrgDrywallCatalogs()])
  if (!project) throw new Error('Project not found')
  const quote = quoteV2V3FromLegacy(project.legacy)
  if (!isDrywallQuoteV3(quote)) throw new Error('Only quotes from the current editor can be filed')
  // The quote hydrator keeps lines and settings, not the outcome — read that from the record.
  const { outcomeTimestamps, bidSnapshot } = getQuoteOutcomeFromLegacy(project.legacy)
  const sentAt = outcomeTimestamps.sentAt ?? new Date().toISOString()

  // Loaded on demand: the PDF library is large, and the PO intake dialog imports this service
  // from the projects list.
  const { DEFAULT_COMPANY, generateDrywallQuoteV3Pdf } = await import('@/lib/drywallQuotePdfV3')
  const blob = await generateDrywallQuoteV3Pdf({
    project: {
      id: project.id,
      name: project.name,
      client: project.client ?? '',
      address: project.address ?? '',
    },
    quote,
    catalogs,
    company: DEFAULT_COMPANY,
  })

  const revision = (await countDocuments(projectId, 'quote')) + 1
  const name = sentQuoteFileName(quote.quoteNumber, revision, sentAt)
  const total = bidSnapshot?.total
  const doc = await uploadProjectDocument(
    new File([blob], name, { type: 'application/pdf' }),
    projectId,
    'quote',
    total != null ? `Sent quote, revision ${revision} — ${formatQuoteMoney(total)}` : `Sent quote, revision ${revision}`,
    'Sent quotes',
  )
  if (!doc) throw new Error('The quote PDF could not be saved to the job')
  return name
}

/** Attach the customer's purchase order to a job (PO intake). Throws on failure. */
export async function attachCustomerPo(projectId: string, file: File, poReference: string): Promise<void> {
  const doc = await uploadProjectDocument(
    file,
    projectId,
    'purchase-order',
    poReference.trim() ? `Customer PO ${poReference.trim()}` : 'Customer PO',
    'Customer PO',
  )
  if (!doc) throw new Error('The PO file could not be saved to the job')
}
