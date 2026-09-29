/**
 * Spike: VAPID sign + encrypt under Deno (Supabase-edge-like).
 * Prefer fetch-based libs (negrel / pushforge) over npm:web-push (Node https).
 *
 * Run: npx deno run -A --config deno.json spike_webpush.ts
 */

function b64url(buf: Uint8Array): string {
  let s = ''
  for (const b of buf) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function fakeSubscriptionKeys() {
  const uaKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  )
  const rawPub = new Uint8Array(await crypto.subtle.exportKey('raw', uaKeyPair.publicKey))
  const authSecret = crypto.getRandomValues(new Uint8Array(16))
  return { p256dh: b64url(rawPub), auth: b64url(authSecret) }
}

async function spikeNpmWebPush() {
  console.log('\n=== Spike A: npm:web-push (Node https — may fail on Deno Deploy) ===')
  try {
    const webpush = await import('web-push')
    const keys = webpush.generateVAPIDKeys()
    webpush.setVapidDetails('mailto:mark@hshdrywall.com', keys.publicKey, keys.privateKey)
    const subKeys = await fakeSubscriptionKeys()
    try {
      await webpush.sendNotification(
        { endpoint: 'https://fcm.googleapis.com/fcm/send/spike-fake', keys: subKeys },
        JSON.stringify({ title: 'spike' }),
      )
      console.log('RESULT: sendNotification succeeded')
      return { ok: true, note: 'full send ok' }
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string }
      if (typeof err?.statusCode === 'number') {
        console.log('RESULT: OK — crypto+HTTP worked; FCM status', err.statusCode)
        return { ok: true, note: `FCM ${err.statusCode} after Node https` }
      }
      console.log('RESULT: FAILED —', err?.message ?? e)
      return { ok: false, note: String(err?.message ?? e) }
    }
  } catch (e) {
    console.log('RESULT: FAILED import/setup —', e instanceof Error ? e.message : e)
    return { ok: false, note: String(e) }
  }
}

async function spikeNegrel() {
  console.log('\n=== Spike B: jsr:@negrel/webpush (fetch + Web Crypto) ===')
  try {
    const webpush = await import('@negrel/webpush')
    const vapidKeys = await webpush.generateVapidKeys({ extractable: true })
    const exported = await webpush.exportVapidKeys(vapidKeys)
    console.log('exportVapidKeys ok', Boolean(exported.publicKey && exported.privateKey))
    const imported = await webpush.importVapidKeys(exported, { extractable: false })
    const appServer = await webpush.ApplicationServer.new({
      contactInformation: 'mailto:mark@hshdrywall.com',
      vapidKeys: imported,
    })
    const publicKey = await webpush.exportApplicationServerKey(imported)
    console.log('public application key (url-b64) length:', publicKey.length)

    const subKeys = await fakeSubscriptionKeys()
    const subscriber = appServer.subscribe({
      endpoint: 'https://fcm.googleapis.com/fcm/send/spike-fake',
      keys: subKeys,
    })
    try {
      await subscriber.pushTextMessage(JSON.stringify({ title: 'spike', body: 'hello' }), {
        ttl: 60,
        urgency: webpush.Urgency.Normal,
      })
      console.log('RESULT: pushTextMessage succeeded')
      return { ok: true, note: 'delivered' }
    } catch (e: unknown) {
      if (e instanceof webpush.PushMessageError) {
        const gone = typeof e.isGone === 'function' ? e.isGone() : false
        console.log(
          'RESULT: OK — signed+encrypted via fetch; status',
          e.response?.status,
          'gone=',
          gone,
        )
        return { ok: true, note: `fetch HTTP ${e.response?.status}` }
      }
      const msg = e instanceof Error ? e.message : String(e)
      console.log('RESULT: FAILED —', msg.slice(0, 400))
      return { ok: false, note: msg }
    }
  } catch (e) {
    console.log('RESULT: FAILED —', e instanceof Error ? e.message : e)
    return { ok: false, note: String(e) }
  }
}

async function spikePushforge() {
  console.log('\n=== Spike C: npm:@pushforge/builder (fetch + Web Crypto) ===')
  try {
    const { buildPushHTTPRequest } = await import('@pushforge/builder')
    const pair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify'],
    )
    const privateJWK = await crypto.subtle.exportKey('jwk', pair.privateKey)
    const publicJWK = await crypto.subtle.exportKey('jwk', pair.publicKey)
    const subKeys = await fakeSubscriptionKeys()
    const built = await buildPushHTTPRequest({
      privateJWK,
      publicJWK,
      subscription: {
        endpoint: 'https://fcm.googleapis.com/fcm/send/spike-fake',
        keys: subKeys,
      },
      message: {
        payload: { title: 'spike', body: 'hello' },
        adminContact: 'mailto:mark@hshdrywall.com',
      },
    })
    console.log('buildPushHTTPRequest ok', {
      endpoint: Boolean(built.endpoint),
      headers: Boolean(built.headers),
      body: Boolean(built.body),
    })
    const res = await fetch(built.endpoint, {
      method: 'POST',
      headers: built.headers,
      body: built.body,
    })
    console.log('RESULT: OK — FCM status', res.status)
    return { ok: true, note: `fetch HTTP ${res.status}` }
  } catch (e) {
    console.log('RESULT: FAILED —', e instanceof Error ? e.message : e)
    return { ok: false, note: String(e) }
  }
}

const a = await spikeNpmWebPush()
const b = await spikeNegrel()
const c = await spikePushforge()

console.log('\n=== SUMMARY ===')
console.log('npm:web-push:', a.ok ? `PASS (${a.note})` : `FAIL (${a.note})`)
console.log('@negrel/webpush:', b.ok ? `PASS (${b.note})` : `FAIL (${b.note})`)
console.log('@pushforge/builder:', c.ok ? `PASS (${c.note})` : `FAIL (${c.note})`)
const rec = b.ok
  ? 'use jsr:@negrel/webpush (Deno-native, fetch)'
  : c.ok
    ? 'use npm:@pushforge/builder (fetch)'
    : a.ok
      ? 'npm:web-push works locally but prefer fetch-based for Supabase edge'
      : 'NO working lib'
console.log('Recommendation:', rec)
