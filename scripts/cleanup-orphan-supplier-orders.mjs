/**
 * Remove duplicate supplier-less order drafts.
 *
 * Dry run by default. `--apply` writes, after saving every deleted order in full to a
 * backup file — these live in projects.metadata.legacy.orders, so there is no row to
 * restore from otherwise.
 *
 * Targets ONLY an order with no supplierId on a project that also has a real order with
 * one. A supplier-less draft on a job with no other order is work in progress — it is
 * meant to sit in the "No supplier" bucket until someone picks a supplier, and is left
 * alone. Fifteen of those exist and none are touched.
 *
 * Pairs arose from "Add order" being pressed twice in a session; the second draft got the
 * supplier, date and send, and the first was abandoned.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

const APPLY = process.argv.includes('--apply')

function readEnv() {
  return Object.fromEntries(
    fs
      .readFileSync('.env', 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.includes('=') && !l.startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=')
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
      }),
  )
}

async function main() {
  const env = readEnv()
  const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const { data: projects, error } = await sb.from('projects').select('id,name,metadata')
  if (error) throw new Error(`load projects: ${error.message}`)

  const targets = []

  for (const p of projects) {
    const orders = p.metadata?.legacy?.orders
    if (!Array.isArray(orders) || orders.length < 2) continue

    const withSupplier = orders.filter((o) => o?.supplierId)
    if (withSupplier.length === 0) continue

    for (const o of orders) {
      if (o?.supplierId) continue
      targets.push({
        projectId: p.id,
        projectName: p.name,
        orderId: o.id,
        items: (o.items ?? []).length,
        status: o.status ?? 'none',
        keptCount: withSupplier.length,
        order: o,
      })
    }
  }

  console.log(`\n=== orphan supplier-less drafts ${APPLY ? '(APPLY)' : '(dry run)'} ===`)
  console.log(`to delete: ${targets.length}`)
  for (const t of targets) {
    console.log(
      `  ${t.projectName.slice(0, 28).padEnd(29)} ${String(t.items).padStart(2)} items  ` +
        `${t.status.padEnd(6)}  (job keeps ${t.keptCount} order${t.keptCount === 1 ? '' : 's'})`,
    )
  }

  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to write.\n')
    return
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join('.', `orphan-orders-backup-${stamp}.json`)
  fs.writeFileSync(backupPath, JSON.stringify(targets, null, 2))
  console.log(`\nFull copies of every order being deleted: ${backupPath}`)

  const byProject = new Map()
  for (const t of targets) {
    if (!byProject.has(t.projectId)) byProject.set(t.projectId, [])
    byProject.get(t.projectId).push(t.orderId)
  }

  let deleted = 0
  for (const [projectId, orderIds] of byProject) {
    // Re-read immediately before writing: metadata is one JSONB blob, so a stale copy
    // would silently revert anything edited since the scan.
    const { data: fresh, error: readError } = await sb
      .from('projects')
      .select('name,metadata')
      .eq('id', projectId)
      .single()
    if (readError) throw new Error(`re-read ${projectId}: ${readError.message}`)

    const orders = fresh.metadata?.legacy?.orders
    if (!Array.isArray(orders)) throw new Error(`${fresh.name}: orders vanished between scan and write`)

    const next = orders.filter((o) => !orderIds.includes(o?.id))
    const removed = orders.length - next.length
    if (removed !== orderIds.length) {
      throw new Error(
        `${fresh.name}: expected to remove ${orderIds.length}, matched ${removed} — not writing`,
      )
    }

    const metadata = {
      ...fresh.metadata,
      legacy: { ...fresh.metadata.legacy, orders: next },
    }
    const { error: writeError } = await sb
      .from('projects')
      .update({ metadata })
      .eq('id', projectId)
    if (writeError) throw new Error(`write ${fresh.name}: ${writeError.message}`)

    deleted += removed
    console.log(`  ${fresh.name}: removed ${removed}, ${next.length} order(s) left`)
  }

  console.log(`\nDeleted ${deleted} orphan drafts.\n`)
}

main().catch((err) => {
  console.error('\nFAILED:', err.message, '\n')
  process.exit(1)
})
