/**
 * Stale v3 convert audit + backfill harness.
 *
 * Audit:  STALE_CONVERT_MODE=audit PARITY_PAYLOAD_PATH=... npm test -- --run scripts/stale-v3-convert-backfill.harness.test.ts
 * Preview: STALE_CONVERT_MODE=preview ...
 * Apply:   STALE_CONVERT_MODE=apply ... (writes via Supabase service role in .env)
 */
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { parseOrgDrywallCatalogs } from '../src/lib/drywall/catalogUtils'
import {
  BATCH_ARCHIVE_KEY,
  buildRefreshedLegacyQuoteMerge,
  previewStaleConvertRefresh,
  printStaleConvertAuditReport,
  printStaleConvertPreview,
  runStaleConvertAudit,
  type StaleConvertProjectInput,
} from './lib/staleV3ConvertEngine'

const payloadPath = process.env.STALE_CONVERT_PAYLOAD_PATH ?? process.env.PARITY_PAYLOAD_PATH
const mode = process.env.STALE_CONVERT_MODE ?? 'audit'

function loadPayload() {
  if (!payloadPath) throw new Error('Set STALE_CONVERT_PAYLOAD_PATH or PARITY_PAYLOAD_PATH')
  return JSON.parse(readFileSync(payloadPath, 'utf8')) as {
    projects: StaleConvertProjectInput[]
    catalogsPayload: unknown
    orgId?: string
  }
}

async function applyRefresh(project: StaleConvertProjectInput, orgId: string) {
  const url = process.env.VITE_SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.VITE_SUPABASE_ANON_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) throw new Error('Missing Supabase credentials for apply')

  const supabase = createClient(url, key)
  const { data: row, error: fetchErr } = await supabase
    .from('projects')
    .select('metadata')
    .eq('id', project.id)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (fetchErr) throw fetchErr
  if (!row?.metadata) throw new Error(`Project not found: ${project.name}`)

  const prevMeta = row.metadata as Record<string, unknown>
  const prevLegacy =
    prevMeta.legacy && typeof prevMeta.legacy === 'object' && !Array.isArray(prevMeta.legacy)
      ? (prevMeta.legacy as Record<string, unknown>)
      : {}
  const prevQuote =
    prevLegacy.quote && typeof prevLegacy.quote === 'object' && !Array.isArray(prevLegacy.quote)
      ? (prevLegacy.quote as Record<string, unknown>)
      : {}

  const refreshedQuote = buildRefreshedLegacyQuoteMerge(prevQuote, prevQuote.legacyV2Snapshot)
  const mergedLegacy = {
    ...prevLegacy,
    [BATCH_ARCHIVE_KEY]: prevQuote,
    quote: refreshedQuote,
    updatedAt: new Date().toISOString(),
  }
  const mergedMeta = { ...prevMeta, legacy: mergedLegacy }

  const { error: updateErr } = await supabase
    .from('projects')
    .update({ metadata: mergedMeta, updated_at: new Date().toISOString() })
    .eq('id', project.id)
    .eq('organization_id', orgId)

  if (updateErr) throw updateErr
}

describe('stale v3 convert backfill', () => {
  it(`mode=${mode}`, async () => {
    const payload = loadPayload()
    expect(payload.projects.length).toBeGreaterThan(0)
    const catalogs = parseOrgDrywallCatalogs(payload.catalogsPayload)

    if (mode === 'audit') {
      const results = runStaleConvertAudit(payload.projects, payload.catalogsPayload)
      printStaleConvertAuditReport(results)
      expect(results.some((r) => r.stale)).toBe(true)
      return
    }

    const previews = payload.projects.map((p) => previewStaleConvertRefresh(p, catalogs))
    printStaleConvertPreview(previews)

    if (mode === 'preview') {
      expect(previews.filter((p) => p.stale).length).toBeGreaterThan(0)
      return
    }

    if (mode === 'apply') {
      const orgId = payload.orgId
      if (!orgId) throw new Error('payload.orgId required for apply')
      const stale = payload.projects.filter((p) =>
        previewStaleConvertRefresh(p, catalogs).stale,
      )
      for (const project of stale) {
        await applyRefresh(project, orgId)
        console.log(`Applied refresh: ${project.name} (${project.id})`)
      }
      const post = runStaleConvertAudit(payload.projects, payload.catalogsPayload)
      printStaleConvertAuditReport(post)
    }
  })
})
