import { describe, expect, it } from 'vitest'
import { subtypeNeedsCategory } from './fieldAccessoryUi'
import { formatAccessoryLineDescription } from './fieldMaterialsPdfData'

// A material order listed '20 Gauge - 3-5/8" (10')' twice with no way to tell the stud
// from the track — the item name is identical under Metal Studs, Metal Track and
// Deflection Track, and the category was dropped from the line description.

const acc = (patch: Partial<Parameters<typeof formatAccessoryLineDescription>[0]>) => ({
  subtype: '',
  type: '',
  length: '',
  threadType: '',
  facing: '',
  ...patch,
})

describe('ambiguous accessory subtypes', () => {
  it('flags names shared across categories', () => {
    expect(subtypeNeedsCategory('20 Gauge - 3-5/8"')).toBe(true)
    expect(subtypeNeedsCategory('Main Runners')).toBe(true)
  })

  it('leaves names unique to one category alone', () => {
    expect(subtypeNeedsCategory('Powder-Actuated Pins')).toBe(false)
    expect(subtypeNeedsCategory('Bullnose')).toBe(false)
    expect(subtypeNeedsCategory('')).toBe(false)
  })

  it('names the category so a stud and a track are not the same line', () => {
    const stud = formatAccessoryLineDescription(
      acc({ type: 'Metal Studs', subtype: '20 Gauge - 3-5/8"', length: "10'" }),
    )
    const track = formatAccessoryLineDescription(
      acc({ type: 'Metal Track', subtype: '20 Gauge - 3-5/8"', length: "10'" }),
    )

    expect(stud).toBe('Metal Studs — 20 Gauge - 3-5/8" (10\')')
    expect(track).toBe('Metal Track — 20 Gauge - 3-5/8" (10\')')
    expect(stud).not.toBe(track)
  })

  it('does not prefix an unambiguous item', () => {
    expect(
      formatAccessoryLineDescription(acc({ type: 'Fasteners', subtype: 'Powder-Actuated Pins' })),
    ).toBe('Powder-Actuated Pins')
  })

  it('keeps facing, length and thread suffixes in order', () => {
    expect(
      formatAccessoryLineDescription(
        acc({ type: 'Fasteners', subtype: 'Self-Tapping Screws 1/2"', threadType: 'Fine' }),
      ),
    ).toBe('Self-Tapping Screws 1/2" - Fine')
  })
})
