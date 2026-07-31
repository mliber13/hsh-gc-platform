/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'

declare let self: ServiceWorkerGlobalScope

// Preserve offline precache from the previous generateSW setup.
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

self.skipWaiting()
clientsClaim()

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
