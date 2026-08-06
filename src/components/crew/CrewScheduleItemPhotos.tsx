import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, ImagePlus, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  deleteScheduleItemPhoto,
  getSignedPhotoUrl,
  listScheduleItemPhotos,
  uploadScheduleItemPhoto,
  type ScheduleItemPhotoRef,
} from '@/services/drywallPhotosService'

type PhotoWithUrl = ScheduleItemPhotoRef & { url: string | null }

type Props = {
  projectId: string
  itemId: string
  readOnly?: boolean
}

/** Per-schedule-item progress photos — add (camera/library), view, remove. */
export function CrewScheduleItemPhotos({ projectId, itemId, readOnly = false }: Props) {
  const [photos, setPhotos] = useState<PhotoWithUrl[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const cameraRef = useRef<HTMLInputElement>(null)
  const libraryRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const refs = await listScheduleItemPhotos(itemId)
      const withUrls = await Promise.all(
        refs.map(async (ref) => {
          let url: string | null = null
          try {
            url = await getSignedPhotoUrl(ref.storagePath)
          } catch {
            url = null
          }
          return { ...ref, url }
        }),
      )
      setPhotos(withUrls)
    } catch {
      setPhotos([])
    } finally {
      setLoading(false)
    }
  }, [itemId])

  useEffect(() => {
    void load()
  }, [load])

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        await uploadScheduleItemPhoto(projectId, itemId, file)
      }
      toast.success(files.length === 1 ? 'Photo added' : `${files.length} photos added`)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not upload photo')
    } finally {
      setUploading(false)
      if (cameraRef.current) cameraRef.current.value = ''
      if (libraryRef.current) libraryRef.current.value = ''
    }
  }

  const handleDelete = async (storagePath: string) => {
    if (!window.confirm('Remove this photo?')) return
    try {
      await deleteScheduleItemPhoto(itemId, storagePath)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not remove photo')
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          Photos{photos.length > 0 ? ` (${photos.length})` : ''}
        </p>
        {!readOnly ? (
          <div className="flex flex-wrap items-center gap-2">
            {/* Two explicit inputs (overlaid on their buttons) — a single input can
                only do camera OR library per device, so give both. */}
            <div className="relative">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="pointer-events-none h-7 gap-1 text-xs"
                tabIndex={-1}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Camera className="size-3.5" />
                )}
                Take
              </Button>
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                disabled={uploading}
                aria-label="Take photo"
                className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
                onChange={(e) => void handleFiles(e.target.files)}
              />
            </div>
            <div className="relative">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="pointer-events-none h-7 gap-1 text-xs"
                tabIndex={-1}
                disabled={uploading}
              >
                <ImagePlus className="size-3.5" />
                Library
              </Button>
              <input
                ref={libraryRef}
                type="file"
                accept="image/*,image/heic,image/heif,.heic,.heif"
                multiple
                disabled={uploading}
                aria-label="Choose from library"
                className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
                onChange={(e) => void handleFiles(e.target.files)}
              />
            </div>
          </div>
        ) : null}
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading photos…</p>
      ) : photos.length === 0 ? (
        <p className="text-xs text-muted-foreground">No photos yet.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className="relative aspect-square overflow-hidden rounded-md border bg-muted"
            >
              {photo.url ? (
                <button
                  type="button"
                  className="block h-full w-full"
                  onClick={() => window.open(photo.url!, '_blank', 'noopener')}
                >
                  <img
                    src={photo.url}
                    alt="Job photo"
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </button>
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                  Unavailable
                </div>
              )}
              {!readOnly ? (
                <button
                  type="button"
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
                  aria-label="Remove photo"
                  onClick={() => void handleDelete(photo.storagePath)}
                >
                  <X className="size-3" />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
