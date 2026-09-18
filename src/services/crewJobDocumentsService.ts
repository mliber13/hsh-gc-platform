// Crew-visible job documents (plan + specification) — signed URL on open.

import { supabase, isOnlineMode } from '@/lib/supabase'

const BUCKET = 'project-documents'
const SIGNED_EXPIRY_SECONDS = 3600

export type CrewJobDocumentType = 'plan' | 'specification'

export interface CrewJobDocument {
  id: string
  name: string
  type: CrewJobDocumentType
  storagePath: string | null
}

function storagePathFromRow(row: {
  file_path: string | null
  file_url: string | null
}): string | null {
  if (row.file_path?.trim()) return row.file_path.trim()
  const url = row.file_url ?? ''
  const marker = '/project-documents/'
  const idx = url.indexOf(marker)
  if (idx < 0) return null
  const rest = url.slice(idx + marker.length)
  const path = rest.split('?')[0]?.trim()
  return path || null
}

export async function fetchCrewJobDocuments(projectId: string): Promise<CrewJobDocument[]> {
  if (!isOnlineMode()) return []

  const { data, error } = await supabase
    .from('project_documents')
    .select('id, name, type, file_path, file_url')
    .eq('project_id', projectId)
    .in('type', ['plan', 'specification'])
    .order('name', { ascending: true })

  if (error) {
    throw new Error(error.message || 'Failed to load job documents')
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: ((row.name as string) ?? '').trim() || 'Untitled',
    type: row.type === 'specification' ? 'specification' : 'plan',
    storagePath: storagePathFromRow({
      file_path: (row.file_path as string | null) ?? null,
      file_url: (row.file_url as string | null) ?? null,
    }),
  }))
}

export async function getCrewJobDocumentSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_EXPIRY_SECONDS)
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'Could not open that document')
  }
  return data.signedUrl
}
