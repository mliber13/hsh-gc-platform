// ============================================================================
// Drywall field photos — Supabase Storage (drywall-field-photos bucket)
// ============================================================================

import { supabase, isOnlineMode } from '@/lib/supabase'
import { generateFieldId, normalizeFieldPhotoRef } from '@/lib/drywall/fieldMeasurementUtils'
import { saveFieldTakeoffAsMeasurer } from '@/services/crewWorkspaceService'
import { requireUserOrgId, getCurrentUserProfile } from '@/services/userService'
import {
  DrywallProjectPermissionError,
  fetchFieldTakeoff,
  saveFieldTakeoff,
} from '@/services/drywallProjectsService'
import type { FieldPhotoRef, FieldTakeoff } from '@/types/drywall'

const BUCKET = 'drywall-field-photos'
const DEFAULT_SIGNED_EXPIRY = 3600

// Bucket-enforced allowed_mime_types (see 20260529120000_drywall_field_photos_bucket.sql).
// A file whose Content-Type isn't one of these is rejected by Storage with 415
// invalid_mime_type — which is why we must always send an explicit, allowed type.
const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
])
const EXT_TO_IMAGE_TYPE: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
}

/**
 * Resolve a Storage-acceptable image Content-Type for a picked file.
 * iOS/HEIC captures often arrive with an empty or non-standard `file.type`; sending
 * no type (or octet-stream) fails the bucket's allowed_mime_types check. Falls back
 * to the filename extension, then to jpeg. Returns null only when the file is clearly
 * not an image (no image type and no image extension).
 */
function resolveImageContentType(file: File): string | null {
  const t = (file.type || '').toLowerCase()
  if (ALLOWED_IMAGE_TYPES.has(t)) return t
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  if (EXT_TO_IMAGE_TYPE[ext]) return EXT_TO_IMAGE_TYPE[ext]
  // Declared as some image/* subtype we don't explicitly allow → normalize to jpeg.
  if (t.startsWith('image/')) return 'image/jpeg'
  return null
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
}

function storagePermissionMessage(error: { message?: string; statusCode?: string }): string {
  const msg = (error.message ?? '').toLowerCase()
  if (
    msg.includes('row-level security') ||
    msg.includes('permission') ||
    msg.includes('policy') ||
    error.statusCode === '403'
  ) {
    return 'You do not have permission to upload or view field photos for this project.'
  }
  return error.message || 'Storage operation failed.'
}

export class DrywallPhotoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DrywallPhotoError'
  }
}

async function assertProjectInOrg(projectId: string, orgId: string): Promise<void> {
  const { data, error } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('organization_id', orgId)
    .maybeSingle()

  if (error) throw new DrywallPhotoError(error.message || 'Could not verify project.')
  if (!data) throw new DrywallPhotoError('Project not found in your organization.')
}

/** Crew measurers persist full takeoff via SECURITY DEFINER RPC; operators use direct merge. */
async function persistFieldTakeoffPhotos(projectId: string, takeoff: FieldTakeoff): Promise<void> {
  const profile = await getCurrentUserProfile()
  const roles = profile?.roles ?? []
  const isCrewOnly =
    roles.includes('crew') &&
    !roles.some((r) => r === 'owner' || r === 'office_gc' || r === 'office_drywall')

  if (isCrewOnly) {
    await saveFieldTakeoffAsMeasurer(projectId, takeoff)
    return
  }

  await saveFieldTakeoff(projectId, takeoff)
}

function isCrewOnlyProfile(roles: string[] | null | undefined): boolean {
  const r = roles ?? []
  return (
    r.includes('crew') &&
    !r.some((role) => role === 'owner' || role === 'office_gc' || role === 'office_drywall')
  )
}

/** Upload image; append ref to metadata.legacy.fieldTakeoff.photos (atomic). */
export async function uploadFieldPhoto(
  projectId: string,
  file: File,
  label?: string,
): Promise<FieldPhotoRef> {
  if (!isOnlineMode()) throw new DrywallPhotoError('Photo uploads require an online connection.')

  const orgId = await requireUserOrgId()
  await assertProjectInOrg(projectId, orgId)

  const contentType = resolveImageContentType(file)
  if (!contentType) {
    throw new DrywallPhotoError('Please choose an image file (JPG, PNG, HEIC, etc.).')
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new DrywallPhotoError('Image must be under 10 MB.')
  }

  const fileId = generateFieldId()
  const safeName = sanitizeFilename(file.name || 'photo.jpg')
  const storagePath = `${orgId}/${projectId}/${fileId}-${safeName}`

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
    cacheControl: '3600',
    contentType,
    upsert: false,
  })

  if (uploadError) {
    console.error('uploadFieldPhoto:', uploadError)
    throw new DrywallPhotoError(storagePermissionMessage(uploadError))
  }

  const ref: FieldPhotoRef = {
    id: fileId,
    storagePath,
    uploadedAt: new Date().toISOString(),
    label: label?.trim() || file.name,
  }

  try {
    const profile = await getCurrentUserProfile()
    if (isCrewOnlyProfile(profile?.roles)) {
      // Append-only path — does not rewrite takeoff or touch reviewStatus.
      const { error } = await supabase.rpc('crew_append_field_photo', {
        p_project_id: projectId,
        p_photo: {
          id: ref.id,
          storagePath: ref.storagePath,
          uploadedAt: ref.uploadedAt,
          label: ref.label ?? null,
        },
      })
      if (error) {
        throw new DrywallPhotoError(error.message || 'Failed to save photo to project.')
      }
      return ref
    }

    const takeoff = await fetchFieldTakeoff(projectId)
    const photos = [...(takeoff.photos ?? []), ref]
    await persistFieldTakeoffPhotos(projectId, { ...takeoff, photos })
    return ref
  } catch (e) {
    try {
      await supabase.storage.from(BUCKET).remove([storagePath])
    } catch (_) {
      /* ignore cleanup failure */
    }
    throw e
  }
}

