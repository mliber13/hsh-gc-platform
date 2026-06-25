import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { generateScopeOfWorkFromLineItems } from '@/lib/drywall/quoteScopeOfWorkGenerate'
import type { DrywallQuoteV3 } from '@/types/drywall'
import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'

const PLACEHOLDER =
  'Describe the work scope for the customer. Use the Auto-generate button to get a starting summary, then refine.'

type Props = {
  quote: DrywallQuoteV3
  catalogs: OrgDrywallCatalogs
  readOnly: boolean
  onChange: (patch: Partial<DrywallQuoteV3>) => void
}

export function QuoteScopeOfWorkPanel({ quote, catalogs, readOnly, onChange }: Props) {
  const handleAutoGenerate = () => {
    const generated = generateScopeOfWorkFromLineItems(quote.lineItems, catalogs)
    if (!generated) {
      onChange({ scope_of_work: '' })
      return
    }
    onChange({ scope_of_work: generated })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
        <CardTitle className="text-base">Scope of Work</CardTitle>
        {!readOnly && (
          <Button type="button" variant="outline" size="sm" onClick={handleAutoGenerate}>
            <Sparkles className="mr-2 h-4 w-4" />
            Auto-generate from line items
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <Textarea
          className="min-h-[120px] resize-y text-sm"
          placeholder={PLACEHOLDER}
          disabled={readOnly}
          value={quote.scope_of_work ?? ''}
          onChange={(e) => onChange({ scope_of_work: e.target.value })}
        />
      </CardContent>
    </Card>
  )
}
