/**
 * Every quote field the crew code reads must be in the crew allowlist.
 *
 * `crew_project_detail` projects the project blob through allowlists so a field nobody has
 * thought about defaults to hidden. That is the right default, and it has one failure mode:
 * **a field the crew page genuinely needs goes missing and nothing says so.** The page renders,
 * just emptier.
 *
 * That is not hypothetical. The allowlist shipped on 2026-10-07 missed twelve fields:
 * `hangerRate` / `finisherRate` (the v2 rate names, present on 91 v2 and 20 v3 quotes) blanked
 * the crew pay rate, and the snake_case structured-scope family — `wall_finish`,
 * `ceiling_finish`, `wall_thickness`, `ceiling_thickness`, `hang_exceptions`,
 * `wall_exceptions`, `ceiling_exceptions`, `ceiling_finish_other`, `custom_scope_of_work` —
 * quietly emptied the crew Scope of Work card on up to 73 v3 jobs. It was found by someone
 * noticing a job with no rate, a day later.
 *
 * So the check is mechanical rather than hand-written: parse the deployed allowlist out of the
 * migrations, parse the field reads out of the crew path, and fail on any gap. A hand-written
 * list of "fields crew need" is the thing that was already wrong.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const MIGRATIONS_DIR = 'supabase/migrations'

/**
 * The crew path: every module that reads quote fields out of the projected blob. A new one
 * belongs here, which is the point — adding a reader without the allowlist fails this test.
 */
const CREW_PATH_FILES = [
  'src/services/crewWorkspaceService.ts',
  'src/lib/drywall/structuredScopePdf.ts',
  'src/lib/drywall/crewPayBasis.ts',
]

/** Receivers in those files that hold a projected quote. */
const QUOTE_RECEIVERS = ['v2', 'v3', 'quote']

/**
 * Reads that are not quote fields. Each needs a reason, because an entry here is a hole in
 * the check.
 */
const NOT_QUOTE_FIELDS = new Set([
  // Array and function members, not blob keys.
  'length',
  'map',
  'filter',
  'find',
  'some',
  'reduce',
  'trim',
  'toFixed',
  'push',
  'slice',
  'join',
  'forEach',
  'flatMap',
  'sort',
  'includes',
  'split',
  'replace',
  'toLocaleString',
  'toString',
])

/**
 * The last definition of a function across all migrations wins, the same way the database
 * resolves CREATE OR REPLACE. Reading only the original migration would pass while a later
 * one narrowed the list.
 */
function deployedAllowlist(fnName: string, keyMarker: string): Set<string> {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  let found: Set<string> | null = null
  for (const f of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8')
    const marker = `CREATE OR REPLACE FUNCTION public.${fnName}(`
    let from = sql.indexOf(marker)
    while (from !== -1) {
      const body = functionBody(sql, from)
      const keysAt = body.indexOf(keyMarker)
      if (keysAt !== -1) {
        // Only the IN list itself. Reading on to the end of the body would also collect the
        // nested-array allowlists further down, and count `face` or `gauge` as top-level.
        const list = body.slice(keysAt + keyMarker.length)
        const keys = [...list.slice(0, list.indexOf(')')).matchAll(/'([A-Za-z_][A-Za-z0-9_]*)'/g)]
          .map((m) => m[1])
        found = new Set(keys)
      }
      from = sql.indexOf(marker, from + marker.length)
    }
  }

  if (!found) throw new Error(`no allowlist found for ${fnName} in ${MIGRATIONS_DIR}`)
  return found
}

/** A function body from its CREATE to its closing `$$;`, with `--` comments removed. */
function functionBody(sql: string, from: number): string {
  const end = sql.indexOf('$$;', from)
  return sql
    .slice(from, end === -1 ? undefined : end)
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
}

/** The last crew_safe_quote body across all migrations — what the database runs. */
function deployedQuoteBody(): string {
  let found: string | null = null
  for (const f of fs.readdirSync(MIGRATIONS_DIR).filter((x) => x.endsWith('.sql')).sort()) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8')
    // CREATE only: COMMENT ON and REVOKE also say 'FUNCTION public.crew_safe_quote(', and
    // slicing from those to the next $; would take the DO block for the body.
    const marker = 'CREATE OR REPLACE FUNCTION public.crew_safe_quote('
    let from = sql.indexOf(marker)
    while (from !== -1) {
      found = functionBody(sql, from)
      from = sql.indexOf(marker, from + marker.length)
    }
  }
  if (!found) throw new Error('no crew_safe_quote definition found')
  return found
}

/** The key allowlist a nested array is narrowed to, or null if it passes through whole. */
function nestedAllowlist(body: string, arrayKey: string): Set<string> | null {
  const call = new RegExp(
    String.raw`crew_safe_entries\(\s*v\s*->\s*'${arrayKey}'\s*,\s*ARRAY\[([^\]]*)\]`,
  )
  const m = body.match(call)
  if (!m) return null
  return new Set([...m[1].matchAll(/'([A-Za-z_][A-Za-z0-9_]*)'/g)].map((x) => x[1]))
}

