// ============================================================================
// Reading a quote document reference, old shape or new (P1-SEC-6)
// ============================================================================
//
// `quote-documents` was a PUBLIC bucket, so `uploadQuotePDF` returned the result of
// `getPublicUrl` and that whole URL was stored on the trade. Anyone holding the link could
// download the file without signing in.
//
// Uploads now store the storage PATH and a signed URL is minted when someone asks to view
// the file. Three live rows (two "Rough/Finish" and one "HVAC Scope Complete", May 2026)
// still hold the old full URL, so both shapes have to resolve — for those three rows and
// for any browser tab still holding one.

const BUCKET_MARKER = '/quote-documents/'

/**
 * The storage path inside `quote-documents`, from either shape.
 *
 * Returns null for anything that is neither, rather than guessing — a wrong path produces a
 * signed URL that 404s, which is harder to diagnose than a refusal.
 */
export function quoteDocumentPath(stored: string | null | undefined): string | null {
  const value = String(stored ?? '').trim()
  if (!value) return null

  // Old shape: a full public URL. Query strings appear on some Supabase URL forms.
  const markerAt = value.indexOf(BUCKET_MARKER)
  if (markerAt >= 0) {
    const path = value.slice(markerAt + BUCKET_MARKER.length).split(/[?#]/)[0]
    return path ? decodeURIComponent(path) : null
  }

  // Any other absolute URL is not ours — a bare path never has a scheme.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return null

  return value.replace(/^\/+/, '') || null
}

/** Whether a stored value still carries a public URL, for the one-off audit. */
export function isLegacyPublicQuoteUrl(stored: string | null | undefined): boolean {
  const value = String(stored ?? '').trim()
  return value.includes('/storage/v1/object/public' + BUCKET_MARKER)
}
