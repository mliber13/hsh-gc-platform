import { describe, expect, it } from 'vitest'
import { buildDrywallChangeOrderPdfModel } from './drywallChangeOrderPdf'

const project = { name: 'Job', client: 'Client', address: '123 Main' }
const documentDate = new Date('2026-07-15T12:00:00Z')

describe('change-order PDF model', () => {
  it('shows a submitted change as proposed without double-counting prior accepted changes', () => {
    const current = {
      id: 'co-2',
      changeOrderNumber: 'CO-002',
      status: 'submitted' as const,
      requestedAmount: '5000',
    }
    const result = buildDrywallChangeOrderPdfModel(
      {
        project,
        quote: {
          bidSnapshot: {
            total: 100_000,
            at: documentDate.toISOString(),
            payload: {
              routineSubtotal: 100_000,
              cleanupTotal: 0,
              overhead: 0,
              profit: 0,
              salesTax: 0,
              bidTotal: 100_000,
              lineItems: [],
              alternates: [],
            },
          },
        },
        changeOrder: current,
        changeOrders: [
          { id: 'co-1', status: 'accepted', acceptedAmount: '10000' },
          current,
        ],
      },
      documentDate,
    )

    expect(result.priorAcceptedChangeOrders).toBe(10_000)
    expect(result.documentAmount).toBe(5_000)
    expect(result.revisedContractValue).toBe(115_000)
    expect(result.status).toBe('Submitted')
  })

  it('uses the accepted amount for an accepted current change order', () => {
    const current = {
      id: 'co-1',
      status: 'accepted' as const,
      requestedAmount: '5000',
      acceptedAmount: '4250',
    }
    const result = buildDrywallChangeOrderPdfModel(
      {
        project,
        quote: { totalQuoteAmount: 100_000 },
        changeOrder: current,
        changeOrders: [current],
      },
      documentDate,
    )

    expect(result.acceptedAmount).toBe(4_250)
    expect(result.priorAcceptedChangeOrders).toBe(0)
    expect(result.revisedContractValue).toBe(104_250)
  })

  it('supports deductive changes and purchase-order contract fallback', () => {
    const current = {
      id: 'co-deduct',
      status: 'submitted' as const,
      requestedAmount: '-2500',
    }
    const result = buildDrywallChangeOrderPdfModel(
      {
        project,
        quote: null,
        po: { customerSqft: 10_000, agreedUnitRate: 2.5 },
        changeOrder: current,
        changeOrders: [current],
      },
      documentDate,
    )

    expect(result.baseContractValue).toBe(25_000)
    expect(result.revisedContractValue).toBe(22_500)
  })
})
