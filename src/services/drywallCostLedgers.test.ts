/**
 * Drywall cost reads only drywall ledgers.
 *
 * `material_entries` and `subcontractor_entries` are the GC's actuals tables. Until 2026-10-13
 * the drywall cost service read both, so on every project both divisions share, GC cost showed
 * as drywall cost: $410,894 of material and $776,625 of subcontractors across six projects
 * (Goodwill Multi's design fees, lumber and porta potties among them), on each job's Financials
 * page and in the KPI hub's division margin. Drywall-only projects have no rows in either table,
 * which is how the rule was confirmed: drywall never writes them.
 *
 * Checked at the source rather than through a mock, because the failure is a single
 * `.from('…')` call someone adds back, and a mock would only prove what it was told.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

const DRYWALL_COST_READERS = [
  'src/services/drywallProjectCostService.ts',
  'src/services/drywallDivisionAggregateService.ts',
  'src/services/drywallLaborAuditService.ts',
  'src/services/drywallLaborService.ts',
]

const GC_ACTUALS_TABLES = ['material_entries', 'subcontractor_entries']

describe('drywall cost ledgers', () => {
  for (const file of DRYWALL_COST_READERS) {
    it(`${file} never reads a GC actuals table`, () => {
      const src = fs.readFileSync(file, 'utf8')
      for (const table of GC_ACTUALS_TABLES) {
        expect(src, `${file} reads ${table}`).not.toMatch(new RegExp(`\\.from\\(\\s*['"\`]${table}['"\`]`))
      }
    })
  }

  it('drywall material still comes from the drywall QuickBooks ledger', () => {
    const src = fs.readFileSync('src/services/drywallProjectCostService.ts', 'utf8')
    expect(src).toMatch(/\.from\(\s*'drywall_qb_materials'\s*\)/)
  })
})
