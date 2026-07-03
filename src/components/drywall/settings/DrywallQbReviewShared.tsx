import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

export type QbReviewStatus = 'pending' | 'accepted' | 'rejected'

export function formatQbCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatQbDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return iso
  }
}

export function qbReviewStatusBadge(status: QbReviewStatus) {
  if (status === 'accepted') {
    return (
      <span className="inline-flex rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
        Included
      </span>
    )
  }
  if (status === 'rejected') {
    return (
      <span className="inline-flex rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
        Excluded
      </span>
    )
  }
  return (
    <span className="inline-flex rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-200">
      Needs review
    </span>
  )
}

export function qbReviewRowLabel(row: {
  matchedProjectName: string | null
  qbJobName: string | null
  qbSecondaryName?: string | null
}): { title: string; subtitle: string | null; offSystem: boolean } {
  if (row.matchedProjectName) {
    return {
      title: row.matchedProjectName,
      subtitle: row.qbJobName ? `QB: ${row.qbJobName}` : null,
      offSystem: false,
    }
  }
  const title = row.qbJobName || row.qbSecondaryName || 'Unknown QB job'
  return {
    title,
    subtitle:
      row.qbSecondaryName && row.qbJobName && row.qbSecondaryName !== row.qbJobName
        ? row.qbSecondaryName
        : null,
    offSystem: true,
  }
}

function ReviewStatusActions({
  rowId,
  status,
  statusBusyId,
  onStatus,
}: {
  rowId: string
  status: QbReviewStatus
  statusBusyId: string | null
  onStatus: (id: string, status: QbReviewStatus) => void
}) {
  return (
    <div className="flex gap-1">
      <Button
        type="button"
        size="sm"
        variant={status === 'accepted' ? 'default' : 'outline'}
        className={cn(
          status === 'accepted' && 'bg-emerald-600 hover:bg-emerald-600/90 dark:bg-emerald-700',
        )}
        disabled={statusBusyId === rowId}
        onClick={() => onStatus(rowId, 'accepted')}
      >
        Include
      </Button>
      <Button
        type="button"
        size="sm"
        variant={status === 'rejected' ? 'secondary' : 'outline'}
        disabled={statusBusyId === rowId}
        onClick={() => onStatus(rowId, 'rejected')}
      >
        Exclude
      </Button>
    </div>
  )
}

function ReviewJobCell({
  label,
}: {
  label: ReturnType<typeof qbReviewRowLabel>
}) {
  return (
    <td className="px-3 py-2">
      <div className="font-medium">{label.title}</div>
      {label.offSystem ? (
        <span className="mt-0.5 inline-block text-xs text-muted-foreground">
          no HSH project — off-system
        </span>
      ) : null}
      {label.subtitle ? (
        <div className="text-xs text-muted-foreground">{label.subtitle}</div>
      ) : null}
    </td>
  )
}

export function QbRevenueReviewTable({
  rows,
  statusBusyId,
  onStatus,
}: {
  rows: Array<{
    id: string
    matchedProjectName: string | null
    qbJobName: string | null
    qbCustomerName: string | null
    docNumber: string | null
    txnDate: string | null
    totalAmt: number
    balance: number
    reviewStatus: QbReviewStatus
  }>
  statusBusyId: string | null
  onStatus: (id: string, status: QbReviewStatus) => void
}) {
  if (rows.length === 0) return null

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 font-medium">Job / project</th>
            <th className="px-3 py-2 font-medium">Doc #</th>
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium text-right">Total</th>
            <th className="px-3 py-2 font-medium text-right">Balance (AR)</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const label = qbReviewRowLabel({
              matchedProjectName: row.matchedProjectName,
              qbJobName: row.qbJobName,
              qbSecondaryName: row.qbCustomerName,
            })
            return (
              <tr
                key={row.id}
                className={cn(
                  'border-b last:border-b-0 transition-colors',
                  row.reviewStatus === 'accepted' && 'bg-emerald-500/5',
                  row.reviewStatus === 'rejected' && 'bg-muted/40 text-muted-foreground',
                  row.reviewStatus === 'pending' && 'bg-amber-500/5',
                )}
              >
                <ReviewJobCell label={label} />
                <td className="px-3 py-2 tabular-nums">{row.docNumber ?? '—'}</td>
                <td className="px-3 py-2 tabular-nums">{formatQbDate(row.txnDate)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatQbCurrency(row.totalAmt)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatQbCurrency(row.balance)}</td>
                <td className="px-3 py-2">{qbReviewStatusBadge(row.reviewStatus)}</td>
                <td className="px-3 py-2">
                  <ReviewStatusActions
                    rowId={row.id}
                    status={row.reviewStatus}
                    statusBusyId={statusBusyId}
                    onStatus={onStatus}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function QbMaterialsReviewTable({
  rows,
  statusBusyId,
  onStatus,
}: {
  rows: Array<{
    id: string
    matchedProjectName: string | null
    qbJobName: string | null
    vendorName: string | null
    docNumber: string | null
    txnDate: string | null
    amount: number
    reviewStatus: QbReviewStatus
  }>
  statusBusyId: string | null
  onStatus: (id: string, status: QbReviewStatus) => void
}) {
  if (rows.length === 0) return null

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 font-medium">Job / project</th>
            <th className="px-3 py-2 font-medium">Vendor</th>
            <th className="px-3 py-2 font-medium">Doc #</th>
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium text-right">Amount</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const label = qbReviewRowLabel({
              matchedProjectName: row.matchedProjectName,
              qbJobName: row.qbJobName,
              qbSecondaryName: row.vendorName,
            })
            return (
              <tr
                key={row.id}
                className={cn(
                  'border-b last:border-b-0 transition-colors',
                  row.reviewStatus === 'accepted' && 'bg-emerald-500/5',
                  row.reviewStatus === 'rejected' && 'bg-muted/40 text-muted-foreground',
                  row.reviewStatus === 'pending' && 'bg-amber-500/5',
                )}
              >
                <ReviewJobCell label={label} />
                <td className="px-3 py-2">{row.vendorName ?? '—'}</td>
                <td className="px-3 py-2 tabular-nums">{row.docNumber ?? '—'}</td>
                <td className="px-3 py-2 tabular-nums">{formatQbDate(row.txnDate)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatQbCurrency(row.amount)}</td>
                <td className="px-3 py-2">{qbReviewStatusBadge(row.reviewStatus)}</td>
                <td className="px-3 py-2">
                  <ReviewStatusActions
                    rowId={row.id}
                    status={row.reviewStatus}
                    statusBusyId={statusBusyId}
                    onStatus={onStatus}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function QbReviewCollapsibleSection<T extends { id: string; reviewStatus: QbReviewStatus }>({
  title,
  rows,
  defaultOpen,
  statusBusyId,
  onStatus,
  renderTable,
}: {
  title: string
  rows: T[]
  defaultOpen: boolean
  statusBusyId: string | null
  onStatus: (id: string, status: QbReviewStatus) => void
  renderTable: (props: {
    rows: T[]
    statusBusyId: string | null
    onStatus: (id: string, status: QbReviewStatus) => void
  }) => ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  if (rows.length === 0) return null

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="mb-2 w-full justify-between px-0 hover:bg-transparent">
          <span className="text-sm font-semibold">
            {title} ({rows.length})
          </span>
          <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>{renderTable({ rows, statusBusyId, onStatus })}</CollapsibleContent>
    </Collapsible>
  )
}
