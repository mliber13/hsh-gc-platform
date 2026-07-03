import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePageTitle } from '@/contexts/PageTitleContext'
import { isQBConnected } from '@/services/quickbooksService'
import {
  fetchDrywallQbInvoices,
  setDrywallQbInvoiceStatus,
  sumIncludedQbInvoiceTotals,
  syncDrywallQbInvoices,
  type DrywallQbInvoice,
  type DrywallQbInvoiceReviewStatus,
} from '@/services/drywallQbRevenueService'
import {
  fetchDrywallQbMaterials,
  includedMaterialTotal,
  setDrywallQbMaterialStatus,
  syncDrywallQbMaterials,
  type DrywallQbMaterial,
  type DrywallQbMaterialReviewStatus,
} from '@/services/drywallQbMaterialsService'
import {
  formatQbCurrency,
  QbMaterialsReviewTable,
  QbReviewCollapsibleSection,
  QbRevenueReviewTable,
  type QbReviewStatus,
} from './DrywallQbReviewShared'

function groupByReviewStatus<T extends { reviewStatus: QbReviewStatus }>(rows: T[]) {
  return {
    pending: rows.filter((row) => row.reviewStatus === 'pending'),
    accepted: rows.filter((row) => row.reviewStatus === 'accepted'),
    rejected: rows.filter((row) => row.reviewStatus === 'rejected'),
  }
}

function ReviewSections<T extends { id: string; reviewStatus: QbReviewStatus }>({
  rows,
  statusBusyId,
  onStatus,
  renderTable,
}: {
  rows: T[]
  statusBusyId: string | null
  onStatus: (id: string, status: QbReviewStatus) => void
  renderTable: (props: {
    rows: T[]
    statusBusyId: string | null
    onStatus: (id: string, status: QbReviewStatus) => void
  }) => ReactNode
}) {
  const grouped = useMemo(() => groupByReviewStatus(rows), [rows])

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No rows yet. Run a sync to pull data from QuickBooks.
      </p>
    )
  }

  return (
    <div className="space-y-6">
      <QbReviewCollapsibleSection
        title="Needs review"
        rows={grouped.pending}
        defaultOpen
        statusBusyId={statusBusyId}
        onStatus={onStatus}
        renderTable={renderTable}
      />
      <QbReviewCollapsibleSection
        title="Included"
        rows={grouped.accepted}
        defaultOpen={grouped.pending.length === 0}
        statusBusyId={statusBusyId}
        onStatus={onStatus}
        renderTable={renderTable}
      />
      <QbReviewCollapsibleSection
        title="Excluded"
        rows={grouped.rejected}
        defaultOpen={false}
        statusBusyId={statusBusyId}
        onStatus={onStatus}
        renderTable={renderTable}
      />
    </div>
  )
}

