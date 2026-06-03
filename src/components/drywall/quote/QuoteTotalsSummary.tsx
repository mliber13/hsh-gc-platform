import { useMemo } from 'react'
import { DollarSign } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { computeDrywallDurationSummary } from '@/lib/drywall/durationService'
import { calculateQuoteTotals } from '@/lib/drywallQuoteMath'
import type {
  DrywallQuote,
  DrywallQuoteCalculations,
  QuoteBreakdown,
  QuoteOption,
} from '@/types/drywall'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n ?? 0)

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : 0
}

function calcNum(c: DrywallQuoteCalculations, key: string): number {
  return num(c[key])
}

function SummaryRow({
  label,
  value,
  bold,
  muted,
  className = '',
}: {
  label: string
  value: string
  bold?: boolean
  muted?: boolean
  className?: string
}) {
  return (
    <div className={`flex justify-between gap-2 text-sm ${className}`}>
      <span className={muted ? 'text-muted-foreground' : 'text-muted-foreground'}>{label}</span>
      <span className={bold ? 'font-semibold text-foreground' : 'font-medium'}>{value}</span>
    </div>
  )
}

function SectionHeading({ children }: { children: string }) {
  return (
    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h4>
  )
}

interface Props {
  quote: DrywallQuote
  calculations: DrywallQuoteCalculations
  totals: Record<string, number | boolean | undefined>
}

