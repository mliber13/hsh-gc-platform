/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'

declare let self: ServiceWorkerGlobalScope

// Preserve offline precache from the previous generateSW setup.
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

self.skipWaiting()
clientsClaim()

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

// When the browser rotates a push subscription, the old one stops working and
// the stored row goes stale. Re-subscribe immediately so pushes keep flowing;
// the fresh subscription is synced to the DB on the next app open (resyncPushSubscription).
self.addEventListener('pushsubscriptionchange', ((event: ExtendableEvent) => {
  if (!VAPID_PUBLIC_KEY) return
  event.waitUntil(
    self.registration.pushManager
      .subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      })
      .then(() => undefined)
      .catch(() => undefined),
  )
}) as EventListener)

self.addEventListener('push', (event) => {
  let data: { title?: string; body?: string; tag?: string; url?: string } = {}
  try {
    data = event.data?.json() ?? {}
  } catch {
    data = { body: event.data?.text() }
  }
  const title = data.title ?? 'HSH'
  // `vibrate` / `renotify` aren't in the base NotificationOptions TS type but are
  // valid on Android Chrome — extend the type so tsc is happy.
  const options: NotificationOptions & { vibrate?: number[]; renotify?: boolean } = {
    body: data.body,
    icon: '/pwa-192x192.png',
    // Monochrome bell silhouette — the small status-bar icon on Android.
    badge: '/notification-badge.png',
    tag: data.tag,
    silent: false,
    vibrate: [250, 120, 250, 120, 250],
    data: { url: data.url ?? '/' },
  }
  // renotify requires a tag; re-alert (buzz again) on repeat notifications.
  if (data.tag) options.renotify = true
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string } | undefined)?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const hit = wins.find((w) => 'focus' in w && w.url.includes(url))
      if (hit && 'focus' in hit) return (hit as WindowClient).focus()
      return self.clients.openWindow(url)
    }),
  )
})
