// ============================================================================
// CreateDealDialog — shared modal for creating a new deal
// ============================================================================
//
// Used by DealWorkspace (action strip / ?new=1 trigger) and DealsDashboard
// (empty-state / "+ Create Deal" button). Owns its own form state and the
// createDeal() API call; caller handles post-create navigation via onCreated.
//

import { useState } from 'react'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { createDeal } from '@/services/dealService'
import type { Deal } from '@/types/deal'

const INITIAL_FORM = {
  deal_name: '',
  location: '',
  type: 'commercial' as Deal['type'],
  status: 'active-pipeline' as Deal['status'],
  unit_count: '',
  projected_cost: '',
  expected_start_date: '',
}

interface CreateDealDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called after a deal is successfully created. Caller decides whether to
   *  navigate, refresh a list, etc. The dialog closes itself before this
   *  fires and resets its own form. */
  onCreated: (deal: Deal) => void
}

export function CreateDealDialog({ open, onOpenChange, onCreated }: CreateDealDialogProps) {
  const [form, setForm] = useState(INITIAL_FORM)
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    if (creating) return
    const dealName = form.deal_name.trim()
    if (!dealName) return
    const location = form.location.trim() || 'TBD'
    const unitCount = form.unit_count.trim()
    const projectedCost = form.projected_cost.trim()

    setCreating(true)
    try {
      const created = await createDeal({
        deal_name: dealName,
        location,
        type: form.type,
        status: form.status,
        unit_count: unitCount ? Number(unitCount) : undefined,
        projected_cost: projectedCost ? Number(projectedCost) : undefined,
        expected_start_date: form.expected_start_date || undefined,
      })
      if (!created) {
        window.alert('Failed to create deal. Please try again.')
        return
      }
      setForm(INITIAL_FORM)
      onOpenChange(false)
      onCreated(created)
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg border-border/60 bg-card text-foreground">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-lg font-semibold">Create New Deal</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Enter deal details and open it in the workspace.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="new-deal-name">Deal Name *</Label>
              <Input
                id="new-deal-name"
                value={form.deal_name}
                onChange={(e) => setForm((prev) => ({ ...prev, deal_name: e.target.value }))}
                placeholder="e.g. Oakwood Townhomes"
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="new-deal-location">Location</Label>
              <Input
                id="new-deal-location"
                value={form.location}
                onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))}
                placeholder="Address or city"
              />
            </div>
            <div>
              <Label>Type</Label>
              <Select
                value={form.type}
                onValueChange={(value) => setForm((prev) => ({ ...prev, type: value as Deal['type'] }))}
              >
                <SelectTrigger className="border-border/60 bg-card text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="commercial">Commercial</SelectItem>
                  <SelectItem value="residential">Residential</SelectItem>
                  <SelectItem value="new-single-family">New Single Family</SelectItem>
                  <SelectItem value="multifamily">Multifamily</SelectItem>
                  <SelectItem value="mixed-residential">Mixed Residential</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(value) => setForm((prev) => ({ ...prev, status: value as Deal['status'] }))}
              >
                <SelectTrigger className="border-border/60 bg-card text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active-pipeline">Active Pipeline</SelectItem>
                  <SelectItem value="early-stage">Early Stage</SelectItem>
                  <SelectItem value="concept-pre-funding">Concept / Pre-Funding</SelectItem>
                  <SelectItem value="very-early">Very Early</SelectItem>
                  <SelectItem value="pending-docs">Pending Docs</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="new-deal-units">Unit Count</Label>
              <Input
                id="new-deal-units"
                type="number"
                min="0"
                value={form.unit_count}
                onChange={(e) => setForm((prev) => ({ ...prev, unit_count: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="new-deal-projected-cost">Projected Cost</Label>
              <Input
                id="new-deal-projected-cost"
                type="number"
                min="0"
                step="0.01"
                value={form.projected_cost}
                onChange={(e) => setForm((prev) => ({ ...prev, projected_cost: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="new-deal-start-date">Expected Start Date</Label>
              <Input
                id="new-deal-start-date"
                type="date"
                value={form.expected_start_date}
                onChange={(e) => setForm((prev) => ({ ...prev, expected_start_date: e.target.value }))}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleCreate()} disabled={creating || !form.deal_name.trim()}>
            {creating ? 'Creating...' : 'Create Deal'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
