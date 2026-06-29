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

/** Crew measurers persist photo refs via SECURITY DEFINER RPC; operators use direct merge. */
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

/** Upload image; append ref to metadata.legacy.fieldTakeoff.photos (atomic). */
export async function uploadFieldPhoto(
  projectId: string,
  file: File,
  label?: string,
): Promise<FieldPhotoRef> {
  if (!isOnlineMode()) throw new DrywallPhotoError('Photo uploads require an online connection.')

  const orgId = await requireUserOrgId()
  await assertProjectInOrg(projectId, orgId)

  if (!file.type.startsWith('image/')) {
    throw new DrywallPhotoError('Please choose an image file (JPG, PNG, etc.).')
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new DrywallPhotoError('Image must be under 10 MB.')
  }

  const fileId = generateFieldId()
  const safeName = sanitizeFilename(file.name || 'photo.jpg')
  const storagePath = `${orgId}/${projectId}/${fileId}-${safeName}`

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
    cacheControl: '3600',
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

export { DrywallProjectPermissionError }
