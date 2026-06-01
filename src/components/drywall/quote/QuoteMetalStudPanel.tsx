import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { generateQuoteId, getStudRateKey } from '@/lib/drywall/drywallQuoteHelpers'
import type { DrywallQuote, MetalStudEntry } from '@/types/drywall'
import { NumField } from './quoteFormPrimitives'
import {
  METAL_STUD_GAUGES,
  METAL_STUD_SIZES,
  METAL_STUD_SPACING_OPTIONS,
  METAL_STUD_TRACKS_OPTIONS,
} from './quoteUiConstants'

interface Props {
  quote: DrywallQuote
  readOnly: boolean
  onChange: (patch: Partial<DrywallQuote>) => void
}

export function QuoteMetalStudPanel({ quote, readOnly, onChange }: Props) {
  const entries: MetalStudEntry[] = Array.isArray(quote.metalStudEntries) ? quote.metalStudEntries : []
  const studRates = (quote.metalStudStudRates || {}) as Record<string, string | number>
  const trackRates = (quote.metalStudTrackRates || {}) as Record<string, string | number>

  const setStudRate = (key: string, v: string) => {
    onChange({ metalStudStudRates: { ...studRates, [key]: v } })
  }
  const setTrackRate = (key: string, v: string) => {
    onChange({ metalStudTrackRates: { ...trackRates, [key]: v } })
  }

  const updateEntry = (id: string, patch: Partial<MetalStudEntry>) => {
    onChange({
      metalStudEntries: entries.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    })
  }

  const addEntry = () => {
    onChange({
      metalStudEntries: [
        ...entries,
        {
          id: generateQuoteId(),
          wallLf: '',
          wallHeight: '',
          spacing: '16',
          tracksPerRun: '2',
          size: '3.625',
          gauge: '20',
        },
      ],
    })
  }

  const removeEntry = (id: string) => {
    onChange({ metalStudEntries: entries.filter((e) => e.id !== id) })
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <NumField
          label="Labor ($/lf)"
          value={quote.metalStudLaborRate}
          readOnly={readOnly}
          onChange={(v) => onChange({ metalStudLaborRate: v })}
        />
        <NumField
          label="Waste %"
          value={quote.metalStudWastePercentage}
          readOnly={readOnly}
          step="0.1"
          onChange={(v) => onChange({ metalStudWastePercentage: v })}
        />
      </div>

      <p className="text-sm font-medium">Stud rates ($/lf) by size × gauge</p>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted">
              <th className="p-2 text-left">Size</th>
              {METAL_STUD_GAUGES.map((g) => (
                <th key={g.value} className="p-2 text-center">
                  {g.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {METAL_STUD_SIZES.map((s) => (
              <tr key={s.value} className="border-t">
                <td className="p-2 font-medium">{s.label}</td>
                {METAL_STUD_GAUGES.map((g) => {
                  const k = getStudRateKey(s.value, g.value)
                  return (
                    <td key={k} className="p-1">
                      <Input
                        type="number"
                        step="0.01"
                        disabled={readOnly}
                        className="h-8 text-center"
                        value={studRates[k] ?? ''}
                        onChange={(e) => setStudRate(k, e.target.value)}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-sm font-medium">Track rates ($/lf) by size × gauge</p>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted">
              <th className="p-2 text-left">Size</th>
              {METAL_STUD_GAUGES.map((g) => (
                <th key={g.value} className="p-2 text-center">
                  {g.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {METAL_STUD_SIZES.map((s) => (
              <tr key={s.value} className="border-t">
                <td className="p-2 font-medium">{s.label}</td>
                {METAL_STUD_GAUGES.map((g) => {
                  const k = getStudRateKey(s.value, g.value)
                  return (
                    <td key={k} className="p-1">
                      <Input
                        type="number"
                        step="0.01"
                        disabled={readOnly}
                        className="h-8 text-center"
                        value={trackRates[k] ?? ''}
                        onChange={(e) => setTrackRate(k, e.target.value)}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Metal stud entries (project-wide)</Label>
        {!readOnly && (
          <Button type="button" variant="outline" size="sm" onClick={addEntry}>
            <Plus className="mr-1 h-4 w-4" />
            Add entry
          </Button>
        )}
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-md">
          No project-wide stud runs. Use breakdown cards for per-floor quantities.
        </p>
      ) : (
        entries.map((entry, i) => (
          <div key={entry.id} className="rounded-lg border p-3 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Entry #{i + 1}</span>
              {!readOnly && (
                <Button type="button" variant="ghost" size="icon" onClick={() => removeEntry(entry.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <NumField
                label="Wall LF"
                value={entry.wallLf}
                readOnly={readOnly}
                onChange={(v) => updateEntry(entry.id, { wallLf: v })}
              />
              <NumField
                label="Wall height (ft)"
                value={entry.wallHeight}
                readOnly={readOnly}
                onChange={(v) => updateEntry(entry.id, { wallHeight: v })}
              />
              <div className="space-y-1">
                <Label className="text-xs">Spacing</Label>
                <Select
                  disabled={readOnly}
                  value={String(entry.spacing ?? '16')}
                  onValueChange={(v) => updateEntry(entry.id, { spacing: v })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METAL_STUD_SPACING_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tracks / run</Label>
                <Select
                  disabled={readOnly}
                  value={String(entry.tracksPerRun ?? '2')}
                  onValueChange={(v) => updateEntry(entry.id, { tracksPerRun: v })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METAL_STUD_TRACKS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Stud size</Label>
                <Select
                  disabled={readOnly}
                  value={String(entry.size ?? '3.625')}
                  onValueChange={(v) => updateEntry(entry.id, { size: v })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METAL_STUD_SIZES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Gauge</Label>
                <Select
                  disabled={readOnly}
                  value={String(entry.gauge ?? '20')}
                  onValueChange={(v) => updateEntry(entry.id, { gauge: v })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METAL_STUD_GAUGES.map((g) => (
                      <SelectItem key={g.value} value={g.value}>
                        {g.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
