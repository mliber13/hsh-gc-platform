import { isOnlineMode, supabase } from '@/lib/supabase'
import { requireUserOrgId } from '@/services/userService'

const DISMISS_KEY = 'hsh.push.dismissPrompt'

export type PushPermissionState = NotificationPermission | 'unsupported'

export type PushState = {
  supported: boolean
  permission: PushPermissionState
  subscribed: boolean
  /** iOS Safari that is not installed as a Home Screen PWA. */
  needsHomeScreenInstall: boolean
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/** True when running as an installed PWA (standalone / iOS home-screen). */
export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false
  const mq = window.matchMedia('(display-mode: standalone)').matches
  const iosStandalone =
    'standalone' in navigator &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  return mq || iosStandalone
}

export function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const webkit = /WebKit/.test(ua)
  const chromeOrCriOS = /CriOS|FxiOS|EdgiOS|Chrome/.test(ua)
  return iOS && webkit && !chromeOrCriOS
}

export function wasPushPromptDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

export function dismissPushPrompt(): void {
  try {
    localStorage.setItem(DISMISS_KEY, '1')
  } catch {
    /* ignore */
  }
}

export async function getPushState(): Promise<PushState> {
  const supported = isPushSupported()
  const needsHomeScreenInstall = isIosSafari() && !isStandalonePwa()
  if (!supported) {
    return {
      supported: false,
      permission: 'unsupported',
      subscribed: false,
      needsHomeScreenInstall,
    }
  }
  const permission = Notification.permission
  let subscribed = false
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    subscribed = Boolean(sub)
  } catch {
    subscribed = false
  }
  return { supported: true, permission, subscribed, needsHomeScreenInstall }
}

export async function subscribeToPush(): Promise<PushSubscription> {
  if (!isPushSupported()) throw new Error('Push notifications are not supported on this browser.')
  if (isIosSafari() && !isStandalonePwa()) {
    throw new Error('Add this app to your Home Screen to enable notifications.')
  }

  const vapidPublic = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined
  if (!vapidPublic?.trim()) {
    throw new Error('Push is not configured (missing VITE_VAPID_PUBLIC_KEY).')
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted.')
  }

  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublic.trim()) as BufferSource,
  })

  if (isOnlineMode()) {
    const json = sub.toJSON()
    const endpoint = json.endpoint
    const p256dh = json.keys?.p256dh
    const auth = json.keys?.auth
    if (!endpoint || !p256dh || !auth) {
      throw new Error('Push subscription keys missing.')
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('Not signed in.')

    const organizationId = await requireUserOrgId()

    // Delete any prior row for this endpoint (unique), then insert.
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)

    const { error } = await supabase.from('push_subscriptions').insert({
      user_id: user.id,
      organization_id: organizationId,
      endpoint,
      p256dh,
      auth,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 500) : null,
      last_seen_at: new Date().toISOString(),
    })
    if (error) throw new Error(error.message || 'Failed to save push subscription')
  }

  return sub
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return

  const endpoint = sub.endpoint
  await sub.unsubscribe()

  if (isOnlineMode() && endpoint) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  }
}

export type NotifyCommsPayload = {
  kind: 'comms'
  projectId: string
  authorUserId: string
  projectName?: string
  authorName?: string
  preview?: string
}

export type NotifySchedulePayload = {
  kind: 'schedule'
  projectId: string
  authorUserId: string
  assignedPersonIds: string[]
  itemName?: string
  newDate?: string
  /** Manual heads-up message — overrides the default "updated" body when set. */
  message?: string
}

export type PushSendSummary = {
  /** Assigned people who have an app account (matched, before subscription lookup). */
  recipients: number
  /** Push messages actually accepted by the browser push service. */
  sent: number
  /** Subscriptions that errored on send (e.g. VAPID/config mismatch). */
  failed: number
  /** Dead subscriptions pruned (404/410) during this send. */
  pruned: number
}

/** Best-effort notify — never throws. Returns the full send summary or null on transport error. */
export async function requestPushNotify(
  payload: NotifyCommsPayload | NotifySchedulePayload,
): Promise<PushSendSummary | null> {
  if (!isOnlineMode()) return null
  try {
    const { data, error } = await supabase.functions.invoke('send-push', { body: payload })
    if (error) {
      console.warn('send-push:', error.message)
      return null
    }
    const d =
      (data as { recipients?: number; sent?: number; failed?: number; pruned?: number } | null) ??
      {}
    return {
      recipients: d.recipients ?? 0,
      sent: d.sent ?? 0,
      failed: d.failed ?? 0,
      pruned: d.pruned ?? 0,
    }
  } catch (e) {
    console.warn('send-push failed:', e)
    return null
  }
}

/** Fire a test push to the caller's own devices. Returns true on success. */
export async function sendTestPush(message?: string): Promise<boolean> {
  if (!isOnlineMode()) return false
  try {
    const { error } = await supabase.functions.invoke('send-push', {
      body: { kind: 'test', message },
    })
    if (error) {
      console.warn('send-push test:', error.message)
      return false
    }
    return true
  } catch (e) {
    console.warn('send-push test failed:', e)
    return false
  }
}
