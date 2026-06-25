import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DrywallCatalogPermissionError,
  updateDrywallMarginTargets,
} from '@/services/drywallCatalogsService'
import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'

type Props = {
  catalogs: OrgDrywallCatalogs
  readOnly: boolean
  onSaved: (marginFloorTarget: number, poEstimatedCostPerSqft: number) => void
}

export function TargetsTab({ catalogs, readOnly, onSaved }: Props) {
  const [marginPct, setMarginPct] = useState(String(catalogs.marginFloorTarget * 100))
  const [poCost, setPoCost] = useState(String(catalogs.poEstimatedCostPerSqft))
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    const floor = parseFloat(marginPct) / 100
    const cost = parseFloat(poCost)
    if (!Number.isFinite(floor) || floor <= 0 || floor > 1) {
      toast.error('Margin floor must be between 0 and 100%')
      return
    }
    if (!Number.isFinite(cost) || cost <= 0) {
      toast.error('PO estimated cost per sqft must be greater than 0')
      return
    }

    setSaving(true)
    try {
      await updateDrywallMarginTargets(floor, cost)
      onSaved(floor, cost)
      toast.success('Margin targets saved')
    } catch (e: unknown) {
      if (e instanceof DrywallCatalogPermissionError) toast.error(e.message)
      else toast.error(e instanceof Error ? e.message : 'Failed to save targets')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Margin targets</CardTitle>
        <CardDescription>
          Org-wide discipline settings for quote send and PO field-measurement gates.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 max-w-md">
        <div className="space-y-2">
          <Label htmlFor="margin-floor">Margin floor target (%)</Label>
          <Input
            id="margin-floor"
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={marginPct}
            disabled={readOnly}
            onChange={(e) => setMarginPct(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Quote sends and field-measurement-to-order transitions below this trigger a
            reason-required approval dialog.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="po-cost">PO estimated cost per sqft ($)</Label>
          <Input
            id="po-cost"
            type="number"
            min={0}
            step={0.01}
            value={poCost}
            disabled={readOnly}
            onChange={(e) => setPoCost(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Used to estimate PO project margin at field measurement. Set to your typical all-in
            drywall cost per sqft.
          </p>
        </div>
        {!readOnly && (
          <Button type="button" onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'Saving…' : 'Save targets'}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
