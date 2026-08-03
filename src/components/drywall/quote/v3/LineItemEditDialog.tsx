import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'

import {

  Dialog,

  DialogContent,

  DialogFooter,

  DialogHeader,

  DialogTitle,

} from '@/components/ui/dialog'

import { Input } from '@/components/ui/input'

import { Label } from '@/components/ui/label'

import type { QuoteLineItem } from '@/types/drywall'
import { V3_LINE_MIGRATION_OVERRIDE_REASON } from '@/lib/drywall/convertQuoteV2ToV3'



type Props = {

  open: boolean

  onOpenChange: (open: boolean) => void

  line: QuoteLineItem | null

  readOnly: boolean

  onSave: (line: QuoteLineItem) => void

}



export function LineItemEditDialog({ open, onOpenChange, line, readOnly, onSave }: Props) {

  const [draft, setDraft] = useState<QuoteLineItem | null>(line)



  useEffect(() => {

    if (open) setDraft(line)

  }, [open, line])



  if (!draft) return null

  const rcSurface = draft.rc_surface === 'ceiling' ? 'ceiling' : 'wall'
  const rcSpacingIn = draft.rc_spacing_in && draft.rc_spacing_in > 0 ? draft.rc_spacing_in : 24
  const rcSpacingFt = rcSpacingIn / 12
  const rcRows =
    rcSurface === 'wall'
      ? draft.rc_wall_height && draft.rc_wall_height > 0
        ? Math.ceil(draft.rc_wall_height / rcSpacingFt)
        : 1
      : 0
  const rcChannelLf = rcSurface === 'ceiling' ? (draft.quantity || 0) / rcSpacingFt : (draft.quantity || 0) * rcRows
  const rcChannelLfWasted = (rcChannelLf * (100 + (draft.waste_pct ?? 10))) / 100
  const rcPieces = Math.ceil(rcChannelLfWasted / 12)

  // Suspended grid — computed component counts (defaults shown as placeholders; overridable).
  const gridSqft = draft.quantity || 0
  const gridWasteMult = 1 + (draft.waste_pct ?? 0) / 100
  const gridSqftW = gridSqft * gridWasteMult
  const gridBasePerimeter =
    draft.grid_perimeter && draft.grid_perimeter > 0 ? draft.grid_perimeter : 4 * Math.sqrt(gridSqft)
  const gridPerimeterW = gridBasePerimeter * gridWasteMult
  const gridCounts = {
    mains: Math.ceil(gridSqftW / 4 / 12),
    tees_4ft: Math.ceil((gridSqftW / 16) * 2),
    wire: Math.ceil(gridSqftW / 5),
    lags: Math.ceil(Math.ceil(gridSqftW / 5) / 8),
    wall_angle: Math.ceil(gridPerimeterW / 8),
  }
  const gridCountFields: {
    key: keyof NonNullable<QuoteLineItem['grid_count_overrides']>
    label: string
  }[] = [
    { key: 'mains', label: 'Mains' },
    { key: 'tees_4ft', label: 'Cross-tees (4ft)' },
    { key: 'wire', label: 'Wire (LF)' },
    { key: 'lags', label: 'Lags' },
    { key: 'wall_angle', label: 'Wall angle' },
  ]



  const patch = (p: Partial<QuoteLineItem>) =>
    setDraft((prev) => {
      if (!prev) return prev
      const next = { ...prev, ...p }
      if (
        (p.custom_hanger_rate !== undefined || p.custom_finisher_rate !== undefined) &&
        next.override_reason === V3_LINE_MIGRATION_OVERRIDE_REASON
      ) {
        next.override_reason = undefined
      }
      return next
    })



  const handleSave = () => {

    if (!draft) return

    onSave(draft)

    onOpenChange(false)

  }



  return (

    <Dialog open={open} onOpenChange={onOpenChange}>

      <DialogContent className="max-w-md">

        <DialogHeader>

          <DialogTitle>Line details & overrides</DialogTitle>

        </DialogHeader>

        <div className="grid gap-3 py-2">

          {(draft.type === 'drywall' ||
            draft.type === 'rc_channel' ||
            draft.type === 'suspended_grid') && (

            <div className="space-y-1.5">

              <Label htmlFor="waste-pct">Waste %</Label>

              <Input

                id="waste-pct"

                type="number"

                min={0}

                step={0.1}

                disabled={readOnly}

                value={draft.waste_pct ?? 10}

                onChange={(e) => patch({ waste_pct: parseFloat(e.target.value) || 0 })}

              />

            </div>

          )}
          {draft.type === 'rc_channel' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="rc-surface">RC surface</Label>
                  <select
                    id="rc-surface"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    disabled={readOnly}
                    value={rcSurface}
                    onChange={(e) =>
                      patch({ rc_surface: e.target.value === 'ceiling' ? 'ceiling' : 'wall' })
                    }
                  >
                    <option value="wall">Wall</option>
                    <option value="ceiling">Ceiling</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rc-spacing">Spacing (in.)</Label>
                  <Input
                    id="rc-spacing"
                    type="number"
                    min={1}
                    step={1}
                    disabled={readOnly}
                    value={draft.rc_spacing_in ?? 24}
                    onChange={(e) => patch({ rc_spacing_in: parseFloat(e.target.value) || 24 })}
                  />
                </div>
              </div>

              {rcSurface === 'wall' && (
                <div className="space-y-1.5">
                  <Label htmlFor="rc-wall-height">Wall height (ft)</Label>
                  <Input
                    id="rc-wall-height"
                    type="number"
                    min={0}
                    step={0.1}
                    disabled={readOnly}
                    value={draft.rc_wall_height ?? ''}
                    onChange={(e) =>
                      patch({
                        rc_wall_height: e.target.value === '' ? undefined : parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              )}

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  disabled={readOnly}
                  checked={draft.accessoryOverrides?.screws ?? true}
                  onChange={(e) =>
                    patch({
                      accessoryOverrides: {
                        ...(draft.accessoryOverrides || {}),
                        screws: e.target.checked,
                      },
                    })
                  }
                />
                Include screws accessory
              </label>

              <p className="text-xs text-muted-foreground">
                Derived: {rcChannelLfWasted.toFixed(2)} channel LF (incl. waste) · {rcPieces} pieces
              </p>
            </>
          )}

          {draft.type === 'suspended_grid' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="grid-perimeter">Perimeter (LF)</Label>
                  <Input
                    id="grid-perimeter"
                    type="number"
                    min={0}
                    step={0.1}
                    disabled={readOnly}
                    value={draft.grid_perimeter ?? ''}
                    placeholder={`≈ ${(4 * Math.sqrt(gridSqft)).toFixed(0)} (4×√sqft)`}
                    onChange={(e) =>
                      patch({
                        grid_perimeter:
                          e.target.value === '' ? undefined : parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="grid-labor">Carpenter labor ($/sqft)</Label>
                  <Input
                    id="grid-labor"
                    type="number"
                    min={0}
                    step={0.01}
                    disabled={readOnly}
                    value={draft.custom_labor_rate ?? ''}
                    placeholder="2.00"
                    onChange={(e) =>
                      patch({
                        custom_labor_rate:
                          e.target.value === '' ? undefined : parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              </div>

              <p className="text-xs font-medium text-muted-foreground">
                Component counts (blank = computed; enter to override)
              </p>
              <div className="grid grid-cols-2 gap-2">
                {gridCountFields.map((f) => (
                  <div key={f.key} className="space-y-1">
                    <Label htmlFor={`grid-${f.key}`} className="text-xs">
                      {f.label}
                    </Label>
                    <Input
                      id={`grid-${f.key}`}
                      type="number"
                      min={0}
                      step={1}
                      disabled={readOnly}
                      value={draft.grid_count_overrides?.[f.key] ?? ''}
                      placeholder={String(gridCounts[f.key])}
                      onChange={(e) =>
                        patch({
                          grid_count_overrides: {
                            ...(draft.grid_count_overrides || {}),
                            [f.key]:
                              e.target.value === ''
                                ? undefined
                                : parseFloat(e.target.value) || 0,
                          },
                        })
                      }
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Material uses the Suspended Grid catalog rates. Set a Custom material rate below only
                to force a blended $/sqft (bypasses the itemized breakdown).
              </p>
            </>
          )}

          <div className="space-y-1.5">

            <Label htmlFor="custom-mat">Custom material rate (optional)</Label>

            <Input

              id="custom-mat"

              type="number"

              min={0}

              step={0.01}

              disabled={readOnly}

              value={draft.custom_material_rate ?? ''}

              placeholder="Catalog default"

              onChange={(e) => {

                const v = e.target.value

                patch({ custom_material_rate: v === '' ? undefined : parseFloat(v) || 0 })

              }}

            />

          </div>

          {draft.type === 'drywall' && (

            <>

              <div className="space-y-1.5">

                <Label htmlFor="custom-hanger">Custom hanger rate (optional)</Label>

                <Input

                  id="custom-hanger"

                  type="number"

                  min={0}

                  step={0.01}

                  disabled={readOnly}

                  value={draft.custom_hanger_rate ?? ''}

                  placeholder="Board catalog default"

                  onChange={(e) => {

                    const v = e.target.value

                    patch({ custom_hanger_rate: v === '' ? undefined : parseFloat(v) || 0 })

                  }}

                />

              </div>

              <div className="space-y-1.5">

                <Label htmlFor="custom-finisher">Custom finisher rate (optional)</Label>

                <Input

                  id="custom-finisher"

                  type="number"

                  min={0}

                  step={0.01}

                  disabled={readOnly}

                  value={draft.custom_finisher_rate ?? ''}

                  placeholder="Finish scope default"

                  onChange={(e) => {

                    const v = e.target.value

                    patch({ custom_finisher_rate: v === '' ? undefined : parseFloat(v) || 0 })

                  }}

                />

              </div>

            </>

          )}

          {draft.type !== 'drywall' && (
            <div className="space-y-1.5">
              <Label htmlFor="line-description">Description</Label>
              <Input
                id="line-description"
                disabled={readOnly}
                value={draft.description ?? ''}
                placeholder="Optional line description"
                onChange={(e) => patch({ description: e.target.value })}
              />
            </div>
          )}

          <div className="space-y-1.5">

            <Label htmlFor="override-reason">Override reason</Label>

            <Input

              id="override-reason"

              disabled={readOnly}

              value={draft.override_reason ?? ''}

              onChange={(e) => patch({ override_reason: e.target.value || undefined })}

            />

          </div>

          <div className="space-y-1.5">

            <Label htmlFor="line-notes">Notes</Label>

            <Input

              id="line-notes"

              disabled={readOnly}

              value={draft.notes ?? ''}

              onChange={(e) => patch({ notes: e.target.value || undefined })}

            />

          </div>

        </div>

        <DialogFooter>

          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>

            Cancel

          </Button>

          {!readOnly && (

            <Button type="button" onClick={handleSave}>

              Apply

            </Button>

          )}

        </DialogFooter>

      </DialogContent>

    </Dialog>

  )

}


