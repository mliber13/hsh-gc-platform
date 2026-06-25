import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  mergeQuoteV3DocumentOptions,
  resolveQuoteV3DocumentOptions,
} from '@/lib/drywall/quoteV3PdfSettings'
import type { DrywallQuoteV3 } from '@/types/drywall'
import { QuotePdfOptionsFields } from '../QuotePdfOptionsFields'

interface Props {
  quote: DrywallQuoteV3
  readOnly: boolean
  onChange: (patch: Partial<DrywallQuoteV3>) => void
}

export function QuotePdfOptionsSectionV3({ quote, readOnly, onChange }: Props) {
  const settings = resolveQuoteV3DocumentOptions(quote.pdf_settings)

  const patchDocumentOptions = (patch: Parameters<typeof mergeQuoteV3DocumentOptions>[1]) => {
    onChange({
      pdf_settings: {
        ...quote.pdf_settings,
        document_options: mergeQuoteV3DocumentOptions(quote, patch),
      },
    })
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
        <QuotePdfOptionsFields
          idPrefix="pdf-v3"
          settings={settings}
          readOnly={readOnly}
          onPatchSettings={patchDocumentOptions}
          showDurationSummary={false}
        />

        <div className="space-y-2 border-t pt-4">
          <Label htmlFor="pdf-v3-notes-for-customer" className="text-sm">
            Additional terms note (optional)
          </Label>
          <Textarea
            id="pdf-v3-notes-for-customer"
            disabled={readOnly}
            rows={3}
            placeholder="Extra bullet shown under Terms & Conditions on the PDF"
            value={quote.pdf_settings?.notes_for_customer ?? ''}
            onChange={(e) =>
              onChange({
                pdf_settings: {
                  ...quote.pdf_settings,
                  notes_for_customer: e.target.value,
                },
              })
            }
          />
        </div>

        <p className="border-t pt-3 text-xs text-muted-foreground">
          Scope of work and pricing always appear when available. Use Download PDF to preview.
        </p>
      </CardContent>
    </Card>
  )
}
