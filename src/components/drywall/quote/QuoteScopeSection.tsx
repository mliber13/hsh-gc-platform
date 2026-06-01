import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { DrywallQuote } from '@/types/drywall'

interface Props {
  quote: DrywallQuote
  readOnly: boolean
  onChange: (patch: Partial<DrywallQuote>) => void
}

export function QuoteScopeSection({ quote, readOnly, onChange }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Scope of work</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            disabled={readOnly}
            checked={Boolean(quote.useCustomScopeOfWork)}
            onChange={(e) => onChange({ useCustomScopeOfWork: e.target.checked })}
          />
          Use custom scope text
        </label>
        <div>
          <Label className="text-xs text-muted-foreground">
            {quote.useCustomScopeOfWork ? 'Custom scope' : 'Default scope notes'}
          </Label>
          <Textarea
            rows={6}
            disabled={readOnly}
            value={
              quote.useCustomScopeOfWork
                ? String(quote.customScopeOfWork ?? '')
                : String(quote.scopeOfWork ?? '')
            }
            onChange={(e) =>
              quote.useCustomScopeOfWork
                ? onChange({ customScopeOfWork: e.target.value })
                : onChange({ scopeOfWork: e.target.value })
            }
            placeholder="Describe ceiling/wall specs, finishes, exceptions…"
          />
        </div>
      </CardContent>
    </Card>
  )
}
