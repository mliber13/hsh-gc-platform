import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, ImagePlus, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  deleteFieldPhoto,
  DrywallPhotoError,
  getSignedPhotoUrl,
  listFieldPhotos,
  uploadFieldPhoto,
} from '@/services/drywallPhotosService'
import type { FieldPhotoRef } from '@/types/drywall'

interface FieldPhotosSectionProps {
  projectId: string
  readOnly: boolean
  onPhotosChange: () => void
}

function PhotoThumb({
  photo,
  onDelete,
  onEnlarge,
  readOnly,
}: {
  photo: FieldPhotoRef
  onDelete: () => void
  onEnlarge: (src: string) => void
  readOnly: boolean
}) {
  const [src, setSrc] = useState<string | null>(photo.url || null)
  const [loading, setLoading] = useState(Boolean(photo.storagePath && !photo.url))

  useEffect(() => {
    let cancelled = false
    if (photo.storagePath) {
      setLoading(true)
      void getSignedPhotoUrl(photo.storagePath)
        .then((url) => {
          if (!cancelled) setSrc(url)
        })
        .catch(() => {
          if (!cancelled) setSrc(null)
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    } else {
      setSrc(photo.url || null)
      setLoading(false)
    }
    return () => {
      cancelled = true
    }
  }, [photo.storagePath, photo.url])

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <button
        type="button"
        className="aspect-video w-full bg-muted rounded-md overflow-hidden flex items-center justify-center disabled:cursor-default"
        disabled={!src}
        onClick={() => {
          if (src) onEnlarge(src)
        }}
      >
        {loading ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        ) : src ? (
          <img
            src={src}
            alt={photo.label || 'Field photo'}
            className="max-h-40 w-full object-contain"
          />
        ) : (
          <span className="text-xs text-muted-foreground">Preview unavailable</span>
        )}
      </button>
      <p className="text-sm font-medium truncate">{photo.label || 'Photo'}</p>
      {!readOnly && photo.storagePath && (
        <Button type="button" variant="outline" size="sm" className="w-full" onClick={onDelete}>
          <Trash2 className="h-4 w-4 mr-1" />
          Remove
        </Button>
      )}
    </div>
  )
}

export function FieldPhotosSection({ projectId, readOnly, onPhotosChange }: FieldPhotosSectionProps) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const libraryRef = useRef<HTMLInputElement>(null)
  const [photos, setPhotos] = useState<FieldPhotoRef[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [enlargeSrc, setEnlargeSrc] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const list = await listFieldPhotos(projectId)
      setPhotos(list)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load photos')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length || readOnly) return
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        await uploadFieldPhoto(projectId, file)
      }
      await refresh()
      onPhotosChange()
      toast.success(files.length > 1 ? 'Photos uploaded' : 'Photo uploaded')
    } catch (e) {
      toast.error(e instanceof DrywallPhotoError ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (cameraRef.current) cameraRef.current.value = ''
      if (libraryRef.current) libraryRef.current.value = ''
    }
  }

  const handleDelete = async (photo: FieldPhotoRef) => {
    if (!photo.storagePath || readOnly) return
    if (!window.confirm('Remove this photo?')) return
    try {
      await deleteFieldPhoto(projectId, photo.storagePath)
      await refresh()
      onPhotosChange()
      toast.success('Photo removed')
    } catch (e) {
      toast.error(e instanceof DrywallPhotoError ? e.message : 'Delete failed')
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Camera className="h-5 w-5" />
            Reference photos
          </CardTitle>
          <CardDescription>
            Upload site photos for the order team. Each upload saves immediately.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!readOnly && (
            <div className="space-y-2">
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                disabled={uploading}
                onChange={(e) => void handleUpload(e.target.files)}
              />
              <input
                ref={libraryRef}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                disabled={uploading}
                onChange={(e) => void handleUpload(e.target.files)}
              />
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  className="w-full sm:flex-1"
                  disabled={uploading}
                  onClick={() => cameraRef.current?.click()}
                >
                  <Camera className="mr-2 size-4" />
                  Take photo
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:flex-1"
                  disabled={uploading}
                  onClick={() => libraryRef.current?.click()}
                >
                  <ImagePlus className="mr-2 size-4" />
                  Choose photos
                </Button>
              </div>
              {uploading && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading…
                </p>
              )}
            </div>
          )}

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading photos…</p>
          ) : photos.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              {readOnly ? 'No photos yet.' : 'No photos yet — take or choose a photo above.'}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {photos.map((photo) => (
                <PhotoThumb
                  key={photo.id}
                  photo={photo}
                  readOnly={readOnly}
                  onEnlarge={setEnlargeSrc}
                  onDelete={() => void handleDelete(photo)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(enlargeSrc)} onOpenChange={(open) => !open && setEnlargeSrc(null)}>
        <DialogContent className="max-w-[min(100vw-2rem,48rem)] p-2">
          <DialogHeader className="sr-only">
            <DialogTitle>Photo preview</DialogTitle>
          </DialogHeader>
          {enlargeSrc ? (
            <img
              src={enlargeSrc}
              alt="Field photo enlarged"
              className="max-h-[80vh] w-full rounded-md object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
