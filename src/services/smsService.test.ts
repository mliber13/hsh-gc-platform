import { describe, expect, it } from 'vitest'
import { buildAssignmentMessage, type PublishCandidate } from './smsService'

function candidate(overrides: Partial<PublishCandidate> = {}): PublishCandidate {
  return {
    schedule_item_id: 'item-1',
    project_id: 'proj-1',
    item_name: 'electrical finishes',
    project_name: 'Goodwill Multi',
    start_date: '2026-11-27',
    assigned_company_id: 'sub-1',
    company_name: 'Graft Electric',
    recipient_phone: '+13305551234',
    ...overrides,
  }
}

describe('buildAssignmentMessage', () => {
  // This text goes to an outside company over the org's number, and the dialog shows it
  // verbatim before sending. Pinning it means a wording change has to be deliberate.
  it('names the work, the job and the date, and says how to reply', () => {
    expect(buildAssignmentMessage(candidate())).toBe(
      "HSH GC - You're scheduled for electrical finishes at Goodwill Multi starting Nov 27." +
        ' Reply Y to confirm or N to decline.',
    )
  })

  /**
   * The date is built from the parts of the YYYY-MM-DD string into a LOCAL date, rather than
   * parsed as an instant. That is what keeps it correct in both CI zones: `new Date('2026-01-01')`
   * is UTC midnight, which formats as Dec 31 anywhere west of Greenwich. Telling a sub the
   * wrong day is the worst bug this message could have, so it is asserted rather than assumed.
   */
  it('keeps the calendar date whatever the local zone', () => {
    expect(buildAssignmentMessage(candidate({ start_date: '2026-01-01' }))).toContain('Jan 1')
    expect(buildAssignmentMessage(candidate({ start_date: '2026-12-31' }))).toContain('Dec 31')
    expect(buildAssignmentMessage(candidate({ start_date: '2026-07-04' }))).toContain('Jul 4')
  })

  it('does not pad the day', () => {
    expect(buildAssignmentMessage(candidate({ start_date: '2026-03-05' }))).toContain('Mar 5')
  })

  it('carries whatever the item is actually called', () => {
    const msg = buildAssignmentMessage(
      candidate({ item_name: 'Stock Metal Studs/RC', project_name: '3464 W. 136th St' }),
    )
    expect(msg).toContain('Stock Metal Studs/RC')
    expect(msg).toContain('3464 W. 136th St')
  })

  // 160 characters is one SMS segment; past that it bills and arrives as multiple parts.
  it('fits a single segment for a typical job', () => {
    expect(buildAssignmentMessage(candidate()).length).toBeLessThanOrEqual(160)
  })
})
