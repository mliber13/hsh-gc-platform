import { useEffect, useRef, useState } from 'react'
import { Camera } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCapture: (file: File) => void
}

/**
 * In-app camera (getUserMedia) — reliable on desktop/Surface where the file-input
 * `capture` attribute is ignored. Live preview + capture to a JPEG File.
 */
export function CameraCaptureDialog({ open, onOpenChange, onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setError(null)
    setReady(false)

    const media = navigator.mediaDevices
    if (!media?.getUserMedia) {
      setError('This device or browser does not support in-app camera capture.')
      return
    }

    media
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          void videoRef.current.play().catch(() => {})
        }
        setReady(true)
      })
      .catch(() => {
        if (!cancelled) setError('Could not access the camera. Check that camera access is allowed.')
      })

    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [open])

  const capture = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        const file = new File([blob], `photo-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.jpg`, {
          type: 'image/jpeg',
        })
        onCapture(file)
        onOpenChange(false)
      },
      'image/jpeg',
      0.9,
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Take photo</DialogTitle>
        </DialogHeader>
        {error ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{error}</p>
        ) : (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-lg bg-black">
              <video
                ref={videoRef}
                playsInline
                muted
                className="mx-auto max-h-[60vh] w-full object-contain"
              />
            </div>
            <div className="flex justify-center gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={capture} disabled={!ready}>
                <Camera className="mr-2 size-4" />
                Capture
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