/** List photo refs from fieldTakeoff JSONB (canonical for UI). */
export async function listFieldPhotos(projectId: string): Promise<FieldPhotoRef[]> {
  const takeoff = await fetchFieldTakeoff(projectId)
  return (takeoff.photos ?? []).map(normalizeFieldPhotoRef)
}

export async function getSignedPhotoUrl(
  storagePath: string,
  expiresIn = DEFAULT_SIGNED_EXPIRY,
): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, expiresIn)
  if (error || !data?.signedUrl) {
    // Warn (not error) — "Object not found" is the expected return for users without
    // storage RLS access; the caller's UI handles a null/error result gracefully.
    console.warn('getSignedPhotoUrl:', error)
    throw new DrywallPhotoError(storagePermissionMessage(error ?? { message: 'Signed URL failed' }))
  }
  return data.signedUrl
}

/** Remove Storage object and drop ref from fieldTakeoff.photos[]. */
export async function deleteFieldPhoto(projectId: string, storagePath: string): Promise<void> {
  if (!isOnlineMode()) throw new DrywallPhotoError('Photo deletes require an online connection.')
  if (!storagePath) return

  const orgId = await requireUserOrgId()
  if (!storagePath.startsWith(`${orgId}/`)) {
    throw new DrywallPhotoError('Invalid photo path for your organization.')
  }

  const { error: removeError } = await supabase.storage.from(BUCKET).remove([storagePath])
  if (removeError) {
    console.error('deleteFieldPhoto storage:', removeError)
    throw new DrywallPhotoError(storagePermissionMessage(removeError))
  }

  const takeoff = await fetchFieldTakeoff(projectId)
  const photos = (takeoff.photos ?? []).filter(
    (p) => p.storagePath !== storagePath && p.id !== storagePath,
  )
  await persistFieldTakeoffPhotos(projectId, { ...takeoff, photos })
}

// ============================================================================
// Per-schedule-item progress photos (schedule_items.photos + crew RPCs)
// ============================================================================

export type ScheduleItemPhotoRef = {
  id: string
  storagePath: string
  uploadedAt: string
  uploadedBy?: string
}

/** Upload an image and append its ref to schedule_items.photos (atomic via RPC). */
export async function uploadScheduleItemPhoto(
  projectId: string,
  itemId: string,
  file: File,
): Promise<ScheduleItemPhotoRef> {
  if (!isOnlineMode()) throw new DrywallPhotoError('Photo uploads require an online connection.')

  const orgId = await requireUserOrgId()
  const fileId = generateFieldId()
  const safeName = sanitizeFilename(file.name || 'photo.jpg')
  const storagePath = `${orgId}/${projectId}/schedule/${itemId}/${fileId}-${safeName}`

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
    contentType: resolveImageContentType(file) || 'image/jpeg',
    upsert: false,
  })
  if (uploadError) {
    console.error('uploadScheduleItemPhoto:', uploadError)
    throw new DrywallPhotoError(storagePermissionMessage(uploadError))
  }

  const ref: ScheduleItemPhotoRef = {
    id: fileId,
    storagePath,
    uploadedAt: new Date().toISOString(),
  }

  const { error } = await supabase.rpc('crew_append_schedule_item_photo', {
    p_item_id: itemId,
    p_photo: { id: ref.id, storagePath: ref.storagePath, uploadedAt: ref.uploadedAt },
  })
  if (error) {
    // Roll back the uploaded object so storage isn't orphaned.
    await supabase.storage.from(BUCKET).remove([storagePath])
    console.error('crew_append_schedule_item_photo:', error)
    throw new DrywallPhotoError(error.message || 'Could not save photo')
  }

  return ref
}

/** List photo refs for a schedule item (crew read schedule_items directly via RLS). */
export async function listScheduleItemPhotos(itemId: string): Promise<ScheduleItemPhotoRef[]> {
  if (!isOnlineMode()) return []
  const { data, error } = await supabase
    .from('schedule_items')
    .select('photos')
    .eq('id', itemId)
    .maybeSingle()
  if (error || !data) return []

  const raw = ((data.photos as unknown[]) ?? []).filter(
    (p): p is Record<string, unknown> => !!p && typeof p === 'object',
  )
  return raw
    .map((p) => ({
      id: String(p.id ?? p.storagePath ?? ''),
      storagePath: String(p.storagePath ?? ''),
      uploadedAt: String(p.uploadedAt ?? ''),
      uploadedBy: p.uploadedBy ? String(p.uploadedBy) : undefined,
    }))
    .filter((p) => p.storagePath)
}

/** Remove a photo ref (RPC) then best-effort delete the storage object. */
export async function deleteScheduleItemPhoto(itemId: string, storagePath: string): Promise<void> {
  if (!isOnlineMode()) throw new DrywallPhotoError('Photo deletes require an online connection.')
  if (!storagePath) return

  const orgId = await requireUserOrgId()
  if (!storagePath.startsWith(`${orgId}/`)) {
    throw new DrywallPhotoError('Invalid photo path for your organization.')
  }

  const { error: rpcError } = await supabase.rpc('crew_remove_schedule_item_photo', {
    p_item_id: itemId,
    p_storage_path: storagePath,
  })
  if (rpcError) {
    console.error('crew_remove_schedule_item_photo:', rpcError)
    throw new DrywallPhotoError(rpcError.message || 'Could not remove photo')
  }

  const { error: rmError } = await supabase.storage.from(BUCKET).remove([storagePath])
  if (rmError) console.warn('schedule photo storage cleanup:', rmError)
}

export { DrywallProjectPermissionError }
