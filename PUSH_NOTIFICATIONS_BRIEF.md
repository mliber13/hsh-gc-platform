# Push Notifications — implementation brief (native web-push)

## Goal
Web push notifications so users are alerted **even when the app is closed** — starting with
**new comms messages** and **schedule changes** (item moved / newly assigned). Native web-push
via the existing PWA + a Supabase edge function (no third-party). Operators and crew both.

Locked decisions (Mark): native web-push (not OneSignal); first scope = **comms + schedule changes**.

## The iOS reality (state it in the UI)
Web push on iPhone (iOS 16.4+) works **only when the app is installed to the Home Screen** (PWA),
not in plain Safari. Android/desktop Chrome work in-browser after a permission prompt. So the enable
flow must detect iOS-Safari-not-installed and tell the user to "Add to Home Screen" first.

## Build order (ship foundation first — later parts can land after)
1. VAPID keys + `push_subscriptions` table + RLS.
2. Service worker (injectManifest) with push/notificationclick handlers.
3. Client subscribe/permission flow + "Enable notifications" UI (crew + operator) + iOS guidance.
4. `send-push` edge function (+ recipient resolution).
5. Wire **comms** notifications.
6. Wire **schedule-change** notifications.

---

## 1. VAPID keys (manual step, once)
Generate a keypair: `npx web-push generate-vapid-keys`.
- Client env: `VITE_VAPID_PUBLIC_KEY` (public key).
- Edge function secrets: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:mark@hshdrywall.com`.
Do not commit private key.

## 2. Migration — `push_subscriptions`
- Columns: `id uuid PK`, `user_id uuid NOT NULL` (auth uid), `organization_id uuid NOT NULL`,
  `endpoint text NOT NULL UNIQUE`, `p256dh text NOT NULL`, `auth text NOT NULL`,
  `user_agent text`, `created_at timestamptz default now()`, `last_seen_at timestamptz default now()`.
- Index on `user_id`, `organization_id`.
- RLS: users manage their **own** rows — `USING/WITH CHECK (user_id = auth.uid())` for
  SELECT/INSERT/DELETE. The edge function reads all via the **service role** (bypasses RLS) to send.
- `GRANT SELECT, INSERT, DELETE TO authenticated`; no UPDATE needed (delete + re-insert on change).

## 3. Service worker — switch VitePWA to injectManifest
- In `vite.config.ts` VitePWA options: add `strategies: 'injectManifest'`, `srcDir: 'src'`,
  `filename: 'sw.ts'`. Keep the existing `manifest`, `registerType: 'autoUpdate'`, icons.
- New `src/sw.ts`:
  - `import { precacheAndRoute } from 'workbox-precaching'` → `precacheAndRoute(self.__WB_MANIFEST)`
    (preserves current offline caching — do NOT regress it).
  - `self.addEventListener('push', (e) => { const d = e.data?.json() ?? {}; e.waitUntil(
    self.registration.showNotification(d.title ?? 'HSH', { body: d.body, icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png', tag: d.tag, data: { url: d.url } })) })`
  - `self.addEventListener('notificationclick', (e) => { e.notification.close(); const url =
    e.notification.data?.url || '/'; e.waitUntil(clients.matchAll({type:'window'}).then(wins => {
    const hit = wins.find(w => w.url.includes(url)); return hit ? hit.focus() : clients.openWindow(url) })) })`
  - Keep `skipWaiting`/`clientsClaim` behavior.
- Verify the PWA still installs and offline caching still works after the switch (this is the riskiest config change).

## 4. Client — subscription + permission (`src/services/pushService.ts` + a small hook/UI)
- `isPushSupported()`: `'serviceWorker' in navigator && 'PushManager' in window`.
- `getPushState()`: permission + whether a subscription exists.
- `subscribeToPush()`: `Notification.requestPermission()`; if granted,
  `reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VITE_VAPID_PUBLIC_KEY) })`;
  upsert `{ endpoint, p256dh, auth }` into `push_subscriptions` (keys from `sub.toJSON().keys`).
- `unsubscribeFromPush()`: `sub.unsubscribe()` + delete the row by endpoint.
- **UI**: an "Enable notifications" control for BOTH surfaces —
  - Crew: in `CrewShell` (e.g. a one-time banner + a toggle in a crew settings/profile spot).
  - Operator: in `AppHeader` near the bell, or a settings entry.
  - iOS-Safari-not-installed → show "Add this app to your Home Screen to enable notifications"
    with brief steps instead of the enable button.
  - Persist "don't ask again" so the prompt isn't nagging.

## 5. Edge function — `supabase/functions/send-push/index.ts`
- Input: `{ userIds: string[], payload: { title, body, url?, tag? } }`.
- Auth: callable only with a valid Supabase JWT (verify caller) OR a shared secret header from other
  edge functions; use the **service role** client internally to read `push_subscriptions`.
- For each userId: load their subscriptions; send via web-push with the VAPID keys. On `404`/`410`
  response, **delete that subscription** (expired). Swallow individual failures; return a summary.
- **Library risk (validate first):** use a Deno-compatible web-push (e.g. `npm:web-push` via the
  supabase edge runtime, or a Deno webpush module). VAPID signing must work in the edge runtime —
  spike this in a tiny test before building the rest. If `npm:web-push` crypto fails under Deno, use
  a Deno-native webpush lib.

### Recipient resolution (a shared helper, service-role)
Given a project or a set of assigned person-ids, resolve to `user_ids`:
- **Comms recipients** for a project = operators in the org (`profiles` where role in owner/office_drywall/office_gc)
  ∪ field foremen ∪ crew whose linked person-id ∈ any of that project's `schedule_items.assigned_persons`
  — **minus the author**.
- **Schedule recipients** = the user accounts linked to the changed items' `assigned_persons`
  (`profiles.linked_employee_id/linked_contractor_id`) — minus the author.
Put this in the edge function (or a second `notify` function) so callers just pass project/persons + author.

## 6. Wiring the triggers (MVP = client-invoked, best-effort)
Keep it simple: the client that causes the event calls the notify function after the write succeeds.
(Note the tradeoff: if the client dies between write and notify, that one push is missed. A DB
trigger + `pg_net` is the robust future upgrade — out of scope for v1.)

- **Comms:** after a successful comms post (crew RPC path AND operator `addCommsLogEntry` path), call
  `send-push` with `{ projectId, authorUserId }` → edge resolves comms recipients → sends
  `{ title: "<Project> — new message", body: "<author>: <preview>", url: "/…/<project>", tag: "comms-<project>" }`.
  Use `tag` per project so multiple messages collapse.
- **Schedule changes:** after `foreman_apply_schedule_changes` (foreman sheet) and the operator
  schedule save, call notify with the affected `assigned_persons` + author → sends
  `{ title: "Schedule updated", body: "<item> moved to <date>", url: "/crew/projects/<project>", tag: "sched-<item>" }`.
  For a cascade batch, send ONE push per affected person (dedupe), not per shifted item.

## 7. Verification
- `npx tsc --noEmit` clean; tests green. **PWA still installs and works offline** after the SW switch.
- Subscribe on Android Chrome (or desktop) → row in `push_subscriptions`. Post a comms message as
  another user → device gets a push; clicking it opens the project. Move a schedule item →
  assigned crew get a push.
- Expired-subscription cleanup: a 410 deletes the row.
- iOS: in installed PWA, enable works; in Safari-not-installed, the "Add to Home Screen" guidance shows.
- RLS: a user can only see/delete their own `push_subscriptions`.

## 8. Notes / future
- Robustness: move triggers to DB-trigger + `pg_net` so pushes don't depend on the client.
- Preferences: per-user toggles (comms vs schedule) later; v1 sends both to everyone who enabled.
- This lets the in-app poll stay as the fallback; push is the "app closed" path.
