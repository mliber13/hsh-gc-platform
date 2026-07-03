import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { usePageTitle } from '@/contexts/PageTitleContext'
import { cn } from '@/lib/utils'
import { isQBConnected } from '@/services/quickbooksService'
import {
  fetchDrywallQbInvoices,
  setDrywallQbInvoiceStatus,
  sumIncludedQbInvoiceTotals,
  syncDrywallQbInvoices,
  type DrywallQbInvoice,
  type DrywallQbInvoiceReviewStatus,
} from '@/services/drywallQbRevenueService'

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDate(iso: string | null): string {
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

function statusBadge(status: DrywallQbInvoiceReviewStatus) {
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

function rowLabel(row: DrywallQbInvoice): { title: string; subtitle: string | null; offSystem: boolean } {
  if (row.matchedProjectName) {
    return {
      title: row.matchedProjectName,
      subtitle: row.qbJobName ? `QB: ${row.qbJobName}` : null,
      offSystem: false,
    }
  }
  const title = row.qbJobName || row.qbCustomerName || 'Unknown QB job'
  return {
    title,
    subtitle: row.qbCustomerName && row.qbJobName ? row.qbCustomerName : null,
    offSystem: true,
  }
}

function InvoiceTable({
  rows,
  statusBusyId,
  onStatus,
}: {
  rows: DrywallQbInvoice[]
  statusBusyId: string | null
  onStatus: (id: string, status: DrywallQbInvoiceReviewStatus) => void
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
            const label = rowLabel(row)
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
                <td className="px-3 py-2 tabular-nums">{row.docNumber ?? '—'}</td>
                <td className="px-3 py-2 tabular-nums">{formatDate(row.txnDate)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(row.totalAmt)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(row.balance)}</td>
                <td className="px-3 py-2">{statusBadge(row.reviewStatus)}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant={row.reviewStatus === 'accepted' ? 'default' : 'outline'}
                      className={cn(
                        row.reviewStatus === 'accepted' &&
                          'bg-emerald-600 hover:bg-emerald-600/90 dark:bg-emerald-700',
                      )}
                      disabled={statusBusyId === row.id}
                      onClick={() => onStatus(row.id, 'accepted')}
                    >
                      Include
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={row.reviewStatus === 'rejected' ? 'secondary' : 'outline'}
                      disabled={statusBusyId === row.id}
                      onClick={() => onStatus(row.id, 'rejected')}
                    >
                      Exclude
                    </Button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function InvoiceSection({
  title,
  rows,
  defaultOpen,
  statusBusyId,
  onStatus,
}: {
  title: string
  rows: DrywallQbInvoice[]
  defaultOpen: boolean
  statusBusyId: string | null
  onStatus: (id: string, status: DrywallQbInvoiceReviewStatus) => void
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
      <CollapsibleContent>
        <InvoiceTable rows={rows} statusBusyId={statusBusyId} onStatus={onStatus} />
      </CollapsibleContent>
    </Collapsible>
  )
}

export function DrywallQuickBooksPage() {
  usePageTitle('Drywall — QuickBooks Revenue')
  const [connected, setConnected] = useState<boolean | null>(null)
  const [invoices, setInvoices] = useState<DrywallQbInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qbOk = await isQBConnected()
      setConnected(qbOk)
      const rows = await fetchDrywallQbInvoices()
      setInvoices(rows)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load QuickBooks invoices')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const grouped = useMemo(() => {
    const pending = invoices.filter((row) => row.reviewStatus === 'pending')
    const accepted = invoices.filter((row) => row.reviewStatus === 'accepted')
    const rejected = invoices.filter((row) => row.reviewStatus === 'rejected')
    return { pending, accepted, rejected }
  }, [invoices])

  const includedTotals = useMemo(() => sumIncludedQbInvoiceTotals(invoices), [invoices])

  const handleSync = async () => {
    setSyncing(true)
    try {
      const result = await syncDrywallQbInvoices()
      toast.success(
        `Synced ${result.fetched} invoice${result.fetched === 1 ? '' : 's'} · ${result.matched} matched · ${result.unmatched} off-system · ${result.pendingReview} need review`,
      )
      await load()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Sync failed'
      if (msg.includes('not connected')) {
        setConnected(false)
      }
      toast.error(msg)
    } finally {
      setSyncing(false)
    }
  }

  const handleStatus = async (id: string, status: DrywallQbInvoiceReviewStatus) => {
    setStatusBusyId(id)
    try {
      await setDrywallQbInvoiceStatus(id, status)
      setInvoices((prev) => prev.map((row) => (row.id === id ? { ...row, reviewStatus: status } : row)))
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to update status')
    } finally {
      setStatusBusyId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <Loader2 className="size-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle>QuickBooks Revenue</CardTitle>
            <CardDescription>
              Sync QB invoices, triage every row as Included or Excluded, and preview awarded
              revenue for the dashboard.
            </CardDescription>
          </div>
          <Button type="button" onClick={() => void handleSync()} disabled={syncing || !connected}>
            {syncing ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 size-4" />
            )}
            Sync from QuickBooks
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {connected === false ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
              QuickBooks is not connected.{' '}
              <Link
                to="/quickbooks/settings"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Connect QuickBooks
              </Link>{' '}
              in Settings, then return here to sync invoices.
            </div>
          ) : null}

          <div className="rounded-lg border bg-muted/20 px-4 py-3 text-sm">
            <span className="font-medium">Included revenue:</span>{' '}
            {formatCurrency(includedTotals.totalAmt)} ({includedTotals.count} invoice
            {includedTotals.count === 1 ? '' : 's'}) ·{' '}
            <span className="text-muted-foreground">AR: {formatCurrency(includedTotals.balance)}</span>
          </div>

          {invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No invoices yet. Run a sync to pull invoices from QuickBooks.
            </p>
          ) : (
            <div className="space-y-6">
              <InvoiceSection
                title="Needs review"
                rows={grouped.pending}
                defaultOpen
                statusBusyId={statusBusyId}
                onStatus={(id, status) => void handleStatus(id, status)}
              />
              <InvoiceSection
                title="Included"
                rows={grouped.accepted}
                defaultOpen={grouped.pending.length === 0}
                statusBusyId={statusBusyId}
                onStatus={(id, status) => void handleStatus(id, status)}
              />
              <InvoiceSection
                title="Excluded"
                rows={grouped.rejected}
                defaultOpen={false}
                statusBusyId={statusBusyId}
                onStatus={(id, status) => void handleStatus(id, status)}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
