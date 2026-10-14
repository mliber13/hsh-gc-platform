// Step 4 of the Field flow — material orders, one per stock delivery on the schedule.
//
// Each delivery uses ScheduleItemOrderSheet, the same component the schedule item dialog
// uses, so the two places cannot disagree about a job's orders (see memory "two paths, one
// record"). The schedule supplies each delivery's date; the takeoff supplies what is on it.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScheduleItemOrderSheet } from '@/components/drywall/schedule/ScheduleItemOrderSheet'
import { phaseForScheduleItem } from '@/components/drywall/schedule/scheduleItemStatusStyles'
import { fetchScheduleItemsForProject } from '@/services/scheduleService'
import type { DrywallProjectScheduleItem } from '@/services/scheduleService'
import type { DrywallOrder } from '@/types/drywall'

interface FieldOrdersStepProps {
  projectId: string
  orders: DrywallOrder[]
  /** Rates before ordering (IA §13). Existing orders still show; nothing new can be attached. */
  ratesApproved: boolean
  readOnly: boolean
}

type DeliveryItem = Pick<DrywallProjectScheduleItem, 'id' | 'name' | 'start_date' | 'type'>

function formatDay(iso: string): string {
  try {
    return format(parseISO(iso), 'EEE MMM d')
  } catch {
    return iso
  }
}

export function FieldOrdersStep({ projectId, orders, ratesApproved, readOnly }: FieldOrdersStepProps) {
  const [items, setItems] = useState<DeliveryItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchScheduleItemsForProject(projectId)
      .then((rows) => {
        if (!cancelled) setItems(rows)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load the schedule')
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!items) return <p className="text-sm text-muted-foreground">Loading deliveries…</p>

  // Stock deliveries by name — plus any item that already carries an order, so an order on an
  // oddly named item is never hidden here (a miss stays visible, not silent).
  const linkedIds = new Set(orders.map((o) => o.scheduleItemId).filter(Boolean) as string[])
  const deliveries = items.filter(
    (i) => phaseForScheduleItem({ name: i.name, type: i.type }) === 'stock' || linkedIds.has(i.id),
  )
  const unlinked = orders.filter(
    (o) => o.status !== 'cancelled' && (!o.scheduleItemId || !items.some((i) => i.id === o.scheduleItemId)),
  )
  const locked = !ratesApproved

  return (
    <div className="space-y-4">
      {locked ? (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          Approve the labor rates first — orders are made after the rates are settled.
        </p>
      ) : null}

      {deliveries.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed p-4">
          <p className="text-sm text-muted-foreground">
            No stock delivery on the schedule yet. Add a Stock item — the order&apos;s delivery date
            comes from it.
          </p>
          <Button asChild size="sm" variant="outline">
            <Link to={`/drywall/projects/${projectId}/schedule`}>
              <CalendarDays className="mr-2 h-4 w-4" />
              Open schedule
            </Link>
          </Button>
        </div>
      ) : (
        deliveries.map((d) => (
          <div key={d.id} className="space-y-2">
            <p className="text-sm font-medium">
              {d.name} <span className="text-muted-foreground">· {formatDay(d.start_date)}</span>
            </p>
            <ScheduleItemOrderSheet
              projectId={projectId}
              scheduleItemId={d.id}
              scheduleItemDate={d.start_date}
              readOnly={readOnly || locked}
            />
          </div>
        ))
      )}

      {unlinked.length > 0 ? (
        <div className="rounded-md border p-3 text-sm">
          <p className="font-medium">Not tied to a schedule delivery</p>
          <ul className="mt-1 space-y-0.5 text-muted-foreground">
            {unlinked.map((o) => (
              <li key={o.id}>
                {o.supplier || 'No supplier'} · {o.items?.length ?? 0} items · {o.status}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            Open a delivery on the schedule to attach one, or remove it from the supplier board.
          </p>
        </div>
      ) : null}
    </div>
  )
}
