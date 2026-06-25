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



  const patch = (p: Partial<QuoteLineItem>) => setDraft((prev) => (prev ? { ...prev, ...p } : prev))



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

          {draft.type === 'drywall' && (

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


