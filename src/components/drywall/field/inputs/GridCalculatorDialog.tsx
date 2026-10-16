import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  GRID_ORDER_LINES,
  gridOrderCounts,
  type GridOrderCounts,
  type GridTeeSpacingIn,
} from '@/lib/drywall/gridOrderCalc'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The quote's grid, when it has one — the starting sqft, perimeter and waste. */
  fromQuote: { sqft: number; perimeter: number; wastePct: number } | null
  /** The phase the lines are added to, for the button label; null on a job nobody phases. */
  phaseLabel: string | null
  onAdd: (lines: { subtype: string; unit: string; quantity: number }[]) => void
}

const num = (v: string) => {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Size a suspended grid from sqft and perimeter (gridOrderCalc.ts) and add it as material lines.
 * Every count can be changed before it is added — the formula is the starting point.
 */
export function GridCalculatorDialog({ open, onOpenChange, fromQuote, phaseLabel, onAdd }: Props) {
  const [sqft, setSqft] = useState('')
  const [perimeter, setPerimeter] = useState('')
  const [waste, setWaste] = useState('10')
  const [spacing, setSpacing] = useState<GridTeeSpacingIn>(16)
  const [edited, setEdited] = useState<Partial<Record<keyof GridOrderCounts, string>>>({})

  useEffect(() => {
    if (!open) return
    setSqft(fromQuote ? String(Math.round(fromQuote.sqft * 100) / 100) : '')
    setPerimeter(fromQuote && fromQuote.perimeter > 0 ? String(Math.round(fromQuote.perimeter * 100) / 100) : '')
    setWaste(String(fromQuote?.wastePct ?? 10))
    setSpacing(16)
    setEdited({})
  }, [open, fromQuote])

  const counts = useMemo(
    () => gridOrderCounts({ sqft: num(sqft), perimeter: num(perimeter), wastePct: num(waste), teeSpacingIn: spacing }),
    [sqft, perimeter, waste, spacing],
  )
  // A changed input recounts; a count typed by hand stays until the inputs change.
  useEffect(() => setEdited({}), [sqft, perimeter, waste, spacing])

  const value = (key: keyof GridOrderCounts) => edited[key] ?? String(counts?.[key] ?? '')

  const add = () => {
    const lines = GRID_ORDER_LINES.map((l) => ({ subtype: l.subtype, unit: l.unit, quantity: num(value(l.key)) })).filter(
      (l) => l.quantity > 0,
    )
    onAdd(lines)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Grid calculator</DialogTitle>
          <DialogDescription>
            {fromQuote
              ? "Started from the quote's grid. Change anything — waste applies to the sqft and the perimeter."
              : 'Ceiling sqft and the perimeter for the wall angle. Waste applies to both.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label htmlFor="grid-sqft">Ceiling sqft</Label>
            <Input id="grid-sqft" inputMode="decimal" value={sqft} onChange={(e) => setSqft(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="grid-perimeter">Perimeter (ft)</Label>
            <Input
              id="grid-perimeter"
              inputMode="decimal"
              value={perimeter}
              placeholder="square room"
              onChange={(e) => setPerimeter(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="grid-waste">Waste %</Label>
            <Input id="grid-waste" inputMode="decimal" value={waste} onChange={(e) => setWaste(e.target.value)} />
          </div>
        </div>

        <div className="space-y-1">
          <Label>Cross tees every</Label>
          <div className="flex gap-2">
            {([16, 24] as const).map((s) => (
              <Button
                key={s}
                type="button"
                size="sm"
                variant={spacing === s ? 'default' : 'outline'}
                onClick={() => setSpacing(s)}
              >
                {s}&quot;
              </Button>
            ))}
          </div>
        </div>

        {counts ? (
          <div className="space-y-2 rounded-md border p-3">
            {GRID_ORDER_LINES.map((l) => (
              <div key={l.key} className="flex items-center justify-between gap-3">
                <Label htmlFor={`grid-${l.key}`} className="text-sm font-normal">
                  {l.label}
                </Label>
                <Input
                  id={`grid-${l.key}`}
                  inputMode="numeric"
                  className="h-8 w-24 text-right tabular-nums"
                  value={value(l.key)}
                  onChange={(e) => setEdited((prev) => ({ ...prev, [l.key]: e.target.value }))}
                />
              </div>
            ))}
            <p className="pt-1 text-xs text-muted-foreground">
              Mains 4&apos; apart; a hanger every 4&apos; along each main, one wire and one lag each.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Enter the ceiling sqft to size the grid.</p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!counts} onClick={add}>
            {phaseLabel ? `Add to ${phaseLabel} materials` : 'Add to materials'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
