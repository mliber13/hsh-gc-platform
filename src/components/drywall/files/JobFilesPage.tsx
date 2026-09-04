import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { Camera, ImageOff, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ProjectDocuments } from '@/components/ProjectDocuments'
import { cn } from '@/lib/utils'
import {
  getSignedPhotoUrl,
  listJobPhotos,
  type JobPhoto,
} from '@/services/drywallPhotosService'

type ShellContext = { projectId: string; projectName?: string }

function formatWhen(at?: string): string {
  if (!at) return 'Date unknown'
  try {
    return format(parseISO(at), 'MMM d, yyyy · h:mm a')
  } catch {
    return at
  }
}

function JobPhotoTile({ photo }: { photo: JobPhoto }) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    void getSignedPhotoUrl(photo.storagePath)
      .then((signed) => {
        if (!cancelled) setUrl(signed)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [photo.storagePath])

  return (
    <figure className="overflow-hidden rounded-lg border bg-card">
      <div className="flex aspect-[4/3] items-center justify-center bg-muted/40">
        {failed ? (
          <ImageOff className="size-6 text-muted-foreground" />
        ) : url ? (
          <a href={url} target="_blank" rel="noreferrer" className="block size-full">
            <img
              src={url}
              alt={photo.label || 'Job photo'}
              loading="lazy"
              className="size-full object-cover transition-transform hover:scale-[1.02]"
            />
          </a>
        ) : (
          <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
        )}
      </div>
      <figcaption className="space-y-1 p-2.5 text-xs">
        <p className="font-medium text-foreground">
          {photo.uploadedByName ?? 'Unknown uploader'}
        </p>
        <p className="text-muted-foreground">{formatWhen(photo.uploadedAt)}</p>
        <span
          className={cn(
            'inline-block rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
            photo.source === 'field'
              ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300'
              : 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
          )}
        >
          {photo.sourceLabel}
        </span>
      </figcaption>
    </figure>
  )
}

export function JobFilesPage() {
  const { projectId, projectName } = useOutletContext<ShellContext>()
  const [photos, setPhotos] = useState<JobPhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [sourceFilter, setSourceFilter] = useState<'all' | 'field' | 'schedule'>('all')
  const [personFilter, setPersonFilter] = useState<string>('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setPhotos(await listJobPhotos(projectId))
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load photos')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  const uploaders = useMemo(() => {
    const names = new Map<string, string>()
    for (const p of photos) {
      const key = p.uploadedByUserId ?? '__unknown__'
      names.set(key, p.uploadedByName ?? 'Unknown uploader')
    }
    return [...names.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [photos])

  const visible = useMemo(
    () =>
      photos
        .filter((p) => sourceFilter === 'all' || p.source === sourceFilter)
        .filter(
          (p) =>
            personFilter === 'all' ||
            (p.uploadedByUserId ?? '__unknown__') === personFilter,
        ),
    [photos, sourceFilter, personFilter],
  )

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Camera className="size-5 text-primary" />
              Job photos
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Every photo on this job — from field measurement and from schedule
              tasks — with who took it and when.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8 shrink-0"
            onClick={() => void load()}
            aria-label="Refresh photos"
          >
            <RefreshCw className="size-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {photos.length > 0 ? (
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Source</span>
                <select
                  aria-label="Filter by source"
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  value={sourceFilter}
                  onChange={(e) =>
                    setSourceFilter(e.target.value as 'all' | 'field' | 'schedule')
                  }
                >
                  <option value="all">All</option>
                  <option value="field">Field measurement</option>
                  <option value="schedule">Schedule tasks</option>
                </select>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Uploaded by</span>
                <select
                  aria-label="Filter by uploader"
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  value={personFilter}
                  onChange={(e) => setPersonFilter(e.target.value)}
                >
                  <option value="all">Anyone</option>
                  {uploaders.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <p className="ml-auto self-center text-xs text-muted-foreground">
                {visible.length} of {photos.length}
              </p>
            </div>
          ) : null}

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading photos…</p>
          ) : photos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No photos on this job yet. Crew photos taken on a schedule task, and
              anything added during field measurement, both show up here.
            </p>
          ) : visible.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No photos match those filters.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {visible.map((photo) => (
                <JobPhotoTile key={`${photo.source}-${photo.id}`} photo={photo} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ProjectDocuments projectId={projectId} projectName={projectName} />
    </div>
  )
}