export function QuoteTotalsSummary({ quote, calculations, totals }: Props) {
  const c = calculations
  const overheadPct = num(quote.overheadPercentage)
  const profitPct = num(quote.profitPercentage)
  const wastePct = num(quote.wastePercentage)
  const totalQuoteAmount = num(quote.totalQuoteAmount)

  const includeSuspendedGrid = Boolean(quote.includeSuspendedGrid)
  const includeRcChannel = Boolean(quote.includeRcChannel)
  const includeInsulation = Boolean(quote.includeInsulation)
  const includeMetalStudFraming = Boolean(quote.includeMetalStudFraming)
  const includeFRP = Boolean(quote.includeFRP)
  const includeAcousticCeiling = Boolean(quote.includeAcousticCeiling)

  const breakdowns = quote.breakdowns ?? []
  const options = quote.options ?? []

  const laborTaxDrywall =
    calcNum(c, 'hangerCostWithTax') +
    calcNum(c, 'finisherCostWithTax') +
    calcNum(c, 'prepCleanCostWithTax') -
    calcNum(c, 'hangerCost') -
    calcNum(c, 'finisherCost') -
    calcNum(c, 'prepCleanCost')

  const drywallOnlyDirect =
    calcNum(c, 'totalDirectCost') -
    calcNum(c, 'suspendedGridTotalDirectCost') -
    calcNum(c, 'rcChannelTotalDirectCost') -
    calcNum(c, 'insulationTotalDirectCost') -
    calcNum(c, 'acousticCeilingTotalDirectCost') -
    calcNum(c, 'metalStudTotalDirectCost') -
    calcNum(c, 'frpTotalDirectCost')

  const finalTotal =
    num(totals.totalQuote) ||
    calcNum(c, 'finalTotal') ||
    calcNum(c, 'subtotalAfterProfit') ||
    0

  const breakdownRows = useMemo(() => {
    if (breakdowns.length === 0) return []
    const quoteForCalc = { ...quote, version: undefined } as DrywallQuote
    const rcWallSpacing = num(quote.rcChannelWallSpacing) || 24

    return breakdowns.map((item: QuoteBreakdown) => {
      const rowTotals = calculateQuoteTotals(
        { ...quoteForCalc, breakdowns: [{ ...item }], options: [] },
        {},
      )
      const itemBaseSqft = num(item.sqft)
      const itemSqft = itemBaseSqft * (1 + wastePct / 100)
      const itemRcChannelCeilingSqft = num(item.rcChannelCeilingSqft)
      const itemRcChannelWallLinearFt = num(item.rcChannelWallLinearFt)
      const itemRcChannelWallHeight = num(item.rcChannelWallHeight)

      let itemWallLinearFt = 0
      if (includeRcChannel && itemRcChannelWallLinearFt > 0) {
        if (itemRcChannelWallHeight > 0 && rcWallSpacing > 0) {
          const spacingInFeet = rcWallSpacing / 12
          const numberOfRows = Math.ceil(itemRcChannelWallHeight / spacingInFeet)
          itemWallLinearFt = numberOfRows * itemRcChannelWallLinearFt
        } else {
          itemWallLinearFt = itemRcChannelWallLinearFt
        }
      }

      return {
        item,
        itemBaseSqft,
        itemSqft,
        itemRcChannelCeilingSqft,
        itemWallLinearFt,
        total: num(rowTotals?.breakdownTotal) || 0,
      }
    })
  }, [quote, breakdowns, wastePct, includeRcChannel])

  const durationSummary = useMemo(() => {
    const finishes = [
      quote.ceilingFinish,
      quote.ceilingFinishOther,
      quote.wallFinish,
      quote.wallFinishOther,
    ].map((s) => String(s ?? '').toLowerCase())
    const hasLevel5 = finishes.some((s) => s.includes('level 5'))
    const hasTexture = finishes.some((s) => {
      return (
        s.includes('texture') ||
        s.includes('knockdown') ||
        s.includes('orange peel') ||
        s.includes('stomp') ||
        s.includes('skip trowel') ||
        s.includes('roll')
      )
    })
    return computeDrywallDurationSummary({
      drywallSqft: calcNum(c, 'sqft'),
      beadSticks: num(quote.beadSticks),
      buildType: String(quote.buildType ?? ''),
      complexity: String(quote.complexity ?? ''),
      hasLevel5,
      hasTexture,
      paperFloorsRequired: Boolean(quote.paperFloorsRequired),
    })
  }, [quote, c])

  const sqft = calcNum(c, 'sqft')
  const baseSqft = calcNum(c, 'baseSqft')

  return (
    <Card className="border-primary/30 sticky top-4 max-h-[calc(100vh-6rem)] overflow-y-auto">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <DollarSign className="h-5 w-5 text-primary" />
          Quote summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {/* Direct costs */}
        <div className="space-y-2">
          <SectionHeading>Direct costs</SectionHeading>
          <div className="space-y-1">
            <div className="pt-2 border-t">
              <span className="font-semibold text-foreground">Drywall</span>
            </div>
            <SummaryRow label="Hanger labor" value={fmt(calcNum(c, 'hangerCost'))} />
            <SummaryRow label="Finisher labor" value={fmt(calcNum(c, 'finisherCost'))} />
            <SummaryRow label="Prep/clean labor" value={fmt(calcNum(c, 'prepCleanCost'))} />
            <SummaryRow label="Labor taxes" value={fmt(laborTaxDrywall)} />
            <SummaryRow
              label="Material"
              value={fmt(calcNum(c, 'materialCost') - calcNum(c, 'suspendedGridMaterialCost'))}
            />
            <SummaryRow
              label="Material taxes"
              value={fmt(calcNum(c, 'salesTax') - calcNum(c, 'suspendedGridSalesTax'))}
            />
            <SummaryRow label="Total" value={fmt(drywallOnlyDirect)} bold className="pt-2 border-t" />

            {includeSuspendedGrid && (
              <>
                <SummaryRow
                  label="Suspended drywall grid ceiling"
                  value={fmt(calcNum(c, 'suspendedGridTotalDirectCost'))}
                  bold
                  className="pt-2 border-t"
                />
                <SummaryRow label="Labor" value={fmt(calcNum(c, 'carpenterCost'))} />
                <SummaryRow
                  label="Labor taxes"
                  value={fmt(
                    calcNum(c, 'suspendedGridLaborCost') - calcNum(c, 'carpenterCost'),
                  )}
                />
                <SummaryRow
                  label="Material"
                  value={fmt(calcNum(c, 'suspendedGridMaterialCost'))}
                />
                <SummaryRow
                  label="Material taxes"
                  value={fmt(calcNum(c, 'suspendedGridSalesTax'))}
                />
                <SummaryRow
                  label="Total"
                  value={fmt(calcNum(c, 'suspendedGridTotalDirectCost'))}
                  bold
                  className="pt-2 border-t"
                />
              </>
            )}

            {includeRcChannel && calcNum(c, 'rcChannelPieces') > 0 && (
              <>
                <div className="pt-2 border-t">
                  <span className="font-semibold text-foreground">RC channel</span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {calcNum(c, 'rcChannelPieces')} pcs with waste (
                    {calcNum(c, 'rcChannelBasePieces')} base) —{' '}
                    {calcNum(c, 'rcChannelLinearFt').toFixed(2)} LF
                  </p>
                </div>
                <SummaryRow
                  label="Labor"
                  value={fmt(calcNum(c, 'rcChannelLaborCostBase'))}
                />
                <SummaryRow
                  label="Labor taxes"
                  value={fmt(
                    calcNum(c, 'rcChannelLaborCost') - calcNum(c, 'rcChannelLaborCostBase'),
                  )}
                />
                <SummaryRow
                  label="Material"
                  value={fmt(calcNum(c, 'rcChannelMaterialCost'))}
                />
                <SummaryRow
                  label="Material taxes"
                  value={fmt(calcNum(c, 'rcChannelSalesTax'))}
                />
                <SummaryRow
                  label="Total"
                  value={fmt(calcNum(c, 'rcChannelTotalDirectCost'))}
                  bold
                  className="pt-2 border-t"
                />
              </>
            )}

            {includeInsulation && calcNum(c, 'insulationTotalDirectCost') > 0 && (
              <>
                <div className="pt-2 border-t">
                  <span className="font-semibold text-foreground">Insulation</span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {calcNum(c, 'insulationTotalSqft').toLocaleString(undefined, {
                      maximumFractionDigits: 0,
                    })}{' '}
                    sqft total
                  </p>
                </div>
                <SummaryRow
                  label="Labor"
                  value={fmt(calcNum(c, 'insulationLaborCostBase'))}
                />
                <SummaryRow
                  label="Labor taxes"
                  value={fmt(
                    calcNum(c, 'insulationLaborCost') - calcNum(c, 'insulationLaborCostBase'),
                  )}
                />
                <SummaryRow
                  label="Material"
                  value={fmt(calcNum(c, 'insulationMaterialCost'))}
                />
                <SummaryRow
                  label="Material taxes"
                  value={fmt(calcNum(c, 'insulationSalesTax'))}
                />
                <SummaryRow
                  label="Total"
                  value={fmt(calcNum(c, 'insulationTotalDirectCost'))}
                  bold
                  className="pt-2 border-t"
                />
              </>
            )}

            {includeMetalStudFraming && calcNum(c, 'metalStudTotalDirectCost') > 0 && (
              <>
                <SummaryRow
                  label="Metal stud framing"
                  value=""
                  bold
                  className="pt-2 border-t"
                />
                <SummaryRow
                  label="Material"
                  value={fmt(calcNum(c, 'metalStudMaterialCost'))}
                />
                <SummaryRow
                  label="Material taxes"
                  value={fmt(calcNum(c, 'metalStudSalesTax'))}
                />
                <SummaryRow
                  label="Labor"
                  value={fmt(calcNum(c, 'metalStudLaborCostBase'))}
                />
                <SummaryRow
                  label="Labor taxes"
                  value={fmt(
                    calcNum(c, 'metalStudLaborTax') ||
                      calcNum(c, 'metalStudLaborCost') - calcNum(c, 'metalStudLaborCostBase'),
                  )}
                />
                <SummaryRow
                  label="Labor total"
                  value={fmt(calcNum(c, 'metalStudLaborCost'))}
                />
                <SummaryRow
                  label="Total"
                  value={fmt(calcNum(c, 'metalStudTotalDirectCost'))}
                  bold
                  className="pt-2 border-t"
                />
              </>
            )}

            {includeFRP && calcNum(c, 'frpTotalDirectCost') > 0 && (
              <>
                <SummaryRow label="FRP" value="" bold className="pt-2 border-t" />
                <SummaryRow label="Material" value={fmt(calcNum(c, 'frpMaterialCost'))} />
                <SummaryRow label="Material taxes" value={fmt(calcNum(c, 'frpSalesTax'))} />
                <SummaryRow
                  label="Total"
                  value={fmt(calcNum(c, 'frpTotalDirectCost'))}
                  bold
                  className="pt-2 border-t"
                />
              </>
            )}

            {includeAcousticCeiling && calcNum(c, 'acousticCeilingTotalDirectCost') > 0 && (
              <>
                <div className="pt-2 border-t">
                  <span className="font-semibold text-foreground">
                    Acoustic ceiling tile &amp; grid
                  </span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {calcNum(c, 'acousticCeilingSqft').toLocaleString(undefined, {
                      maximumFractionDigits: 0,
                    })}{' '}
                    sqft total
                  </p>
                </div>
                <SummaryRow
                  label="Labor"
                  value={fmt(calcNum(c, 'acousticCeilingLaborCostBase'))}
                />
                <SummaryRow
                  label="Labor taxes"
                  value={fmt(
                    calcNum(c, 'acousticCeilingLaborCost') -
                      calcNum(c, 'acousticCeilingLaborCostBase'),
                  )}
                />
                <SummaryRow
                  label="Tile"
                  value={fmt(calcNum(c, 'acousticCeilingTileCost'))}
                />
                <SummaryRow
                  label="Grid"
                  value={fmt(calcNum(c, 'acousticCeilingGridCost'))}
                />
                <SummaryRow
                  label="Material taxes"
                  value={fmt(calcNum(c, 'acousticCeilingSalesTax'))}
                />
                <SummaryRow
                  label="Total"
                  value={fmt(calcNum(c, 'acousticCeilingTotalDirectCost'))}
                  bold
                  className="pt-2 border-t"
                />
              </>
            )}

            <SummaryRow
              label="Total direct cost"
              value={fmt(calcNum(c, 'totalDirectCost'))}
              bold
              className="pt-2 border-t text-primary"
            />
          </div>
        </div>

        {/* Overhead & subtotal */}
        <div className="space-y-1 pt-2 border-t">
          <SummaryRow
            label={`Overhead (${overheadPct}%)`}
            value={fmt(calcNum(c, 'overheadAmount'))}
          />
          <SummaryRow
            label="Subtotal"
            value={fmt(calcNum(c, 'subtotalBeforeProfit'))}
            bold
            className="pt-2 border-t"
          />
        </div>

        {/* Profit */}
        <div className="space-y-1 pt-2 border-t">
          <SummaryRow
            label={`Profit (${profitPct}%)`}
            value={fmt(calcNum(c, 'profitAmount'))}
          />
          {totalQuoteAmount > 0 && (
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Actual profit</span>
              <span>
                {fmt(calcNum(c, 'actualProfit'))} ({calcNum(c, 'profitMargin').toFixed(1)}%)
              </span>
            </div>
          )}
        </div>

        {/* Options */}
        {options.length > 0 && (
          <div className="space-y-2 pt-2 border-t">
            <SectionHeading>Options</SectionHeading>
            {options.map((opt: QuoteOption) => {
              const desc = opt.description || opt.name || 'Option'
              const optSqft = opt.useTotalSqft ? sqft : num(opt.sqft)
              const optRate = num(opt.rate)
              const optPrice =
                optSqft > 0 && optRate > 0 ? optSqft * optRate : num(opt.price)
              const displayText = opt.useTotalSqft
                ? `${desc} (${sqft.toLocaleString()} sqft × $${optRate.toFixed(2)})`
                : opt.sqft && opt.rate
                  ? `${desc} (${optSqft.toLocaleString()} sqft × $${optRate.toFixed(2)})`
                  : desc
              return (
                <div
                  key={opt.id}
                  className={`flex justify-between gap-2 ${opt.selected ? '' : 'opacity-60'}`}
                >
                  <span className="text-muted-foreground">
                    {opt.selected ? '✓ ' : '○ '}
                    {displayText}
                  </span>
                  <span
                    className={
                      opt.selected ? 'font-semibold text-primary' : 'text-muted-foreground'
                    }
                  >
                    {fmt(optPrice)}
                  </span>
                </div>
              )
            })}
            {calcNum(c, 'selectedOptionsTotal') > 0 && (
              <SummaryRow
                label="Selected options total"
                value={fmt(calcNum(c, 'selectedOptionsTotal'))}
                bold
                className="pt-2 border-t"
              />
            )}
          </div>
        )}

        {/* Breakdown summary */}
        {breakdownRows.length > 0 && (
          <div className="space-y-2 pt-2 border-t">
            <SectionHeading>Breakdown summary</SectionHeading>
            <div className="max-h-[150px] overflow-y-auto space-y-2 text-xs text-muted-foreground">
              {breakdownRows.map(
                ({
                  item,
                  itemBaseSqft,
                  itemSqft,
                  itemRcChannelCeilingSqft,
                  itemWallLinearFt,
                  total,
                }) => (
                  <div
                    key={item.id}
                    className="pb-2 border-b border-border/50 last:border-0"
                  >
                    <div className="font-medium text-foreground">
                      {item.description || 'Untitled'}
                    </div>
                    <div>
                      {itemBaseSqft > 0 && (
                        <>
                          {itemBaseSqft.toLocaleString()} sqft (base)
                          {wastePct > 0 && (
                            <span>
                              {' '}
                              + {wastePct.toFixed(1)}% ={' '}
                              {itemSqft.toLocaleString(undefined, {
                                maximumFractionDigits: 0,
                              })}{' '}
                              sqft (total)
                            </span>
                          )}
                        </>
                      )}
                      {itemRcChannelCeilingSqft > 0 && (
                        <span className="ml-2">
                          {itemRcChannelCeilingSqft.toLocaleString()} sqft RC ceiling
                        </span>
                      )}
                      {itemWallLinearFt > 0 && (
                        <span className="ml-2">{itemWallLinearFt.toFixed(2)} LF RC wall</span>
                      )}
                      {' — '}
                      {fmt(total)}
                    </div>
                  </div>
                ),
              )}
            </div>
          </div>
        )}

        {/* Final total */}
        <div className="pt-4 border-t-2 border-primary space-y-1">
          <div className="flex justify-between items-center">
            <span className="text-base font-bold">Total quote</span>
            <span className="text-xl font-bold text-primary">{fmt(finalTotal)}</span>
          </div>
          {sqft > 0 && breakdowns.length === 0 && (
            <p className="text-xs text-muted-foreground">
              {fmt(finalTotal / sqft)}/sqft
              {num(c.wastePercentage) > 0 && (
                <span className="ml-2">
                  (Base: {baseSqft.toLocaleString(undefined, { maximumFractionDigits: 0 })}{' '}
                  sqft + {num(c.wastePercentage).toFixed(1)}% waste)
                </span>
              )}
            </p>
          )}
          {breakdowns.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Based on {breakdowns.length} breakdown item
              {breakdowns.length > 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* Duration summary */}
        {sqft > 0 && (
          <div className="pt-4 border-t space-y-1">
            <SectionHeading>Drywall duration summary</SectionHeading>
            {durationSummary.lines.map((line) => (
              <div key={line.label} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{line.label}</span>
                <span>
                  {line.days} day{line.days !== 1 ? 's' : ''}
                </span>
              </div>
            ))}
            <div className="flex justify-between font-semibold pt-2 border-t border-border/50">
              <span>Total</span>
              <span>{durationSummary.totalDays} days</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">{durationSummary.assumptions}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
