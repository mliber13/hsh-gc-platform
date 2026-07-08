import { describe, expect, it } from 'vitest'
import { createDefaultDrywallCatalogSeeds } from './catalogSeeds'
import { LABOR_TAX_RATE } from './calculations/quantityUtils'
import { computeLineItem } from './quoteV3Math'
import { computeRcChannelScrews, RC_CHANNEL_LF_PER_SCREW_BOX } from './quoteV3Accessories'
import type { QuoteLineItem } from '@/types/drywall'

function makeCatalogs() {
  const catalogs = createDefaultDrywallCatalogSeeds()
  catalogs.rc_channel = [
    {
      id: 'rc-1',
      display_name: 'RC 12ft',
      size: '1-1/2',
      material_rate_per_piece: 10,
      labor_rate: 2,
      default_piece_length_ft: 12,
    },
  ]
  return catalogs
}

function rcLine(patch: Partial<QuoteLineItem>): QuoteLineItem {
  return {
    id: 'line-1',
    type: 'rc_channel',
    description: 'RC line',
    location: 'Area A',
    quantity: 0,
    catalog_id: 'rc-1',
    ...patch,
  }
}

describe('computeLineItem rc_channel', () => {
  it('ceiling 1000 sqft @24in => 550 LF wasted (10%) and 46 pieces', () => {
    const catalogs = makeCatalogs()
    const line = rcLine({ rc_surface: 'ceiling', rc_spacing_in: 24, quantity: 1000 })
    const computed = computeLineItem(line, catalogs)
    const channelLfWasted = 500 * 1.1
    expect(computed.materialTotal).toBe(Math.ceil(channelLfWasted / 12) * 10)
    expect(computed.laborTotal).toBeCloseTo(channelLfWasted * 2 * (1 + LABOR_TAX_RATE), 6)
  })

  it('applies default labor burden to RC channel labor (wasted LF × rate × 1.25)', () => {
    const catalogs = makeCatalogs()
    const line = rcLine({ rc_surface: 'ceiling', rc_spacing_in: 24, quantity: 1000 })
    const computed = computeLineItem(line, catalogs)
    const channelLfWasted = 500 * 1.1
    const laborRate = 2
    expect(computed.laborTotal).toBeCloseTo(channelLfWasted * laborRate * (1 + LABOR_TAX_RATE), 6)
  })

  it('wall 100 LF @8ft height, 24in => 440 LF wasted', () => {
    const catalogs = makeCatalogs()
    const line = rcLine({ rc_surface: 'wall', rc_spacing_in: 24, rc_wall_height: 8, quantity: 100 })
    const computed = computeLineItem(line, catalogs)
    const channelLfWasted = 400 * 1.1
    expect(computed.laborTotal).toBeCloseTo(channelLfWasted * 2 * (1 + LABOR_TAX_RATE), 6)
    expect(computed.materialTotal).toBe(Math.ceil(channelLfWasted / 12) * 10)
  })

  it('wall height unset defaults rows=1 so channelLf equals quantity (with 10% waste)', () => {
    const catalogs = makeCatalogs()
    const line = rcLine({ rc_surface: 'wall', rc_spacing_in: 24, quantity: 100 })
    const computed = computeLineItem(line, catalogs)
    const channelLfWasted = 100 * 1.1
    expect(computed.laborTotal).toBeCloseTo(channelLfWasted * 2 * (1 + LABOR_TAX_RATE), 6)
    expect(computed.materialTotal).toBe(Math.ceil(channelLfWasted / 12) * 10)
  })

  it('720 LF @ 10% waste → 792 LF, 66 pieces, labor and screws from wasted LF', () => {
    const catalogs = makeCatalogs()
    const line = rcLine({
      rc_surface: 'wall',
      rc_spacing_in: 24,
      quantity: 720,
      waste_pct: 10,
    })
    const computed = computeLineItem(line, catalogs)
    const channelLfWasted = 792
    const boxPrice =
      catalogs.accessories.find((a) => a.id === 'screws_1_25_fine')?.material_rate ?? 0
    expect(computed.materialTotal).toBe(66 * 10)
    expect(computed.laborTotal).toBeCloseTo(channelLfWasted * 2 * (1 + LABOR_TAX_RATE), 6)
    expect(computed.accessoriesTotal).toBeCloseTo(1 * boxPrice, 6)
    expect(Math.ceil(channelLfWasted / 12)).toBe(66)
  })
})

describe('computeRcChannelScrews', () => {
  function fineScrewRate(catalogs: ReturnType<typeof makeCatalogs>) {
    return catalogs.accessories.find((a) => a.id === 'screws_1_25_fine')?.material_rate ?? 0
  }

  it('rounds up to whole boxes and uses fine-thread screws', () => {
    const catalogs = makeCatalogs()
    const boxPrice = fineScrewRate(catalogs)

    const partial = computeRcChannelScrews(720, catalogs.accessories, {
      screwsEnabled: true,
      accessoriesInMaterialRate: false,
    })
    expect(partial.screwsTotal).toBeCloseTo(1 * boxPrice, 6)
    expect(partial.accessories.byCategory.screws[0].catalogEntryId).toBe('screws_1_25_fine')
    expect(partial.accessories.byCategory.screws[0].units).toBe(1)

    const exact = computeRcChannelScrews(RC_CHANNEL_LF_PER_SCREW_BOX, catalogs.accessories, {
      screwsEnabled: true,
      accessoriesInMaterialRate: false,
    })
    expect(exact.screwsTotal).toBeCloseTo(1 * boxPrice, 6)
    expect(exact.accessories.byCategory.screws[0].units).toBe(1)

    const over = computeRcChannelScrews(5000, catalogs.accessories, {
      screwsEnabled: true,
      accessoriesInMaterialRate: false,
    })
    expect(over.screwsTotal).toBeCloseTo(2 * boxPrice, 6)
    expect(over.accessories.byCategory.screws[0].units).toBe(2)
    expect(over.accessories.byCategory.screws[0].catalogEntryId).toBe('screws_1_25_fine')
  })

  it('falls back to coarse when fine thread is missing', () => {
    const catalogs = makeCatalogs()
    catalogs.accessories = catalogs.accessories.filter((a) => a.id !== 'screws_1_25_fine')
    const boxPrice =
      catalogs.accessories.find((a) => a.id === 'screws_1_25_coarse')?.material_rate ?? 0
    const result = computeRcChannelScrews(720, catalogs.accessories, {
      screwsEnabled: true,
      accessoriesInMaterialRate: false,
    })
    expect(result.accessories.byCategory.screws[0].catalogEntryId).toBe('screws_1_25_coarse')
    expect(result.screwsTotal).toBeCloseTo(1 * boxPrice, 6)
  })
})
