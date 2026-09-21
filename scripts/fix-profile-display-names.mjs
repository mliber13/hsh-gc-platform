#!/usr/bin/env node
/**
 * Profiles born with their email address as their display name.
 *
 * `handle_new_user` sets full_name = COALESCE(raw_user_meta_data->>'full_name', email),
 * and crew signup passes no name — so every crew account carries its own email as its
 * full_name. Everything that renders `full_name || email` then shows the email: the
 * schedule activity feed, comms authorship, the contact directory, the /crew greeting.
 *
 * This resolves each such account to its org_team roster name (via linked_employee_id /
 * linked_contractor_id) and repairs the two places the name was already denormalised
 * into stored rows.
 *
 * Office accounts have no roster entry — name them in OFFICE_NAMES below or they are
 * reported and skipped.
 *
 * Dry run by default. `--apply` writes, after saving a backup of every row it touches.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

// Accounts with no org_team roster entry. Keyed by email.
const OFFICE_NAMES = {
  'kristen@hshdrywall.com': 'Kristen Carcelli',
  'erik@hshdrywall.com': 'Erik Liber',
  'tate@hshdrywall.com': 'Tate Wallen',
  'tess@kibbeconsulting.com': 'Tess Emerson',
}

const APPLY = process.argv.includes('--apply')

const env = Object.fromEntries(
  fs
    .readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)

const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

/** A name that is really an email, or no name at all. */
const isPlaceholderName = (value) => {
  const trimmed = String(value ?? '').trim()
  return trimmed === '' || trimmed.includes('@')
}

async function fetchAll(table, columns) {
  const rows = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await sb.from(table).select(columns).range(from, from + pageSize - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...data)
    if (data.length < pageSize) return rows
  }
}

async function main() {
  const profiles = await fetchAll(
    'profiles',
    'id, email, full_name, roles, organization_id, linked_employee_id, linked_contractor_id',
  )
  const teams = await fetchAll('org_team', 'organization_id, payload')

  const roster = new Map()
  for (const team of teams) {
    for (const key of ['employees', 'contractors1099']) {
      for (const member of team.payload?.[key] ?? []) {
        if (member?.id && member?.name) {
          roster.set(`${team.organization_id}:${member.id}`, String(member.name).trim())
        }
      }
    }
  }

  const resolved = []
  const unresolved = []

  for (const profile of profiles) {
    if (!isPlaceholderName(profile.full_name)) continue

    const link = profile.linked_employee_id?.trim() || profile.linked_contractor_id?.trim()
    const name =
      (link ? roster.get(`${profile.organization_id}:${link}`) : undefined) ??
      OFFICE_NAMES[profile.email]?.trim()

    if (name) resolved.push({ profile, name })
    else unresolved.push(profile)
  }

  console.log(`\nProfiles: ${profiles.length} total, ${resolved.length + unresolved.length} named by their email\n`)
  for (const { profile, name } of resolved) {
    console.log(`  ${profile.email.padEnd(32)} -> ${name}`)
  }
  if (unresolved.length) {
    console.log(`\n  Not nameable (no roster entry, not in OFFICE_NAMES):`)
    for (const profile of unresolved) console.log(`    ${profile.email}`)
  }

  const nameByUid = new Map(resolved.map(({ profile, name }) => [profile.id, name]))

  // Two tables denormalised the display name at write time, so fixing the profile
  // does not repair what is already stored.
  const changes = (await fetchAll('schedule_item_changes', 'id, changed_by, changed_by_name')).filter(
    (row) => row.changed_by && nameByUid.has(row.changed_by) && isPlaceholderName(row.changed_by_name),
  )
  const comms = (await fetchAll('project_comms', 'id, author_user_id, author_name')).filter(
    (row) => row.author_user_id && nameByUid.has(row.author_user_id) && isPlaceholderName(row.author_name),
  )

  console.log(`\nStored rows carrying the placeholder name:`)
  console.log(`  schedule_item_changes.changed_by_name  ${changes.length}`)
  console.log(`  project_comms.author_name              ${comms.length}`)

  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to write.\n')
    return
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join('scripts', `profile-display-names-backup-${stamp}.json`)
  fs.writeFileSync(
    backupPath,
    JSON.stringify(
      {
        profiles: resolved.map(({ profile, name }) => ({
          id: profile.id,
          email: profile.email,
          previous_full_name: profile.full_name,
          new_full_name: name,
        })),
        schedule_item_changes: changes,
        project_comms: comms,
      },
      null,
      2,
    ),
  )
  console.log(`\nBackup written: ${backupPath}`)

  for (const { profile, name } of resolved) {
    const { error } = await sb.from('profiles').update({ full_name: name }).eq('id', profile.id)
    if (error) throw new Error(`profiles ${profile.email}: ${error.message}`)
  }
  console.log(`  profiles updated: ${resolved.length}`)

  for (const row of changes) {
    const { error } = await sb
      .from('schedule_item_changes')
      .update({ changed_by_name: nameByUid.get(row.changed_by) })
      .eq('id', row.id)
    if (error) throw new Error(`schedule_item_changes ${row.id}: ${error.message}`)
  }
  console.log(`  schedule_item_changes updated: ${changes.length}`)

  for (const row of comms) {
    const { error } = await sb
      .from('project_comms')
      .update({ author_name: nameByUid.get(row.author_user_id) })
      .eq('id', row.id)
    if (error) throw new Error(`project_comms ${row.id}: ${error.message}`)
  }
  console.log(`  project_comms updated: ${comms.length}\n`)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
