import { describe, expect, it } from 'vitest'
import {
  CREW_PROJECT_SELECT,
  crewMeasureStatusFromScalars,
  isDrywallCrewProjectRow,
  isExcludedCrewProjectRow,
  type CrewProjectScalarRow,
} from './crewProjectScalars'

function row(over: Partial<CrewProjectScalarRow> = {}): CrewProjectScalarRow {
  return {
    id: 'p1',
    name: 'Project',
    client: null,
    address: null,
    status: 'production',
    type: 'drywall',
    ...over,
  }
}

describe('isDrywallCrewProjectRow', () => {
  it('keeps the dual-view rows that only quote content surfaces', () => {
    // Goodwill Multi, live and in production with crew assigned: no app_scope, a GC `type`.
    // Reached only through the quote-content terms.
    expect(
      isDrywallCrewProjectRow(
        row({
          name: 'Goodwill Multi',
          type: 'commercial-renovation',
          app_scope: null,
          quote_sqft: '48140.44',
          quote_total_amount: '135702.30814568145',
          quote_version: '3',
          quote_first_line_id: 'line-1',
        }),
      ),
    ).toBe(true)

    // 27 West Main St: no sqft and no total either — non-empty v3 line items is the ONLY
    // signal it has. Drop that term and this job leaves its crew's list.
    expect(
      isDrywallCrewProjectRow(
        row({
          name: '27 West Main St',
          type: 'residential-new-build',
          app_scope: null,
          quote_sqft: null,
          quote_total_amount: null,
          quote_version: '3',
          quote_first_line_id: 'line-1',
        }),
      ),
    ).toBe(true)
  })

  it('takes DRYWALL_ONLY scope and a drywall type on their own', () => {
    expect(isDrywallCrewProjectRow(row({ type: 'drywall' }))).toBe(true)
    expect(
      isDrywallCrewProjectRow(row({ type: 'residential', app_scope: 'DRYWALL_ONLY' })),
    ).toBe(true)
  })

  it('rejects a GC row with an empty quote shell', () => {
    // `version` alone is not content — the same rule hasDrywallWorkspaceData applies.
    expect(
      isDrywallCrewProjectRow(
        row({
          type: 'residential-new-build',
          app_scope: null,
          quote_version: '2',
          quote_sqft: '',
          quote_total_amount: null,
          quote_final_total: null,
          quote_first_line_id: null,
          quote_first_breakdown_id: null,
        }),
      ),
    ).toBe(false)
  })

  it('does not count a zero sqft or zero total as content', () => {
    expect(
      isDrywallCrewProjectRow(
        row({ type: 'residential', app_scope: null, quote_sqft: '0', quote_total_amount: '0' }),
      ),
    ).toBe(false)
  })

  it('counts v3 line items only when the version says v3', () => {
    expect(
      isDrywallCrewProjectRow(
        row({ type: 'residential', app_scope: null, quote_version: '2', quote_first_line_id: 'l' }),
      ),
    ).toBe(false)
  })
})

describe('isExcludedCrewProjectRow', () => {
  it('excludes closed jobs and lost quotes', () => {
    expect(isExcludedCrewProjectRow(row({ status: 'closed' }))).toBe(true)
    expect(isExcludedCrewProjectRow(row({ quote_outcome: 'lost' }))).toBe(true)
  })

  it('keeps a live job whose quote was sent or won', () => {
    expect(isExcludedCrewProjectRow(row({ quote_outcome: 'sent' }))).toBe(false)
    expect(isExcludedCrewProjectRow(row({ quote_outcome: 'won' }))).toBe(false)
  })
})

describe('crewMeasureStatusFromScalars', () => {
  it('reports the review status when there is one', () => {
    expect(crewMeasureStatusFromScalars(row({ takeoff_review_status: 'approved' }))).toBe(
      'approved',
    )
    expect(crewMeasureStatusFromScalars(row({ takeoff_review_status: 'rejected' }))).toBe(
      'rejected',
    )
    expect(crewMeasureStatusFromScalars(row({ takeoff_review_status: 'pending_review' }))).toBe(
      'pending_review',
    )
  })

  it('is in progress once anything has been measured or saved', () => {
    expect(crewMeasureStatusFromScalars(row({ takeoff_measured_sqft: '120' }))).toBe('in_progress')
    expect(
      crewMeasureStatusFromScalars(row({ takeoff_updated_at: '2026-09-29T12:00:00Z' })),
    ).toBe('in_progress')
  })

  it('is not started with no takeoff at all', () => {
    expect(crewMeasureStatusFromScalars(row())).toBe('not_started')
    // A takeoff row that exists but holds nothing: measured 0 and never saved.
    expect(
      crewMeasureStatusFromScalars(
        row({ takeoff_measured_sqft: '0', takeoff_updated_at: null }),
      ),
    ).toBe('not_started')
  })
})

describe('CREW_PROJECT_SELECT', () => {
  it('never selects the whole metadata blob', () => {
    // The point of the projection. `metadata` alone would undo it silently.
    expect(CREW_PROJECT_SELECT).not.toMatch(/(^|,\s*)metadata(\s*,|$)/)
    expect(CREW_PROJECT_SELECT).toContain('metadata->>app_scope')
  })

  it('carries every term the gates read', () => {
    for (const alias of [
      'app_scope',
      'quote_sqft',
      'quote_total_amount',
      'quote_final_total',
      'quote_version',
      'quote_first_line_id',
      'quote_first_breakdown_id',
      'quote_outcome',
      'takeoff_review_status',
      'takeoff_updated_at',
      'takeoff_measured_sqft',
    ]) {
      expect(CREW_PROJECT_SELECT).toContain(`${alias}:metadata->`)
    }
  })

  it('keeps the address columns the list formats from', () => {
    for (const col of ['address', 'city', 'state', 'zip_code', 'client', 'status', 'type']) {
      expect(CREW_PROJECT_SELECT.split(', ')).toContain(col)
    }
  })
})
