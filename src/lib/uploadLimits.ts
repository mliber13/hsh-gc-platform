// ============================================================================
// Pre-flight upload checks (P1-EGRESS-7)
// ============================================================================
//
// A correction to the hardening plan, which recorded "no size cap, no server mime check"
// and warned that 200 MB print sets could land in storage. They cannot: every bucket
// already carries a `file_size_limit` and an `allowed_mime_types` list, enforced by Storage.
// Verified live 2026-09-29 with `storage.listBuckets()`.
//
// What was actually missing is the *client* half. Without it the browser streams the whole
// file before Storage rejects it, so a 150 MB upload costs 150 MB of transfer to earn an
// error — and the error only reached `console.error`, never the operator.
//
// These numbers mirror the bucket configuration. They are a fast, friendly duplicate of the
// server's rule, never the only copy of it: if they drift, Storage still refuses and the
// upload fails correctly, just slowly. Re-check with:
//   node -e "...supabase.storage.listBuckets()"   (see scripts/, or the Dashboard)

export type UploadBucket = 'project-documents' | 'deal-documents' | 'drywall-field-photos'

type BucketLimits = {
  /** Bytes. Mirrors the bucket's `file_size_limit`. */
  maxBytes: number
  /** Mirrors the bucket's `allowed_mime_types`. */
  mimeTypes: readonly string[]
}

const OFFICE_DOC_MIME = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/zip',
  'application/x-zip-compressed',
  'text/plain',
  'text/csv',
] as const

export const UPLOAD_LIMITS: Record<UploadBucket, BucketLimits> = {
  'project-documents': { maxBytes: 104_857_600, mimeTypes: OFFICE_DOC_MIME },
  'deal-documents': { maxBytes: 52_428_800, mimeTypes: OFFICE_DOC_MIME },
  'drywall-field-photos': {
    maxBytes: 10_485_760,
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'],
  },
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(bytes >= 10_485_760 ? 0 : 1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} bytes`
}

/**
 * Why this file cannot be uploaded to this bucket, or null when it can.
 *
 * An empty `file.type` is allowed through: browsers leave it blank for plenty of ordinary
 * files, and guessing from the extension here would refuse uploads Storage would have
 * accepted. Storage remains the authority.
 */
export function uploadRejectionReason(
  file: { name: string; size: number; type?: string },
  bucket: UploadBucket,
): string | null {
  const limits = UPLOAD_LIMITS[bucket]

  if (file.size <= 0) {
    return `"${file.name}" is empty.`
  }
  if (file.size > limits.maxBytes) {
    return `"${file.name}" is ${formatBytes(file.size)}. The limit is ${formatBytes(limits.maxBytes)}.`
  }

  const type = (file.type ?? '').trim().toLowerCase()
  if (type && !limits.mimeTypes.includes(type)) {
    return `"${file.name}" is a ${type} file, which cannot be uploaded here.`
  }

  return null
}
