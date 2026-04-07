import { supabase } from '@/lib/supabase'
import { SelectionScheduleDocument, SelectionScheduleVersion } from '@/types/selectionSchedule'

export type UploadScheduleRowImageResult =
  | { ok: true; imageUrl: string; imageStoragePath: string }
  | { ok: false; error: string }

/**
 * Upload a reference image for a selection schedule row into the same bucket as Selection Book images.
 */
export async function uploadSelectionScheduleRowImage(
  projectId: string,
  rowId: string,
  file: File,
): Promise<UploadScheduleRowImageResult> {
  try {
    const { data: authData } = await supabase.auth.getUser()
    const user = authData.user
    if (!user) return { ok: false, error: 'You must be signed in to upload images.' }

    const { data: projectData, error: projectError } = await supabase
      .from('projects')
      .select('organization_id')
      .eq('id', projectId)
      .single()

    if (projectError || !projectData?.organization_id) {
      console.error('Error loading project for schedule image upload:', projectError)
      return { ok: false, error: 'Could not load project for upload.' }
    }

    const orgId = projectData.organization_id

    if (!file.type.startsWith('image/')) {
      return { ok: false, error: 'Please choose an image file (JPG, PNG, etc.).' }
    }
    if (file.size > 10 * 1024 * 1024) {
      return { ok: false, error: 'Image must be under 10 MB.' }
    }

    const timestamp = Date.now()
    const fileExt = file.name.split('.').pop() || 'jpg'
    const fileName = `${rowId}-${timestamp}.${fileExt}`
    const filePath = `${orgId}/${projectId}/selection-schedules/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('selection-images')
      .upload(filePath, file, { cacheControl: '3600', upsert: false })

    if (uploadError) {
      console.error('Error uploading selection schedule image:', uploadError)
      return { ok: false, error: uploadError.message || 'Upload failed.' }
    }

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('selection-images')
      .createSignedUrl(filePath, 31536000)

    if (signedUrlError || !signedUrlData?.signedUrl) {
      console.error('Error creating signed URL for schedule image:', signedUrlError)
      try {
        await supabase.storage.from('selection-images').remove([filePath])
      } catch (_) {}
      return { ok: false, error: 'Upload succeeded but could not create a view link. Try again.' }
    }

    return {
      ok: true,
      imageUrl: signedUrlData.signedUrl,
      imageStoragePath: filePath,
    }
  } catch (e) {
    console.error('uploadSelectionScheduleRowImage:', e)
    return { ok: false, error: e instanceof Error ? e.message : 'Upload failed.' }
  }
}

export async function removeSelectionScheduleRowImageFromStorage(
  imageStoragePath: string,
): Promise<void> {
  if (!imageStoragePath) return
  try {
    await supabase.storage.from('selection-images').remove([imageStoragePath])
  } catch (e) {
    console.warn('removeSelectionScheduleRowImageFromStorage:', e)
  }
}

export async function loadSelectionScheduleDraft(
  projectId: string,
): Promise<SelectionScheduleVersion | null> {
  const { data, error } = await supabase
    .from('selection_schedule_versions')
    .select('*')
    .eq('project_id', projectId)
    .eq('is_draft', true)
    .maybeSingle()

  if (error) {
    if (error.code === 'PGRST116') return null
    console.error('Error loading selection schedule draft:', error)
    return null
  }
  if (!data) return null

  return {
    id: data.id,
    projectId: data.project_id,
    organizationId: data.organization_id,
    versionNumber: data.version_number,
    versionLabel: data.version_label ?? undefined,
    isDraft: data.is_draft,
    data: data.schedule_data as SelectionScheduleDocument,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    createdBy: data.created_by ?? undefined,
  }
}

export async function saveSelectionScheduleDraft(
  projectId: string,
  scheduleData: SelectionScheduleDocument,
  versionLabel = 'Draft',
): Promise<boolean> {
  try {
    const { data: authData } = await supabase.auth.getUser()
    const user = authData.user
    if (!user) return false

    const { data: projectData, error: projectError } = await supabase
      .from('projects')
      .select('organization_id')
      .eq('id', projectId)
      .single()

    if (projectError) {
      console.error('Error loading project organization for schedule draft:', projectError)
      return false
    }

    const rowData = {
      project_id: projectId,
      organization_id: projectData?.organization_id || 'default-org',
      created_by: user.id,
      version_number: 0,
      version_label: versionLabel,
      is_draft: true,
      schedule_data: scheduleData,
    }

    const { data: existingDraft } = await supabase
      .from('selection_schedule_versions')
      .select('id')
      .eq('project_id', projectId)
      .eq('is_draft', true)
      .maybeSingle()

    if (existingDraft?.id) {
      const { error: updateError } = await supabase
        .from('selection_schedule_versions')
        .update(rowData)
        .eq('id', existingDraft.id)
      if (updateError) {
        console.error('Error updating selection schedule draft:', updateError)
        return false
      }
      return true
    }

    const { error: insertError } = await supabase
      .from('selection_schedule_versions')
      .insert(rowData)
    if (insertError) {
      console.error('Error creating selection schedule draft:', insertError)
      return false
    }
    return true
  } catch (error) {
    console.error('Error saving selection schedule draft:', error)
    return false
  }
}

export async function listSelectionScheduleVersions(
  projectId: string,
): Promise<SelectionScheduleVersion[]> {
  const { data, error } = await supabase
    .from('selection_schedule_versions')
    .select('*')
    .eq('project_id', projectId)
    .order('is_draft', { ascending: false })
    .order('version_number', { ascending: false })

  if (error) {
    console.error('Error listing selection schedule versions:', error)
    return []
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    projectId: row.project_id,
    organizationId: row.organization_id,
    versionNumber: row.version_number,
    versionLabel: row.version_label ?? undefined,
    isDraft: row.is_draft,
    data: row.schedule_data as SelectionScheduleDocument,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by ?? undefined,
  }))
}

export async function loadSelectionScheduleVersionById(
  versionId: string,
): Promise<SelectionScheduleVersion | null> {
  const { data, error } = await supabase
    .from('selection_schedule_versions')
    .select('*')
    .eq('id', versionId)
    .maybeSingle()

  if (error) {
    if (error.code === 'PGRST116') return null
    console.error('Error loading selection schedule version by id:', error)
    return null
  }
  if (!data) return null

  return {
    id: data.id,
    projectId: data.project_id,
    organizationId: data.organization_id,
    versionNumber: data.version_number,
    versionLabel: data.version_label ?? undefined,
    isDraft: data.is_draft,
    data: data.schedule_data as SelectionScheduleDocument,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    createdBy: data.created_by ?? undefined,
  }
}

export async function saveSelectionScheduleVersion(
  projectId: string,
  scheduleData: SelectionScheduleDocument,
  versionLabel?: string,
): Promise<boolean> {
  try {
    const { data: authData } = await supabase.auth.getUser()
    const user = authData.user
    if (!user) return false

    const { data: projectData, error: projectError } = await supabase
      .from('projects')
      .select('organization_id')
      .eq('id', projectId)
      .single()

    if (projectError) {
      console.error('Error loading project organization for schedule version save:', projectError)
      return false
    }

    const { data: latestRows, error: latestError } = await supabase
      .from('selection_schedule_versions')
      .select('version_number')
      .eq('project_id', projectId)
      .eq('is_draft', false)
      .order('version_number', { ascending: false })
      .limit(1)

    if (latestError) {
      console.error('Error loading latest selection schedule version number:', latestError)
      return false
    }

    const nextVersion = ((latestRows && latestRows[0]?.version_number) || 0) + 1

    const { error: insertError } = await supabase
      .from('selection_schedule_versions')
      .insert({
        project_id: projectId,
        organization_id: projectData?.organization_id || 'default-org',
        created_by: user.id,
        version_number: nextVersion,
        version_label: versionLabel?.trim() || `Version ${nextVersion}`,
        is_draft: false,
        schedule_data: scheduleData,
      })

    if (insertError) {
      console.error('Error saving selection schedule version:', insertError)
      return false
    }

    return true
  } catch (error) {
    console.error('Error saving selection schedule version:', error)
    return false
  }
}
