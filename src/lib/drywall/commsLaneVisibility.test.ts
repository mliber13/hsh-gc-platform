import { describe, expect, it } from 'vitest'
import { crewCanSeeMessage, filterMessagesForCrewViewer } from './commsLaneVisibility'

const TRAVIS = 'ml5i342heiu0ozag31s'
const PHILLIP = 'ml5i342hexde4kuakmr'

const msg = (audience: string, audiencePersonId: string | null = null) =>
  ({ audience, audiencePersonId }) as Parameters<typeof crewCanSeeMessage>[0]

const assigned = { personId: TRAVIS, isAssignedToProject: true }
const notAssigned = { personId: TRAVIS, isAssignedToProject: false }

describe('crewCanSeeMessage', () => {
  it('never shows office-only notes to crew', () => {
    expect(crewCanSeeMessage(msg('office'), assigned)).toBe(false)
  })

  it('shows job-wide broadcasts to assigned crew', () => {
    expect(crewCanSeeMessage(msg('job'), assigned)).toBe(true)
  })

  it('withholds job-wide broadcasts from crew who are not assigned', () => {
    expect(crewCanSeeMessage(msg('job'), notAssigned)).toBe(false)
  })

  it('shows a private lane only to the person it is addressed to', () => {
    expect(crewCanSeeMessage(msg('crew', TRAVIS), assigned)).toBe(true)
    expect(crewCanSeeMessage(msg('crew', PHILLIP), assigned)).toBe(false)
  })

  it('withholds a private lane when the viewer has no person id', () => {
    expect(crewCanSeeMessage(msg('crew', ''), { personId: '', isAssignedToProject: true })).toBe(
      false,
    )
  })

  it('withholds an unknown lane rather than defaulting it visible', () => {
    // A new audience value must not become readable by omission.
    expect(crewCanSeeMessage(msg('customer'), assigned)).toBe(false)
  })
})

describe('filterMessagesForCrewViewer', () => {
  it('counts what it withheld', () => {
    // The Bay Village case: six private lanes to one person, one office note, nothing job-wide.
    const messages = [
      msg('crew', PHILLIP),
      msg('office'),
      msg('crew', PHILLIP),
      msg('crew', PHILLIP),
      msg('crew', PHILLIP),
      msg('crew', PHILLIP),
      msg('crew', PHILLIP),
    ]

    const { visible, hiddenCount } = filterMessagesForCrewViewer(messages, assigned)

    expect(visible).toHaveLength(0)
    expect(hiddenCount).toBe(7)
  })

  it('keeps the viewer own lane and the job lane together', () => {
    const messages = [msg('job'), msg('crew', TRAVIS), msg('crew', PHILLIP), msg('office')]

    const { visible, hiddenCount } = filterMessagesForCrewViewer(messages, assigned)

    expect(visible).toHaveLength(2)
    expect(hiddenCount).toBe(2)
  })
})
