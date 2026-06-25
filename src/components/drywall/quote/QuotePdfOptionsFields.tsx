import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DEFAULT_QUOTE_PDF_SETTINGS,
  PAYMENT_TERM_OPTIONS,
  type DrywallQuotePaymentTerms,
} from '@/lib/drywall/quotePdfSettings'
import type { DrywallQuotePdfSettings } from '@/types/drywall'

export function PdfCheckbox({
  id,
  label,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string
  label: string
  checked: boolean
  disabled: boolean
  onCheckedChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start gap-2">
      <input
        type="checkbox"
        id={id}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onCheckedChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-input text-primary focus-visible:ring-ring"
      />
      <Label htmlFor={id} className="cursor-pointer text-sm font-normal leading-snug">
        {label}
      </Label>
    </div>
  )
}

type Settings = typeof DEFAULT_QUOTE_PDF_SETTINGS

export function QuotePdfOptionsFields({
  settings,
  readOnly,
  onPatchSettings,
  idPrefix = 'pdf',
  showDurationSummary = true,
}: {
  settings: Settings
  readOnly: boolean
  onPatchSettings: (patch: Partial<DrywallQuotePdfSettings>) => void
  idPrefix?: string
  /** v3 quotes do not yet compute duration — hide when false. */
  showDurationSummary?: boolean
}) {
  return (
    <>
      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Summary &amp; schedule
        </p>
        <PdfCheckbox
          id={`${idPrefix}-show-cost-breakdown`}
          label="Include overall cost breakdown (materials and labor totals)"
          checked={settings.showCostBreakdown}
          disabled={readOnly || settings.includeTradeCostBreakdown}
          onCheckedChange={(v) => onPatchSettings({ showCostBreakdown: v })}
        />
        <PdfCheckbox
          id={`${idPrefix}-show-taxes`}
          label="Show subtotal and sales tax separately"
          checked={settings.showTaxesSeparately}
          disabled={readOnly}
          onCheckedChange={(v) => onPatchSettings({ showTaxesSeparately: v })}
        />
        {showDurationSummary ? (
          <PdfCheckbox
            id={`${idPrefix}-show-duration`}
            label="Include drywall duration summary"
            checked={settings.showDurationSummary}
            disabled={readOnly}
            onCheckedChange={(v) => onPatchSettings({ showDurationSummary: v })}
          />
        ) : null}
        <PdfCheckbox
          id={`${idPrefix}-trade-cost-breakdown`}
          label="Break out material and labor by trade (Hang / Finish / Material for drywall)"
          checked={settings.includeTradeCostBreakdown}
          disabled={readOnly}
          onCheckedChange={(v) => onPatchSettings({ includeTradeCostBreakdown: v })}
        />
      </div>

      <div className="space-y-3 border-t pt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Payment &amp; validity
        </p>
        <div className="space-y-2">
          <Label className="text-sm">Payment terms</Label>
          <Select
            value={settings.paymentTerms}
            disabled={readOnly}
            onValueChange={(v) =>
              onPatchSettings({ paymentTerms: v as DrywallQuotePaymentTerms })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_TERM_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <PdfCheckbox
          id={`${idPrefix}-show-validity`}
          label="Show quote validity period"
          checked={settings.showValidityPeriod}
          disabled={readOnly}
          onCheckedChange={(v) => onPatchSettings({ showValidityPeriod: v })}
        />
        {settings.showValidityPeriod && (
          <div className="ml-6 max-w-[8rem] space-y-1">
            <Label htmlFor={`${idPrefix}-validity-days`} className="text-sm">
              Validity (days)
            </Label>
            <Input
              id={`${idPrefix}-validity-days`}
              type="number"
              min={1}
              disabled={readOnly}
              value={String(settings.quoteValidityDays)}
              onChange={(e) =>
                onPatchSettings({
                  quoteValidityDays: Math.max(1, parseInt(e.target.value, 10) || 120),
                })
              }
            />
          </div>
        )}
      </div>

      <div className="space-y-3 border-t pt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Job site &amp; scope assumptions
        </p>
        <PdfCheckbox
          id={`${idPrefix}-gc-dumpster`}
          label="GC provides dumpster and debris disposal"
          checked={settings.includeGcDumpster}
          disabled={readOnly}
          onCheckedChange={(v) => onPatchSettings({ includeGcDumpster: v })}
        />
        <PdfCheckbox
          id={`${idPrefix}-gc-water`}
          label="GC provides temporary water"
          checked={settings.includeGcWater}
          disabled={readOnly}
          onCheckedChange={(v) => onPatchSettings({ includeGcWater: v })}
        />
        <PdfCheckbox
          id={`${idPrefix}-gc-power`}
          label="GC provides temporary electrical power"
          checked={settings.includeGcPower}
          disabled={readOnly}
          onCheckedChange={(v) => onPatchSettings({ includeGcPower: v })}
        />
        <PdfCheckbox
          id={`${idPrefix}-gc-climate`}
          label="GC provides heat / cooling for finishing conditions"
          checked={settings.includeGcClimateControl}
          disabled={readOnly}
          onCheckedChange={(v) => onPatchSettings({ includeGcClimateControl: v })}
        />
        <PdfCheckbox
          id={`${idPrefix}-point-up-trips`}
          label="Includes two return trips for touch-up / point-up"
          checked={settings.includeTwoPointUpTrips}
          disabled={readOnly}
          onCheckedChange={(v) => onPatchSettings({ includeTwoPointUpTrips: v })}
        />
      </div>

      <div className="space-y-3 border-t pt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Acceptance
        </p>
        <PdfCheckbox
          id={`${idPrefix}-signature-lines`}
          label="Include signature lines (customer and HSH Drywall)"
          checked={settings.includeSignatureLines}
          disabled={readOnly}
          onCheckedChange={(v) => onPatchSettings({ includeSignatureLines: v })}
        />
      </div>
    </>
  )
}
