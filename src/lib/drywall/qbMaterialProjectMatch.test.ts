/**
 * Drywall QuickBooks material matching: shared GC jobs match, but only drywall workspace jobs
 * are counted without review. The live dry run on 2026-10-13 attached 218 lines on the five
 * shared residential jobs; their 7 accepted lines ($18,399.84) started counting, their 211
 * rejected GC lines stayed rejected, and no drywall-only job's line moved.
 */
import { describe, expect, it } from 'vitest'
import {
  buildQbMaterialProjectIndex,
  isDrywallVisibleProject,
  type DrywallVisibilityRow,
} from './qbMaterialProjectMatch'

const norm = (s: string) => s.trim().toLowerCase()

const shared: DrywallVisibilityRow = {
  id: 'hillside',
  name: '135 Hillside Dr',
  type: 'residential-renovation',
  visibility: { gc: true, drywall: true },
}
const gcOnly: DrywallVisibilityRow = {
  id: 'gc',
  name: 'GC Only Job',
  type: 'residential-renovation',
  visibility: { gc: true, drywall: false },
}
const workspace = [{ id: 'kent', name: 'Kent - Hills' }]
const kentRow: DrywallVisibilityRow = { id: 'kent', name: 'Kent - Hills', type: 'drywall', visibility: { gc: true, drywall: true } }

describe('isDrywallVisibleProject', () => {
  it('matches the edge function: drywall visibility, drywall scope or source, drywall type', () => {
    expect(isDrywallVisibleProject(shared)).toBe(true)
    expect(isDrywallVisibleProject({ id: 'a', name: 'a', app_scope: 'DRYWALL_ONLY' })).toBe(true)
    expect(isDrywallVisibleProject({ id: 'b', name: 'b', source: 'drywall_app' })).toBe(true)
    expect(isDrywallVisibleProject({ id: 'c', name: 'c', type: 'drywall' })).toBe(true)
    expect(isDrywallVisibleProject({ id: 'd', name: 'd', visibility: { drywall: 'true' } })).toBe(true)
  })

  it('a project the drywall division cannot see does not match', () => {
    expect(isDrywallVisibleProject(gcOnly)).toBe(false)
    expect(isDrywallVisibleProject({ id: 'e', name: 'e', type: 'drywall', visibility: { gc: false } })).toBe(false)
    expect(isDrywallVisibleProject({ id: 'f', name: 'f', type: 'residential-renovation' })).toBe(false)
  })
})

describe('buildQbMaterialProjectIndex', () => {
  const index = buildQbMaterialProjectIndex(workspace, [kentRow, shared, gcOnly], norm)

  it('drywall workspace projects match and are counted without review', () => {
    expect(index.get('kent - hills')).toEqual({ id: 'kent', name: 'Kent - Hills', autoAccept: true })
  })

  /** The point of the change: a shared job matches, but its lines wait for a person. */
  it('projects shared with the GC match but are not auto-accepted', () => {
    expect(index.get('135 hillside dr')).toEqual({ id: 'hillside', name: '135 Hillside Dr', autoAccept: false })
  })

  /**
   * The regression from 2026-10-13: Goodwill Multi is a GC commercial job that also has a
   * drywall quote, so it sits in the drywall workspace — and all 33 of its QuickBooks lines,
   * Keim lumber included, were accepted as drywall cost. Workspace membership must not decide.
   */
  it('a GC-type project in the drywall workspace still waits for review', () => {
    const goodwill = buildQbMaterialProjectIndex(
      [{ id: 'gw', name: 'Goodwill Multi-1' }],
      [{ id: 'gw', name: 'Goodwill Multi-1', type: 'commercial-renovation', visibility: { gc: true, drywall: true } }],
      norm,
    )
    expect(goodwill.get('goodwill multi-1')?.autoAccept).toBe(false)
  })

  it('a drywall-created project auto-accepts even though it carries gc: true from the merge', () => {
    expect(index.get('kent - hills')?.autoAccept).toBe(true)
  })

  it('an unknown type waits rather than auto-accepting', () => {
    const unknown = buildQbMaterialProjectIndex([{ id: 'x', name: 'X' }], [], norm)
    expect(unknown.get('x')?.autoAccept).toBe(false)
  })

  it('GC-only projects do not match at all', () => {
    expect(index.has('gc only job')).toBe(false)
  })

  it('on a name clash the workspace project wins, so its lines stay auto-accepted', () => {
    const clash = buildQbMaterialProjectIndex(
      [{ id: 'ws', name: 'Same Name' }],
      [
        { id: 'ws', name: 'Same Name', type: 'drywall', visibility: { drywall: true } },
        { id: 'sh', name: 'Same Name', visibility: { drywall: true } },
      ],
      norm,
    )
    expect(clash.get('same name')).toEqual({ id: 'ws', name: 'Same Name', autoAccept: true })
  })
})
