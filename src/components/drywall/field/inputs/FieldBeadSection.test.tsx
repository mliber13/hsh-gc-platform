/**
 * Corner bead moved out of Accessories into its own section. Rendered to static HTML (the
 * suite runs in node, without a DOM), which is enough to hold the two halves of the move:
 * the bead section shows a job's existing bead counts, and the Accessories list no longer
 * shows those rows — while they stay in the data the compound calc and order PDF read.
 */
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { FieldAccessoryEntry, FieldTakeoff } from '@/types/drywall'
import { FieldBeadSection } from './FieldBeadSection'
import { FieldAccessoriesSection } from './FieldAccessoriesSection'

/** Shaped like a live job: bead saved by the old Accessories UI, next to compound and screws. */
const accessories: FieldAccessoryEntry[] = [
  { id: 'b1', type: 'Corner Bead', subtype: 'Square Bead', length: "10'", quantity: '12', unit: 'pcs', autoCalculated: false, manuallyEdited: false, threadType: '', facing: '' },
  { id: 'b2', type: 'Corner Bead', subtype: 'Square Bead', length: "8'", quantity: '5', unit: 'pcs', autoCalculated: false, manuallyEdited: false, threadType: '', facing: '' },
  { id: 'b3', type: 'Corner Bead', subtype: 'Tearaway', length: "10'", quantity: '3', unit: 'pcs', autoCalculated: false, manuallyEdited: false, threadType: '', facing: '' },
  { id: 'c1', type: 'Joint Compound', subtype: 'Easy Sand 90', quantity: '4', unit: 'bags', autoCalculated: true },
  { id: 's1', type: 'Fasteners', subtype: 'Drywall Screws 1-1/4"', quantity: '2', unit: 'box', autoCalculated: true },
]

const takeoff = { accessories, measurements: [] } as unknown as FieldTakeoff
const noop = () => {}

describe('FieldBeadSection', () => {
  const html = renderToStaticMarkup(
    <FieldBeadSection takeoff={takeoff} readOnly={false} onChange={noop} />,
  )

  it('shows the job’s existing bead counts in the grid', () => {
    expect(html).toContain('value="12"')
    expect(html).toContain('value="5"')
    expect(html).toContain('value="3"')
  })

  it('totals sticks and linear feet for the whole job', () => {
    // 12×10 + 5×8 + 3×10 = 190 LF across 20 sticks.
    expect(html).toContain('20 sticks · 190 LF')
  })

  it('lays out stock lengths as tiles: four for square bead, one for tearaway', () => {
    // Square bead: 8' 9' 10' 12'. Tearaway: 10'. Five length inputs in all.
    expect(html.match(/type="number"/g)).toHaveLength(5)
  })
})

describe('FieldAccessoriesSection after the move', () => {
  const html = renderToStaticMarkup(
    <FieldAccessoriesSection
      takeoff={takeoff}
      measuredSqft={0}
      quote={null}
      readOnly={false}
      onChange={noop}
      disableAutoCalc
    />,
  )

  it('lists the other accessories but not the bead rows', () => {
    // Two non-bead rows → two quantity inputs; the three bead rows are not listed.
    expect(html.match(/type="number"/g)).toHaveLength(2)
    expect(html).not.toContain('value="12"')
    expect(html).toContain('#2')
    expect(html).not.toContain('#3')
  })
})
