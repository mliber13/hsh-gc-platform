import { useCallback, useEffect, useState } from 'react'
import { Bell, Volume2, VolumeX, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import {
  dismissPushPrompt,
  getPushState,
  sendTestPush,
  subscribeToPush,
  unsubscribeFromPush,
  wasPushPromptDismissed,
  type PushState,
} from '@/services/pushService'

type Props = {
  /** Compact control for headers; banner is shown separately when appropriate. */
  variant?: 'banner' | 'button'
  className?: string
}

export function EnableNotificationsControl({ variant = 'button', className }: Props) {
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [bannerHidden, setBannerHidden] = useState(() => wasPushPromptDismissed())

  const refresh = useCallback(async () => {
    try {
      setState(await getPushState())
    } catch {
      setState(null)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const enable = async () => {
    setBusy(true)
    try {
      await subscribeToPush()
      toast.success('Notifications enabled')
      setBannerHidden(true)
      await refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not enable notifications')
    } finally {
      setBusy(false)
    }
  }

  const disable = async () => {
    setBusy(true)
    try {
      await unsubscribeFromPush()
      toast.success('Notifications disabled')
      await refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not disable notifications')
    } finally {
      setBusy(false)
    }
  }

  const test = async () => {
    setBusy(true)
    try {
      const ok = await sendTestPush()
      if (ok) toast.success('Test sent — you should get a notification shortly')
      else toast.error('Could not send test notification')
    } finally {
      setBusy(false)
    }
  }

  if (!state || !state.supported) {
    if (state?.needsHomeScreenInstall && variant === 'banner' && !bannerHidden) {
      return (
        <div
          className={cn(
            'flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm',
            className,
          )}
        >
          <Bell className="mt-0.5 size-4 shrink-0 text-amber-700" />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-medium text-foreground">Enable notifications</p>
            <p className="text-xs text-muted-foreground">
              On iPhone, add this app to your Home Screen first (Share → Add to Home Screen), then
              open it from there and turn on notifications.
            </p>
          </div>
          <button
            type="button"
            className="rounded p-1 text-muted-foreground hover:bg-muted"
            aria-label="Dismiss"
            onClick={() => {
              dismissPushPrompt()
              setBannerHidden(true)
            }}
          >
            <X className="size-4" />
          </button>
        </div>
      )
    }
    return null
  }

  if (variant === 'banner') {
    if (bannerHidden || state.subscribed || state.permission === 'denied') return null
    if (state.needsHomeScreenInstall) {
      return (
        <div
          className={cn(
            'flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm',
            className,
          )}
        >
          <Bell className="mt-0.5 size-4 shrink-0 text-amber-700" />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-medium text-foreground">Enable notifications</p>
            <p className="text-xs text-muted-foreground">
              On iPhone, add this app to your Home Screen first (Share → Add to Home Screen), then
              open it from there and turn on notifications.
            </p>
          </div>
          <button
            type="button"
            className="rounded p-1 text-muted-foreground hover:bg-muted"
            aria-label="Dismiss"
            onClick={() => {
              dismissPushPrompt()
              setBannerHidden(true)
            }}
          >
            <X className="size-4" />
          </button>
        </div>
      )
    }
    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm',
          className,
        )}
      >
        <Bell className="size-4 shrink-0 text-primary" />
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          Get alerts for new messages and schedule changes — even when the app is closed.
        </p>
        <Button type="button" size="sm" className="h-7 shrink-0 text-xs" disabled={busy} onClick={() => void enable()}>
          Enable
        </Button>
        <button
          type="button"
          className="rounded p-1 text-muted-foreground hover:bg-muted"
          aria-label="Don't ask again"
          onClick={() => {
            dismissPushPrompt()
            setBannerHidden(true)
          }}
        >
          <X className="size-4" />
        </button>
      </div>
    )
  }

  // Header button
  if (state.needsHomeScreenInstall) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn('size-8', className)}
        title="Add to Home Screen to enable notifications"
        onClick={() =>
          toast.message('Add to Home Screen', {
            description:
              'On iPhone: tap Share → Add to Home Screen, then open the app from your home screen to enable notifications.',
          })
        }
      >
        <VolumeX className="size-4" />
        <span className="sr-only">Notifications need Home Screen install</span>
      </Button>
    )
  }

  if (state.subscribed) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn('size-8', className)}
            disabled={busy}
            title="Notifications"
          >
            <Volume2 className="size-4 text-primary" />
            <span className="sr-only">Notification options</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => void test()}>Send test notification</DropdownMenuItem>
          <DropdownMenuItem onClick={() => void disable()}>Turn off notifications</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn('size-8', className)}
      disabled={busy || state.permission === 'denied'}
      title={
        state.permission === 'denied'
          ? 'Notifications blocked in browser settings'
          : 'Enable notifications'
      }
      onClick={() => void enable()}
    >
      <VolumeX className="size-4" />
      <span className="sr-only">Enable notifications</span>
    </Button>
  )
}
