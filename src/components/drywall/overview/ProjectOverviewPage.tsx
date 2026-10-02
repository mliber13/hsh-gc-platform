// ============================================================================
// Project Overview — where the job stands, without opening seven tabs
// ============================================================================
//
// The project page never had the hub's scrolling problem: every stage was already its own
// route and rendered one at a time. What it lacked was the hub's OTHER half — a view that
// says where the job stands before you click anything. So this is the landing, and Info
// keeps its own tab untouched (Mark, 2026-10-02: "new landing, leave info alone").
//
// **Every tile but Schedule is derived from the shell's existing read.** The shell already
// paid for the whole project row to display three fields, so the blob is handed down and
// each summary is arithmetic on it — no tile costs a query. Schedule items live in their
// own table and are the one extra read. That restraint is the point: twelve components in
// this directory already fetch the same project independently, and an overview that added
// eight more reads would have made that worse rather than better.
//
// Read-only on purpose. Nothing here writes, so none of it touches the page-held
// `updated_at` that guards blob saves — see `DrywallProjectShellContext.projectLegacy`.

import { useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { toast } from 'sonner'
import {
  computeMeasuredSqft,
  FIELD_VARIANCE_WARNING_PCT,
  quotedSqftWithWaste,
} from '@/lib/drywall/fieldMeasurementUtils'
import { computeContractValueFromLegacy } from '@/lib/drywall/contractValue'
import { resolveChangeOrderRequestedAmount } from '@/lib/drywall/changeOrderTotals'
import { formatDashboardCurrency } from '@/lib/drywall/dashboardCalculations'
import { toDateKey } from '@/lib/dateFormat'
import {
  getChangeOrdersFromLegacy,
  getOrdersFromLegacy,
  getProductionTimestampsFromLegacy,
  getQuoteOutcomeFromLegacy,
} from '@/services/drywallProjectsService'
import { fetchScheduleItemsForProject } from '@/services/scheduleService'
import type { DrywallProjectScheduleItem } from '@/services/scheduleService'
import type { FieldMeasurementArea } from '@/types/drywall'
import { DRYWALL_STATUS_LABELS, normalizeDrywallProjectStatus } from '@/types/drywall'
import type { KpiStatus } from '@/lib/drywall/dashboardCalculations'
import { KpiTile } from '@/components/drywall/dashboard/ui/KpiTile'
import type { DrywallProjectShellContext } from '@/components/drywall/DrywallProjectShell'

export interface OverviewTile {
  key: string
  title: string
  /** Null renders an em dash — a stage with nothing in it yet, not an error. */
  value: string | null
  caption: string
  status?: KpiStatus | null
  path: string
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function sqft(n: number): string {
  return `${Math.round(n).toLocaleString()} sqft`
}

/** Quote total and whether it has been agreed. */
export function quoteTile(legacy: Record<string, unknown>): OverviewTile {
  const { outcome } = getQuoteOutcomeFromLegacy(legacy)
  const contract = computeContractValueFromLegacy(legacy)
  const value = contract.baseContractValue

  // Outcome drives the colour rather than the amount: a big quote nobody accepted is not
  // good news, and a small approved one is not bad news.
  const status: KpiStatus | null =
    outcome === 'approved' ? 'green' : outcome === 'sent' ? 'yellow' : null

  return {
    key: 'quote',
    title: 'Quote',
    value: value == null || value === 0 ? null : formatDashboardCurrency(value),
    caption:
      outcome === 'approved'
        ? 'approved'
        : outcome === 'sent'
          ? 'sent, awaiting answer'
          : value
            ? 'draft, not sent'
            : 'nothing quoted yet',
    status,
    path: 'quote',
  }
}

/** Measured sqft, and how it compares with what was quoted. */
export function fieldTile(legacy: Record<string, unknown>): OverviewTile {
  const takeoff = record(legacy.fieldTakeoff)
  const storedTotal = Number(takeoff.totalMeasuredSqft)
  const measured =
    Number.isFinite(storedTotal) && storedTotal > 0
      ? storedTotal
      : computeMeasuredSqft(
          (Array.isArray(takeoff.measurements) ? takeoff.measurements : []) as FieldMeasurementArea[],
        )
  const quoted = quotedSqftWithWaste(record(legacy.quote))
  const reviewStatus = typeof takeoff.reviewStatus === 'string' ? takeoff.reviewStatus : null

  if (measured <= 0) {
    return {
      key: 'field',
      title: 'Field measurement',
      value: null,
      caption: 'not measured yet',
      status: null,
      path: 'field',
    }
  }

  // A measurement awaiting review is the actionable state, so it outranks the variance.
  if (reviewStatus === 'pending_review' || reviewStatus === 'rejected') {
    return {
      key: 'field',
      title: 'Field measurement',
      value: sqft(measured),
      caption: reviewStatus === 'pending_review' ? 'waiting on review' : 'rejected, needs redo',
      status: reviewStatus === 'pending_review' ? 'yellow' : 'red',
      path: 'field',
    }
  }

  if (quoted <= 0) {
    return {
      key: 'field',
      title: 'Field measurement',
      value: sqft(measured),
      caption: 'measured, nothing to compare',
      status: null,
      path: 'field',
    }
  }

  const variance = (measured - quoted) / quoted
  const pct = Math.abs(variance * 100)
  return {
    key: 'field',
    title: 'Field measurement',
    value: sqft(measured),
    caption:
      pct < 0.5
        ? 'matches the quote'
        : `${pct.toFixed(1)}% ${variance > 0 ? 'over' : 'under'} quoted sqft`,
    // Green inside the same tolerance the variance summary on the stage warns at, so the
    // tile and the stage cannot tell different stories; red at twice it.
    status:
      pct <= FIELD_VARIANCE_WARNING_PCT
        ? 'green'
        : pct <= FIELD_VARIANCE_WARNING_PCT * 2
          ? 'yellow'
          : 'red',
    path: 'field',
  }
}

/** Orders raised, and whether any are still sitting as drafts. */
export function orderTile(legacy: Record<string, unknown>): OverviewTile {
  const orders = getOrdersFromLegacy(legacy)
  if (orders.length === 0) {
    return {
      key: 'order',
      title: 'Orders',
      value: null,
      caption: 'nothing ordered',
      status: null,
      path: 'order',
    }
  }

  const drafts = orders.filter((o) => (o.status ?? 'draft') === 'draft').length
  const delivered = orders.filter((o) => o.status === 'complete').length

  return {
    key: 'order',
    title: 'Orders',
    value: String(orders.length),
    caption:
      drafts > 0
        ? `${drafts} still a draft`
        : delivered === orders.length
          ? 'all delivered'
          : delivered === 0
            ? 'placed, none delivered'
            : `${delivered} of ${orders.length} delivered`,
    // A draft order is one nobody has actually sent to a supplier.
    status: drafts > 0 ? 'yellow' : delivered === orders.length ? 'green' : null,
    path: 'order',
  }
}

/** Accepted change-order revenue, and anything still awaiting an answer. */
export function changeOrderTile(legacy: Record<string, unknown>): OverviewTile {
  const changeOrders = getChangeOrdersFromLegacy(legacy)
  if (changeOrders.length === 0) {
    return {
      key: 'change-orders',
      title: 'Change orders',
      value: null,
      caption: 'none raised',
      status: null,
      path: 'change-orders',
    }
  }

  const accepted = changeOrders.filter((co) => co.status === 'accepted')
  const pending = changeOrders.filter((co) => co.status === 'submitted').length
  const acceptedTotal = accepted.reduce((sum, co) => sum + resolveChangeOrderRequestedAmount(co), 0)

  return {
    key: 'change-orders',
    title: 'Change orders',
    // The money is the point — an accepted change order moves the contract value.
    value: acceptedTotal > 0 ? formatDashboardCurrency(acceptedTotal) : String(changeOrders.length),
    caption:
      pending > 0
        ? `${pending} awaiting an answer`
        : acceptedTotal > 0
          ? `${accepted.length} accepted`
          : `${changeOrders.length} raised, none accepted`,
    status: pending > 0 ? 'yellow' : null,
    path: 'change-orders',
  }
}

/**
 * Where the job is in its lifecycle.
 *
 * This used to show the contract value, and across all 179 live projects that was the same
 * number as the Quote tile on 172 of them — only five jobs have an accepted change order, so
 * "contract value" and "quote" differ almost never. Two of eight tiles saying one thing is a
 * waste of the only screen that is supposed to be readable at a glance, so the money stays on
 * Quote and this tile answers a question nothing else does: how far along is it.
 *
 * Margin is deliberately absent. It needs the labour, material and sub aggregation across
 * pay periods, which would cost more than the whole rest of this page; the stage computes it
 * properly.
 */
export function financialsTile(
  legacy: Record<string, unknown>,
  projectStatus: string,
): OverviewTile {
  const timestamps = getProductionTimestampsFromLegacy(legacy)
  const status = normalizeDrywallProjectStatus(projectStatus)
  const reached =
    timestamps.closedAt ?? timestamps.productionCompletedAt ?? timestamps.productionStartedAt

  const started = Boolean(timestamps.productionStartedAt) || status === 'production'

  return {
    key: 'financials',
    title: 'Financials',
    value: started || status === 'closed' ? DRYWALL_STATUS_LABELS[status] : null,
    caption: reached
      ? `since ${toDateKey(new Date(reached))}`
      : started
        ? 'in production'
        : 'production not started',
    status: status === 'closed' ? 'green' : null,
    path: 'financials',
  }
}

/**
 * Who the job is for.
 *
 * First attempt showed the purchase order, which read "no PO recorded" on **all 179 live
 * projects** — `legacy.poData` and `legacy.po` are present on none of them, so that intake
 * path either never ran or writes somewhere else. A tile that says the same empty thing on
 * every project is worse than no tile. The client is on every project that has a blob, and
 * the shell header shows the job name and address but never who it is for.
 */
export function infoTile(legacy: Record<string, unknown>): OverviewTile {
  const client = typeof legacy.client === 'string' ? legacy.client.trim() : ''
  return {
    key: 'info',
    title: 'Project info',
    value: client || null,
    caption: client ? 'customer' : 'no customer recorded',
    status: null,
    path: 'info',
  }
}

/** Field photos, which ride in the takeoff and so are free to count here. */
export function filesTile(legacy: Record<string, unknown>): OverviewTile {
  const takeoff = record(legacy.fieldTakeoff)
  const photos = Array.isArray(takeoff.photos) ? takeoff.photos.length : 0
  return {
    key: 'files',
    title: 'Photos and files',
    value: photos > 0 ? String(photos) : null,
    // Documents live in their own table; counting them would cost a query for a number
    // nobody acts on, so the tab shows them and the tile speaks only for what it knows.
    caption: photos > 0 ? 'field photos' : 'no field photos',
    status: null,
    path: 'files',
  }
}

export function scheduleTile(
  items: DrywallProjectScheduleItem[] | null,
  loading: boolean,
): OverviewTile {
  if (loading || items == null) {
    return {
      key: 'schedule',
      title: 'Schedule',
      value: null,
      caption: 'loading',
      status: null,
      path: 'schedule',
    }
  }

  if (items.length === 0) {
    return {
      key: 'schedule',
      title: 'Schedule',
      value: null,
      caption: 'nothing scheduled',
      status: null,
      path: 'schedule',
    }
  }

  const today = toDateKey(new Date())
  const upcoming = items
    .filter((item) => (item.end_date ?? item.start_date ?? '') >= today)
    .sort((a, b) => (a.start_date ?? '').localeCompare(b.start_date ?? ''))

  return {
    key: 'schedule',
    title: 'Schedule',
    value: String(items.length),
    caption:
      upcoming.length === 0
        ? 'all dates passed'
        : `next: ${upcoming[0].name ?? 'item'} ${upcoming[0].start_date ?? ''}`.trim(),
    status: null,
    path: 'schedule',
  }
}

export function ProjectOverviewPage() {
  const { projectId, projectStatus, projectLegacy } =
    useOutletContext<DrywallProjectShellContext>()

  const [scheduleItems, setScheduleItems] = useState<DrywallProjectScheduleItem[] | null>(null)
  const [scheduleLoading, setScheduleLoading] = useState(true)

  // The one read this page adds. Schedule items are their own table, so there is nothing in
  // the blob to derive them from.
  useEffect(() => {
    let cancelled = false
    setScheduleLoading(true)
    void fetchScheduleItemsForProject(projectId, { division: 'drywall' })
      .then((items) => {
        if (!cancelled) setScheduleItems(items)
      })
      .catch((e) => {
        if (cancelled) return
        setScheduleItems([])
        toast.error(e instanceof Error ? e.message : 'Failed to load the schedule')
      })
      .finally(() => {
        if (!cancelled) setScheduleLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  const tiles = useMemo<OverviewTile[]>(() => {
    if (!projectLegacy) return []
    return [
      quoteTile(projectLegacy),
      fieldTile(projectLegacy),
      scheduleTile(scheduleItems, scheduleLoading),
      orderTile(projectLegacy),
      changeOrderTile(projectLegacy),
      financialsTile(projectLegacy, projectStatus),
      infoTile(projectLegacy),
      filesTile(projectLegacy),
    ]
  }, [projectLegacy, projectStatus, scheduleItems, scheduleLoading])

  if (!projectLegacy) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center text-muted-foreground">
        <div className="inline-block size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Overview</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Where this job stands. Open any card for the stage behind it.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {tiles.map((tile) => (
          <KpiTile
            key={tile.key}
            to={`/drywall/projects/${projectId}/${tile.path}`}
            title={tile.title}
            value={tile.value}
            caption={tile.caption}
            status={tile.status}
          />
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Margin lives on{' '}
        <Link
          to={`/drywall/projects/${projectId}/financials`}
          className="underline hover:text-foreground"
        >
          Financials
        </Link>
        , which adds up labor, material and subs — too much to load for a card.
      </p>
    </div>
  )
}
