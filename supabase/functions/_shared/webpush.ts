/**
 * Shared Web Push helpers for edge functions (send-push, customer-schedule-share, …).
 * Uses @negrel/webpush + VAPID_* secrets (project-wide).
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as webpush from 'jsr:@negrel/webpush@0.5.0'

export type PushPayload = { title: string; body: string; url?: string; tag?: string }

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

function uint8ToB64Url(buf: Uint8Array): string {
  let s = ''
  for (const b of buf) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Convert web-push generate-vapid-keys style keys → JWK for @negrel/webpush. */
export function vapidJwksFromWebPush(
  publicKey: string,
  privateKey: string,
): webpush.ExportedVapidKeys {
  const pub = urlBase64ToUint8Array(publicKey)
  if (pub.length !== 65 || pub[0] !== 0x04) {
    throw new Error('VAPID_PUBLIC_KEY must be an uncompressed P-256 point (65 bytes)')
  }
  const x = uint8ToB64Url(pub.slice(1, 33))
  const y = uint8ToB64Url(pub.slice(33, 65))
  const d = privateKey.replace(/=+$/, '')
  return {
    publicKey: {
      kty: 'EC',
      crv: 'P-256',
      x,
      y,
      ext: true,
      key_ops: ['verify'],
    },
    privateKey: {
      kty: 'EC',
      crv: 'P-256',
      d,
      x,
      y,
      ext: true,
      key_ops: ['sign'],
    },
  }
}

/** Build ApplicationServer from VAPID_* env (or explicit keys). */
export async function createApplicationServer(opts?: {
  publicKey?: string
  privateKey?: string
  subject?: string
}): Promise<webpush.ApplicationServer> {
  const vapidPublic = opts?.publicKey ?? Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivate = opts?.privateKey ?? Deno.env.get('VAPID_PRIVATE_KEY')
  const vapidSubject =
    opts?.subject ?? (Deno.env.get('VAPID_SUBJECT') || 'mailto:mark@hshdrywall.com')
  if (!vapidPublic || !vapidPrivate) {
    throw new Error('VAPID secrets not configured')
  }
  const exported = vapidJwksFromWebPush(vapidPublic, vapidPrivate)
  const vapidKeys = await webpush.importVapidKeys(exported, { extractable: false })
  return await webpush.ApplicationServer.new({
    contactInformation: vapidSubject,
    vapidKeys,
  })
}

/**
 * Operators for a project = owner / office_gc / office_drywall in that project's org.
 * No author exclusion — used when the sender is an external customer.
 */
export async function resolveProjectOperators(
  admin: SupabaseClient,
  projectId: string,
): Promise<string[]> {
  const { data: project, error: projErr } = await admin
    .from('projects')
    .select('organization_id')
    .eq('id', projectId)
    .maybeSingle()
  if (projErr || !project?.organization_id) return []

  const orgId = project.organization_id as string
  const { data: profiles, error: profErr } = await admin
    .from('profiles')
    .select('id, roles')
    .eq('organization_id', orgId)
  if (profErr || !profiles) return []

  const operatorRoles = new Set(['owner', 'office_drywall', 'office_gc'])
  const userIds = new Set<string>()
  for (const p of profiles) {
    const roles = (p.roles as string[] | null) ?? []
    if (roles.some((r) => operatorRoles.has(r))) {
      userIds.add(p.id as string)
    }
  }
  return [...userIds]
}

export async function sendToUsers(
  admin: SupabaseClient,
  appServer: webpush.ApplicationServer,
  userIds: string[],
  payload: PushPayload,
): Promise<{ sent: number; failed: number; pruned: number }> {
  let sent = 0
  let failed = 0
  let pruned = 0
  if (userIds.length === 0) return { sent, failed, pruned }

  const { data: subs, error } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, user_id')
    .in('user_id', userIds)

  if (error || !subs?.length) return { sent, failed, pruned }

  const message = JSON.stringify(payload)

  for (const row of subs) {
    try {
      const subscriber = appServer.subscribe({
        endpoint: row.endpoint as string,
        keys: {
          p256dh: row.p256dh as string,
          auth: row.auth as string,
        },
      })
      await subscriber.pushTextMessage(message, {
        ttl: 60 * 60 * 12,
        urgency: webpush.Urgency.Normal,
      })
      sent++
    } catch (e) {
      if (e instanceof webpush.PushMessageError && e.isGone()) {
        await admin.from('push_subscriptions').delete().eq('id', row.id)
        pruned++
      } else if (
        e instanceof webpush.PushMessageError &&
        (e.response?.status === 404 || e.response?.status === 410)
      ) {
        await admin.from('push_subscriptions').delete().eq('id', row.id)
        pruned++
      } else {
        failed++
        console.warn('push send failed:', e)
      }
    }
  }

  return { sent, failed, pruned }
}

/** Best-effort notify — never throws. */
export async function notifyUsersBestEffort(
  admin: SupabaseClient,
  userIds: string[],
  payload: PushPayload,
): Promise<void> {
  try {
    if (userIds.length === 0) return
    const appServer = await createApplicationServer()
    await sendToUsers(admin, appServer, userIds, payload)
  } catch (e) {
    console.warn('notifyUsersBestEffort failed:', e)
  }
}
