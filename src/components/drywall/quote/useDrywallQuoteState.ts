import { useMemo } from 'react'
import { buildDrywallQuoteCalculations, calculateQuoteTotals } from '@/lib/drywallQuoteMath'
import type { DrywallQuote, DrywallQuoteCalculations } from '@/types/drywall'

export function useDrywallQuoteCalculations(quote: DrywallQuote) {
  const calculations = useMemo(
    () => buildDrywallQuoteCalculations(quote) as DrywallQuoteCalculations,
    [quote],
  )

  const totals = useMemo(() => {
    const quoteForCalc = { ...quote, version: undefined } as DrywallQuote
    return calculateQuoteTotals(quoteForCalc, calculations)
  }, [quote, calculations])

  return { calculations, totals }
}
