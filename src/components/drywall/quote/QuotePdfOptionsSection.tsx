import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  mergeQuotePdfSettings,
  resolveQuotePdfSettings,
} from '@/lib/drywall/quotePdfSettings'
import type { DrywallQuote } from '@/types/drywall'
import { QuotePdfOptionsFields } from './QuotePdfOptionsFields'

interface Props {
  quote: DrywallQuote
  readOnly: boolean
  onChange: (patch: Partial<DrywallQuote>) => void
}

export function QuotePdfOptionsSection({ quote, readOnly, onChange }: Props) {
  const settings = resolveQuotePdfSettings(quote.pdfSettings)

  const patchSettings = (patch: Parameters<typeof mergeQuotePdfSettings>[1]) => {
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
        <QuotePdfOptionsFields
          settings={settings}
          readOnly={readOnly}
          onPatchSettings={patchSettings}
        />
        <p className="border-t pt-3 text-xs text-muted-foreground">
          Scope of work and pricing always appear when available. Use Download PDF to preview.
        </p>
      </CardContent>
    </Card>
  )
}
