import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { generateQuoteId, getInsulationMaterialRate } from '@/lib/drywall/drywallQuoteHelpers'
import type { DrywallQuote, InsulationEntry } from '@/types/drywall'
import { NumField } from './quoteFormPrimitives'
import { INSULATION_TYPES, insulationTypeHasFace } from './quoteUiConstants'

interface Props {
  quote: DrywallQuote
  readOnly: boolean
  onChange: (patch: Partial<DrywallQuote>) => void
}

export function QuoteInsulationPanel({ quote, readOnly, onChange }: Props) {
  const entries: InsulationEntry[] = Array.isArray(quote.insulationEntries)
    ? quote.insulationEntries
    : []

  const updateEntry = (id: string, patch: Partial<InsulationEntry>) => {
    onChange({
      insulationEntries: entries.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    })
  }

  const addEntry = () => {
    onChange({
      insulationEntries: [
        ...entries,
        {
          id: generateQuoteId(),
          type: 'r13Batts',
          face: 'unfaced',
          location: 'Ceiling',
          sqft: '',
          materialRate: '',
          notes: '',
        },
      ],
    })
  }

  const removeEntry = (id: string) => {
    onChange({ insulationEntries: entries.filter((e) => e.id !== id) })
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <NumField
          label="Waste %"
          value={quote.insulationWastePercentage}
          readOnly={readOnly}
          step="0.1"
          onChange={(v) => onChange({ insulationWastePercentage: v })}
        />
        <NumField
          label="Ceiling labor ($/sqft)"
          value={quote.insulationCeilingLaborRate}
          readOnly={readOnly}
          onChange={(v) => onChange({ insulationCeilingLaborRate: v })}
        />
        <NumField
          label="Wall labor ($/sqft)"
          value={quote.insulationWallLaborRate}
          readOnly={readOnly}
          onChange={(v) => onChange({ insulationWallLaborRate: v })}
        />
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Insulation entries</Label>
        {!readOnly && (
          <Button type="button" variant="outline" size="sm" onClick={addEntry}>
            <Plus className="mr-1 h-4 w-4" />
            Add entry
          </Button>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6 border border-dashed rounded-md">
          No insulation entries. Click Add entry to add rows.
        </p>
      ) : (
        <div className="space-y-3">
          {entries.map((entry, index) => (
            <div key={entry.id} className="rounded-lg border bg-muted/20 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Entry #{index + 1}</span>
                {!readOnly && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeEntry(entry.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Type</Label>
                  <Select
                    disabled={readOnly}
                    value={entry.type || 'r13Batts'}
                    onValueChange={(v) => {
                      const patch: Partial<InsulationEntry> = { type: v }
                      if (!insulationTypeHasFace(v)) patch.face = ''
                      else if (!entry.face) patch.face = 'unfaced'
                      updateEntry(entry.id, patch)
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INSULATION_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {insulationTypeHasFace(entry.type || '') && (
                  <div className="space-y-1">
                    <Label className="text-xs">Face</Label>
                    <Select
                      disabled={readOnly}
                      value={entry.face || 'unfaced'}
                      onValueChange={(v) => updateEntry(entry.id, { face: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unfaced">Unfaced</SelectItem>
                        <SelectItem value="paperFaced">Paper faced</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">Location</Label>
                  <Select
                    disabled={readOnly}
                    value={entry.location || 'Ceiling'}
                    onValueChange={(v) => updateEntry(entry.id, { location: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Ceiling">Ceiling</SelectItem>
                      <SelectItem value="Wall">Wall</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <NumField
                  label="Sq ft"
                  value={entry.sqft}
                  readOnly={readOnly}
                  step="0.1"
                  onChange={(v) => updateEntry(entry.id, { sqft: v })}
                />
                <NumField
                  label="Material rate ($/sqft)"
                  value={entry.materialRate}
                  readOnly={readOnly}
                  hint={`Default: $${getInsulationMaterialRate(entry.type || 'r13Batts', entry.face || 'unfaced', entry.materialRate).toFixed(2)}/sqft`}
                  onChange={(v) => updateEntry(entry.id, { materialRate: v })}
                />
                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-xs">Notes</Label>
                  <Textarea
                    rows={2}
                    disabled={readOnly}
                    value={String(entry.notes ?? '')}
                    onChange={(e) => updateEntry(entry.id, { notes: e.target.value })}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
