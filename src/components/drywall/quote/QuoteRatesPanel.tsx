import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { DrywallQuote, DrywallQuoteCalculations } from '@/types/drywall'

interface Props {
  quote: DrywallQuote
  readOnly: boolean
  onChange: (patch: Partial<DrywallQuote>) => void
  /** From buildDrywallQuoteCalculations — total sqft including waste */
  calculations?: DrywallQuoteCalculations
}

function RateField({
  label,
  value,
  onChange,
  readOnly,
  step = '0.01',
  hint,
}: {
  label: string
  value: string | number | undefined
  onChange: (v: string) => void
  readOnly: boolean
  step?: string
  hint?: string
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number"
        step={step}
        disabled={readOnly}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function LaborRateField({
  label,
  rateValue,
  includeBurden,
  burdenKey,
  readOnly,
  onRateChange,
  onBurdenChange,
}: {
  label: string
  rateValue: string | number | undefined
  includeBurden: boolean | undefined
  burdenKey: 'hangerIncludeLaborBurden' | 'finisherIncludeLaborBurden' | 'prepCleanIncludeLaborBurden'
  readOnly: boolean
  onRateChange: (v: string) => void
  onBurdenChange: (patch: Partial<DrywallQuote>) => void
}) {
  const burdenOn = includeBurden !== false
  return (
    <div className="space-y-1.5">
      <RateField label={label} value={rateValue} readOnly={readOnly} onChange={onRateChange} />
      <label className="flex cursor-pointer items-start gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          disabled={readOnly}
          checked={burdenOn}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-input"
          onChange={(e) => onBurdenChange({ [burdenKey]: e.target.checked })}
        />
        <span>
          Include labor burden (25%)
          {!burdenOn && (
            <span className="block text-[11px] text-amber-600 dark:text-amber-400">
              Off — subcontractor / 1099 (no burden on this line)
            </span>
          )}
        </span>
      </label>
    </div>
  )
}

export function QuoteRatesPanel({ quote, readOnly, onChange, calculations }: Props) {
  const baseSqft = parseFloat(String(quote.sqft)) || 0
  const wastePct = parseFloat(String(quote.wastePercentage)) || 0
  const wasteSqft = baseSqft * (wastePct / 100)
  const calcSqft = calculations?.sqft
  const totalSqftWithWaste =
    typeof calcSqft === 'number' && Number.isFinite(calcSqft)
      ? calcSqft
      : baseSqft * (1 + wastePct / 100)
  const hasBreakdowns = (quote.breakdowns?.length ?? 0) > 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Project rates</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1 sm:col-span-2 lg:col-span-3">
          <Label>Drywall scope</Label>
          <Select
            disabled={readOnly}
            value={String(quote.drywallScope || 'hang_and_finish')}
            onValueChange={(v) => onChange({ drywallScope: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hang_and_finish">Hang & finish</SelectItem>
              <SelectItem value="hang_only">Hang only</SelectItem>
              <SelectItem value="finish_only">Finish only</SelectItem>
              <SelectItem value="board_only">Board only</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <RateField
          label="Material ($/sqft)"
          value={quote.materialRate}
          readOnly={readOnly}
          onChange={(v) => onChange({ materialRate: v })}
        />
        <LaborRateField
          label="Hanger ($/sqft)"
          rateValue={quote.hangerRate}
          includeBurden={quote.hangerIncludeLaborBurden}
          burdenKey="hangerIncludeLaborBurden"
          readOnly={readOnly}
          onRateChange={(v) => onChange({ hangerRate: v })}
          onBurdenChange={onChange}
        />
        <LaborRateField
          label="Finisher ($/sqft)"
          rateValue={quote.finisherRate}
          includeBurden={quote.finisherIncludeLaborBurden}
          burdenKey="finisherIncludeLaborBurden"
          readOnly={readOnly}
          onRateChange={(v) => onChange({ finisherRate: v })}
          onBurdenChange={onChange}
        />
        <LaborRateField
          label="Prep / clean ($/sqft)"
          rateValue={quote.prepCleanRate}
          includeBurden={quote.prepCleanIncludeLaborBurden}
          burdenKey="prepCleanIncludeLaborBurden"
          readOnly={readOnly}
          onRateChange={(v) => onChange({ prepCleanRate: v })}
          onBurdenChange={onChange}
        />
        <div className="space-y-1">
          <RateField
            label="Waste %"
            value={quote.wastePercentage}
            readOnly={readOnly}
            step="0.1"
            onChange={(v) => onChange({ wastePercentage: v })}
          />
          {!hasBreakdowns && baseSqft > 0 && (
            <div className="text-xs text-muted-foreground space-y-0.5 pt-1">
              <p>Base sqft: {baseSqft.toLocaleString()} sqft</p>
              {wastePct > 0 && (
                <p>
                  Waste: {wasteSqft.toLocaleString(undefined, { maximumFractionDigits: 0 })} sqft (
                  {wastePct}%)
                </p>
              )}
              <p className="font-semibold text-foreground">
                Sqft + waste: {totalSqftWithWaste.toLocaleString(undefined, {
                  maximumFractionDigits: 0,
                })}{' '}
                sqft
              </p>
            </div>
          )}
        </div>
        <RateField
          label="Overhead %"
          value={quote.overheadPercentage}
          readOnly={readOnly}
          step="0.1"
          onChange={(v) => onChange({ overheadPercentage: v })}
        />
        <RateField
          label="Profit %"
          value={quote.profitPercentage}
          readOnly={readOnly}
          step="0.1"
          onChange={(v) => onChange({ profitPercentage: v })}
        />
        <RateField
          label="Sales tax %"
          value={quote.salesTaxRate}
          readOnly={readOnly}
          step="0.01"
          onChange={(v) => onChange({ salesTaxRate: v })}
        />
        <RateField
          label="Hang layers (default)"
          value={quote.hangLayers}
          readOnly={readOnly}
          step="0.1"
          onChange={(v) => onChange({ hangLayers: v })}
        />
        <RateField
          label="Finish layers (default)"
          value={quote.finishLayers}
          readOnly={readOnly}
          step="0.1"
          onChange={(v) => onChange({ finishLayers: v })}
        />
        <RateField
          label="Board-only material ($/sqft)"
          value={quote.boardOnlyMaterialRate}
          readOnly={readOnly}
          onChange={(v) => onChange({ boardOnlyMaterialRate: v })}
        />
        {!quote.breakdowns?.length ? (
          <>
            <RateField
              label="Project sqft"
              value={quote.sqft}
              readOnly={readOnly}
              step="1"
              onChange={(v) => onChange({ sqft: v })}
            />
            <RateField
              label="Hang sqft override"
              value={quote.hangSqftOverride ?? ''}
              readOnly={readOnly}
              step="1"
              onChange={(v) => onChange({ hangSqftOverride: v })}
            />
            <RateField
              label="Finish sqft override"
              value={quote.finishSqftOverride ?? ''}
              readOnly={readOnly}
              step="1"
              onChange={(v) => onChange({ finishSqftOverride: v })}
            />
          </>
        ) : null}
        <div className="space-y-1 sm:col-span-2 lg:col-span-3">
          <Label>Quote includes</Label>
          <Select
            disabled={readOnly}
            value={String(quote.quoteIncludes || 'labor_and_material')}
            onValueChange={(v) => onChange({ quoteIncludes: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="labor_and_material">Labor and material</SelectItem>
              <SelectItem value="labor_only">Labor only</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <RateField
          label="Total override ($)"
          value={quote.totalQuoteAmount}
          readOnly={readOnly}
          hint="Leave blank for calculated total"
          onChange={(v) => onChange({ totalQuoteAmount: v })}
        />
      </CardContent>
    </Card>
  )
}
