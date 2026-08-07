import { useEffect, useRef, useState } from 'react'
import { Camera, SwitchCamera } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCapture: (file: File) => void
}

/**
 * In-app camera (getUserMedia) — reliable on desktop/Surface where the file-input
 * `capture` attribute is ignored. Live preview, capture to JPEG, switch between cameras.
 */
export function CameraCaptureDialog({ open, onOpenChange, onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [deviceIndex, setDeviceIndex] = useState(0)

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  const startStream = async (constraints: MediaStreamConstraints): Promise<MediaStream> => {
    stopStream()
    const stream = await navigator.mediaDevices.getUserMedia(constraints)
    streamRef.current = stream
    if (videoRef.current) {
      videoRef.current.srcObject = stream
      void videoRef.current.play().catch(() => {})
    }
    setReady(true)
    return stream
  }

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

    void (async () => {
      try {
        const stream = await startStream({ video: { facingMode: 'environment' }, audio: false })
        if (cancelled) {
          stopStream()
          return
        }
        const all = await media.enumerateDevices()
        const cams = all.filter((d) => d.kind === 'videoinput')
        const activeId = stream.getVideoTracks()[0]?.getSettings().deviceId
        const idx = cams.findIndex((c) => c.deviceId === activeId)
        if (!cancelled) {
          setDevices(cams)
          setDeviceIndex(idx >= 0 ? idx : 0)
        }
      } catch {
        if (!cancelled) setError('Could not access the camera. Check that camera access is allowed.')
      }
    })()

    return () => {
      cancelled = true
      stopStream()
    }
  }, [open])

  const switchCamera = async () => {
    if (devices.length < 2) return
    const next = (deviceIndex + 1) % devices.length
    setDeviceIndex(next)
    setReady(false)
    try {
      await startStream({ video: { deviceId: { exact: devices[next].deviceId } }, audio: false })
    } catch {
      setError('Could not switch camera.')
    }
  }

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
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
        const file = new File([blob], `photo-${stamp}.jpg`, { type: 'image/jpeg' })
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
            <div className="relative overflow-hidden rounded-lg bg-black">
              <video
                ref={videoRef}
                playsInline
                muted
                className="mx-auto max-h-[60vh] w-full object-contain"
              />
              {devices.length > 1 ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="absolute right-2 top-2 size-9 rounded-full"
                  aria-label="Switch camera"
                  onClick={() => void switchCamera()}
                >
                  <SwitchCamera className="size-4" />
                </Button>
              ) : null}
            </div>
            <div className="flex items-center justify-center gap-2">
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
