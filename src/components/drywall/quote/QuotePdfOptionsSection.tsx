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
  mergeQuotePdfSettings,
  PAYMENT_TERM_OPTIONS,
  resolveQuotePdfSettings,
} from '@/lib/drywall/quotePdfSettings'
import type { DrywallQuote, DrywallQuotePdfSettings } from '@/types/drywall'

interface Props {
  quote: DrywallQuote
  readOnly: boolean
  onChange: (patch: Partial<DrywallQuote>) => void
}

function PdfCheckbox({
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

export function QuotePdfOptionsSection({ quote, readOnly, onChange }: Props) {
  const settings = resolveQuotePdfSettings(quote.pdfSettings)

  const patchSettings = (patch: Partial<DrywallQuotePdfSettings>) => {
    onChange({ pdfSettings: mergeQuotePdfSettings(quote, patch) })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">PDF document options</CardTitle>
        <CardDescription>
          Choose what appears on the downloaded quote PDF. Settings are saved with the quote.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Summary &amp; schedule
          </p>
          <PdfCheckbox
            id="pdf-show-cost-breakdown"
            label="Include overall cost breakdown (materials and labor totals)"
            checked={settings.showCostBreakdown}
            disabled={readOnly || settings.includeTradeCostBreakdown}
            onCheckedChange={(v) => patchSettings({ showCostBreakdown: v })}
          />
          <PdfCheckbox
            id="pdf-show-taxes"
            label="Show subtotal and sales tax separately"
            checked={settings.showTaxesSeparately}
            disabled={readOnly}
            onCheckedChange={(v) => patchSettings({ showTaxesSeparately: v })}
          />
          <PdfCheckbox
            id="pdf-show-duration"
            label="Include drywall duration summary"
            checked={settings.showDurationSummary}
            disabled={readOnly}
            onCheckedChange={(v) => patchSettings({ showDurationSummary: v })}
          />
          <PdfCheckbox
            id="pdf-trade-cost-breakdown"
            label="Break out material and labor by trade (Hang / Finish / Material for drywall)"
            checked={settings.includeTradeCostBreakdown}
            disabled={readOnly}
            onCheckedChange={(v) => patchSettings({ includeTradeCostBreakdown: v })}
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
                patchSettings({ paymentTerms: v as DrywallQuotePdfSettings['paymentTerms'] })
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
            id="pdf-show-validity"
            label="Show quote validity period"
            checked={settings.showValidityPeriod}
            disabled={readOnly}
            onCheckedChange={(v) => patchSettings({ showValidityPeriod: v })}
          />
          {settings.showValidityPeriod && (
            <div className="ml-6 max-w-[8rem] space-y-1">
              <Label htmlFor="pdf-validity-days" className="text-sm">
                Validity (days)
              </Label>
              <Input
                id="pdf-validity-days"
                type="number"
                min={1}
                disabled={readOnly}
                value={String(settings.quoteValidityDays)}
                onChange={(e) =>
                  patchSettings({
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
            id="pdf-gc-dumpster"
            label="GC provides dumpster and debris disposal"
            checked={settings.includeGcDumpster}
            disabled={readOnly}
            onCheckedChange={(v) => patchSettings({ includeGcDumpster: v })}
          />
          <PdfCheckbox
            id="pdf-gc-water"
            label="GC provides temporary water"
            checked={settings.includeGcWater}
            disabled={readOnly}
            onCheckedChange={(v) => patchSettings({ includeGcWater: v })}
          />
          <PdfCheckbox
            id="pdf-gc-power"
            label="GC provides temporary electrical power"
            checked={settings.includeGcPower}
            disabled={readOnly}
            onCheckedChange={(v) => patchSettings({ includeGcPower: v })}
          />
          <PdfCheckbox
            id="pdf-gc-climate"
            label="GC provides heat / cooling for finishing conditions"
            checked={settings.includeGcClimateControl}
            disabled={readOnly}
            onCheckedChange={(v) => patchSettings({ includeGcClimateControl: v })}
          />
          <PdfCheckbox
            id="pdf-point-up-trips"
            label="Includes two return trips for touch-up / point-up"
            checked={settings.includeTwoPointUpTrips}
            disabled={readOnly}
            onCheckedChange={(v) => patchSettings({ includeTwoPointUpTrips: v })}
          />
        </div>

        <div className="space-y-3 border-t pt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Acceptance
          </p>
          <PdfCheckbox
            id="pdf-signature-lines"
            label="Include signature lines (customer and HSH Drywall)"
            checked={settings.includeSignatureLines}
            disabled={readOnly}
            onCheckedChange={(v) => patchSettings({ includeSignatureLines: v })}
          />
        </div>

        <p className="border-t pt-3 text-xs text-muted-foreground">
          Scope of work and pricing always appear when available. Use Download PDF to preview.
        </p>
      </CardContent>
    </Card>
  )
}