function fieldReads(): Map<string, Set<string>> {
  const reads = new Map<string, Set<string>>()
  for (const file of CREW_PATH_FILES) {
    const src = fs.readFileSync(file, 'utf8')
    const name = path.basename(file)
    for (const receiver of QUOTE_RECEIVERS) {
      const re = new RegExp(String.raw`\b${receiver}\??\.([A-Za-z_][A-Za-z0-9_]*)`, 'g')
      for (const m of src.matchAll(re)) {
        const key = m[1]
        if (NOT_QUOTE_FIELDS.has(key)) continue
        const where = reads.get(key) ?? new Set<string>()
        where.add(name)
        reads.set(key, where)
      }
    }
  }
  return reads
}

describe('crew_safe_quote allowlist', () => {
  const allowed = deployedAllowlist('crew_safe_quote', 'key IN (')
  const reads = fieldReads()

  // Guard the scan itself: a regex that silently matches nothing would make this whole file
  // pass vacuously, which is exactly the class of bug it exists to catch.
  it('the scan finds the fields it is supposed to scan', () => {
    expect(reads.size).toBeGreaterThan(20)
    expect([...reads.keys()]).toContain('hangerRate')
    expect([...reads.keys()]).toContain('wall_finish')
    expect(allowed.size).toBeGreaterThan(50)
  })

  it('allows every quote field the crew path reads', () => {
    const missing = [...reads.entries()]
      .filter(([key]) => !allowed.has(key))
      .map(([key, where]) => `${key} (read in ${[...where].join(', ')})`)
      .sort()

    expect(missing).toEqual([])
  })

  it('keeps the three pay rates under both the v2 and v3 names', () => {
    // 91 v2 and 20 v3 quotes carry the camelCase names; dropping either blanks crew pay.
    for (const key of [
      'hangerRate',
      'finisherRate',
      'prepCleanRate',
      'project_hanger_rate',
      'project_finisher_rate',
    ]) {
      expect(allowed.has(key), `${key} must stay allowlisted — crew pay reads it`).toBe(true)
    }
  })

  it('still withholds the money fields that started this', () => {
    for (const key of [
      'totalQuoteAmount',
      'bidSnapshot',
      'profitPercentage',
      'overheadPercentage',
      'salesTaxRate',
      'materialRate',
      'boardOnlyMaterialRate',
      'calculations',
      'takeoffData',
      'rateAdjustmentLog',
      // Nothing in the crew path reads alternates, and each one nests whole priced line items.
      'alternates',
    ]) {
      expect(allowed.has(key), `${key} must NOT be allowlisted`).toBe(false)
    }
  })
})

/**
 * Allowlisting an ARRAY used to pass its elements through whole. breakdowns[] carried
 * itemTotal / drywallTotal / rcChannelTotal on 47 breakdowns, and insulationEntries[] carried
 * materialRate — all of it reaching crew phones past a top-level list that looked clean.
 */
describe('crew_safe_quote nested arrays', () => {
  const body = deployedQuoteBody()
  const allowed = deployedAllowlist('crew_safe_quote', 'key IN (')

  it('narrows every allowlisted array of objects, rather than passing it through', () => {
    for (const key of ['breakdowns', 'insulationEntries', 'metalStudEntries', 'rcChannelWallEntries']) {
      expect(allowed.has(key), `${key} is expected in the top-level list`).toBe(true)
      expect(nestedAllowlist(body, key), `${key} is allowlisted but never narrowed`).not.toBeNull()
    }
    expect(body).toMatch(/crew_safe_line_items\(\s*v\s*->\s*'lineItems'/)
  })

  it('keeps breakdowns[].sqft, which the crew pay basis sums', () => {
    expect(nestedAllowlist(body, 'breakdowns')?.has('sqft')).toBe(true)
  })

  it('withholds the dollar totals and material rates nested inside them', () => {
    const breakdowns = nestedAllowlist(body, 'breakdowns')!
    for (const key of ['itemTotal', 'drywallTotal', 'rcChannelTotal']) {
      expect(breakdowns.has(key), `breakdowns[].${key} must NOT be allowlisted`).toBe(false)
    }
    expect(nestedAllowlist(body, 'insulationEntries')!.has('materialRate')).toBe(false)
  })

  it('projects the frozen v2 snapshot through the same function', () => {
    // The snapshot carries the whole v2 rate card. Leaving it to the caller is what let a
    // check of this function disagree with what crew actually receive.
    expect(body).toMatch(/crew_safe_quote\(\s*v\s*->\s*'legacyV2Snapshot'\s*\)/)
  })
})