export function DrywallQuickBooksPage() {
  usePageTitle('Drywall — QuickBooks')
  const [connected, setConnected] = useState<boolean | null>(null)
  const [invoices, setInvoices] = useState<DrywallQbInvoice[]>([])
  const [materials, setMaterials] = useState<DrywallQbMaterial[]>([])
  const [loading, setLoading] = useState(true)
  const [syncingRevenue, setSyncingRevenue] = useState(false)
  const [syncingMaterials, setSyncingMaterials] = useState(false)
  const [invoiceStatusBusyId, setInvoiceStatusBusyId] = useState<string | null>(null)
  const [materialStatusBusyId, setMaterialStatusBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qbOk = await isQBConnected()
      setConnected(qbOk)
      const [invoiceRows, materialRows] = await Promise.all([
        fetchDrywallQbInvoices(),
        fetchDrywallQbMaterials(),
      ])
      setInvoices(invoiceRows)
      setMaterials(materialRows)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load QuickBooks data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const includedRevenue = useMemo(() => sumIncludedQbInvoiceTotals(invoices), [invoices])
  const includedMaterials = useMemo(() => includedMaterialTotal(materials), [materials])

  const handleSyncRevenue = async () => {
    setSyncingRevenue(true)
    try {
      const result = await syncDrywallQbInvoices()
      toast.success(
        `Synced ${result.fetched} invoice${result.fetched === 1 ? '' : 's'} · ${result.matched} matched · ${result.unmatched} off-system · ${result.pendingReview} need review`,
      )
      await load()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Sync failed'
      if (msg.includes('not connected')) setConnected(false)
      toast.error(msg)
    } finally {
      setSyncingRevenue(false)
    }
  }

  const handleSyncMaterials = async () => {
    setSyncingMaterials(true)
    try {
      const result = await syncDrywallQbMaterials()
      toast.success(
        `Synced ${result.fetched} material row${result.fetched === 1 ? '' : 's'} · ${result.matched} in-app · ${result.offSystemMatched} off-system · ${result.pendingReview} need review`,
      )
      await load()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Sync failed'
      if (msg.includes('not connected')) setConnected(false)
      toast.error(msg)
    } finally {
      setSyncingMaterials(false)
    }
  }

  const handleInvoiceStatus = async (id: string, status: DrywallQbInvoiceReviewStatus) => {
    setInvoiceStatusBusyId(id)
    try {
      await setDrywallQbInvoiceStatus(id, status)
      setInvoices((prev) => prev.map((row) => (row.id === id ? { ...row, reviewStatus: status } : row)))
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to update status')
    } finally {
      setInvoiceStatusBusyId(null)
    }
  }

  const handleMaterialStatus = async (id: string, status: DrywallQbMaterialReviewStatus) => {
    setMaterialStatusBusyId(id)
    try {
      await setDrywallQbMaterialStatus(id, status)
      setMaterials((prev) => prev.map((row) => (row.id === id ? { ...row, reviewStatus: status } : row)))
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to update status')
    } finally {
      setMaterialStatusBusyId(null)
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
        <CardHeader>
          <CardTitle>QuickBooks</CardTitle>
          <CardDescription>
            Sync QB invoices and vendor material costs, triage every row as Included or Excluded.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {connected === false ? (
            <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
              QuickBooks is not connected.{' '}
              <Link
                to="/quickbooks/settings"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Connect QuickBooks
              </Link>{' '}
              in Settings, then return here to sync.
            </div>
          ) : null}

          <Tabs defaultValue="revenue">
            <TabsList>
              <TabsTrigger value="revenue">Revenue</TabsTrigger>
              <TabsTrigger value="materials">Materials</TabsTrigger>
            </TabsList>

            <TabsContent value="revenue" className="mt-6 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground">
                  Customer invoices for dashboard revenue pace.
                </p>
                <Button
                  type="button"
                  onClick={() => void handleSyncRevenue()}
                  disabled={syncingRevenue || !connected}
                >
                  {syncingRevenue ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 size-4" />
                  )}
                  Sync from QuickBooks
                </Button>
              </div>

              <div className="rounded-lg border bg-muted/20 px-4 py-3 text-sm">
                <span className="font-medium">Included revenue:</span>{' '}
                {formatQbCurrency(includedRevenue.totalAmt)} ({includedRevenue.count} invoice
                {includedRevenue.count === 1 ? '' : 's'}) ·{' '}
                <span className="text-muted-foreground">
                  AR: {formatQbCurrency(includedRevenue.balance)}
                </span>
              </div>

              <ReviewSections
                rows={invoices}
                statusBusyId={invoiceStatusBusyId}
                onStatus={(id, status) => void handleInvoiceStatus(id, status)}
                renderTable={(props) => <QbRevenueReviewTable {...props} />}
              />
            </TabsContent>

            <TabsContent value="materials" className="mt-6 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground">
                  Vendor bills and expenses tagged as Job Materials in QuickBooks.
                </p>
                <Button
                  type="button"
                  onClick={() => void handleSyncMaterials()}
                  disabled={syncingMaterials || !connected}
                >
                  {syncingMaterials ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 size-4" />
                  )}
                  Sync from QuickBooks
                </Button>
              </div>

              <div className="rounded-lg border bg-muted/20 px-4 py-3 text-sm">
                <span className="font-medium">Included materials:</span>{' '}
                {formatQbCurrency(includedMaterials.amount)} ({includedMaterials.count} row
                {includedMaterials.count === 1 ? '' : 's'})
              </div>

              <ReviewSections
                rows={materials}
                statusBusyId={materialStatusBusyId}
                onStatus={(id, status) => void handleMaterialStatus(id, status)}
                renderTable={(props) => <QbMaterialsReviewTable {...props} />}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
