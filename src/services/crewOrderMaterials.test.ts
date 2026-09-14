/**
 * The material list a crew member sees when the operator shares it on a schedule item.
 *
 * Shipped 2026-09-07 pointing at the wrong list: the toggle unlocked the field
 * takeoff accessories, but a delivery runs off the supplier order, which is a
 * separate operator-curated list. A Laborer with the toggle correctly on read an
 * empty card while the order had everything on it.
 */
import { describe, expect, it } from 'vitest'
import { resolveOrderMaterials } from './crewWorkspaceService'

function legacyWith(orders: unknown) {
  return { orders } as Record<string, unknown>
}

const ITEM = { id: 'i1', description: '5/8 Type X', quantity: '120', unit: 'sheets' }

describe('resolveOrderMaterials', () => {
  it('returns nothing when the project has no orders', () => {
    expect(resolveOrderMaterials({})).toEqual([])
    expect(resolveOrderMaterials(legacyWith([]))).toEqual([])
    expect(resolveOrderMaterials(legacyWith('nonsense'))).toEqual([])
  })

  it('surfaces the order lines, which the takeoff list never did', () => {
    const groups = resolveOrderMaterials(
      legacyWith([{ id: 'o1', orderNumber: 'PO-1001', items: [ITEM] }]),
    )
    expect(groups).toHaveLength(1)
    expect(groups[0].orderLabel).toBe('PO-1001')
    expect(groups[0].items[0]).toMatchObject({ description: '5/8 Type X', quantity: '120', unit: 'sheets' })
  })

  it('groups by the order area and calls a blank area General', () => {
    const groups = resolveOrderMaterials(
      legacyWith([
        {
          id: 'o1',
          supplier: 'ABC Supply',
          items: [
            { ...ITEM, id: 'a', area: '2nd Floor' },
            { ...ITEM, id: 'b', area: '2nd Floor' },
            { ...ITEM, id: 'c', area: '  ' },
          ],
        },
      ]),
    )
    const areas = groups.map((g) => g.area).sort()
    expect(areas).toEqual(['2nd Floor', 'General'])
    expect(groups.find((g) => g.area === '2nd Floor')!.items).toHaveLength(2)
  })

  it('falls back to the supplier name when there is no order number', () => {
    const groups = resolveOrderMaterials(
      legacyWith([{ id: 'o1', supplier: 'ABC Supply', items: [ITEM] }]),
    )
    expect(groups[0].orderLabel).toBe('ABC Supply')
  })

  it('keeps delivered lines — crew need to know what was meant to arrive', () => {
    const groups = resolveOrderMaterials(
      legacyWith([
        { id: 'o1', status: 'complete', supplierDeliveredAt: '2026-09-11', items: [ITEM] },
      ]),
    )
    expect(groups).toHaveLength(1)
  })

  it('drops a cancelled order entirely', () => {
    expect(
      resolveOrderMaterials(legacyWith([{ id: 'o1', status: 'cancelled', items: [ITEM] }])),
    ).toEqual([])
  })

  it('drops zero and blank quantities, keeps written ones, and shows what the order shows', () => {
    const groups = resolveOrderMaterials(
      legacyWith([
        {
          id: 'o1',
          items: [
            { id: 'a', description: 'Screws', quantity: '0', unit: 'box' },
            { id: 'b', description: '', quantity: '5', unit: 'box' },
            { id: 'c', description: 'Scaffold', quantity: '1 lift', unit: '' },
            { id: 'd', description: 'Mud', quantity: '12', unit: 'box' },
          ],
        },
      ]),
    )
    const descriptions = groups.flatMap((g) => g.items.map((i) => i.description))
    // The blank-description row survives as 'Item' — that is what normalizeOrderItem
    // stores and what the operator sees on their own order sheet, so the crew list
    // agrees with it rather than quietly hiding a line.
    expect(descriptions).toEqual(['Item', 'Scaffold', 'Mud'])
  })

  it('keeps two orders on one job separable', () => {
    const groups = resolveOrderMaterials(
      legacyWith([
        { id: 'o1', orderNumber: 'PO-1', deliveryDate: '2026-09-11', items: [ITEM] },
        { id: 'o2', orderNumber: 'PO-2', deliveryDate: '2026-09-18', items: [{ ...ITEM, id: 'z' }] },
      ]),
    )
    expect(groups.map((g) => g.orderLabel)).toEqual(['PO-1', 'PO-2'])
    expect(groups.map((g) => g.deliveryDate)).toEqual(['2026-09-11', '2026-09-18'])
  })
})
