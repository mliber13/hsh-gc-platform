// ============================================================================
// Supplier view P2 — cross-project material order board.
// One office view of every material order across drywall projects, grouped by
// supplier, filterable, sorted by delivery date. Read-only; rows open the order.
// ============================================================================

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Truck, Search, ChevronRight, Link2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { usePageTitle } from '@/contexts/PageTitleContext'
import { DRYWALL_ORDER_STATUSES, ORDER_STATUS_LABELS } from '@/lib/drywall/orderConstants'
import { OrderStatusBadge } from '@/components/drywall/order/OrderStatusBadge'
import {
  fetchSupplierOrders,
  fetchSupplierUpcoming,
  type SupplierOrderRow,
  type SupplierUpcomingRow,
} from '@/services/supplierOrdersService'
import { getOrCreateSupplierShareLink } from '@/services/supplierShareService'

const NO_SUPPLIER = '__none__'

function supplierKey(row: SupplierOrderRow): string {
  return row.supplierId || row.supplier?.trim() || NO_SUPPLIER
}

function supplierLabel(row: SupplierOrderRow): string {
  return row.supplier?.trim() || 'No supplier'
}

/** Sort key: soonest delivery first; undated orders sink to the bottom. */
function deliverySortKey(row: SupplierOrderRow): number {
  if (!row.deliveryDate) return Number.POSITIVE_INFINITY
  const t = new Date(row.deliveryDate).getTime()
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t
}

function formatDelivery(date: string | null): { label: string; soon: boolean; overdue: boolean } {
  if (!date) return { label: 'No date', soon: false, overdue: false }
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return { label: date, soon: false, overdue: false }
  const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diffDays = Math.round((d.getTime() - today.getTime()) / 86_400_000)
  return { label, soon: diffDays >= 0 && diffDays <= 7, overdue: diffDays < 0 }
}

export function DrywallSupplierOrdersPage() {
  usePageTitle('Supplier Orders')
  const navigate = useNavigate()

  const [orders, setOrders] = useState<SupplierOrderRow[]>([])
  const [upcoming, setUpcoming] = useState<SupplierUpcomingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [supplierFilter, setSupplierFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      const [rows, up] = await Promise.all([fetchSupplierOrders(), fetchSupplierUpcoming()])
      if (!cancelled) {
        setOrders(rows)
        setUpcoming(up)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Distinct suppliers present in the orders (for the filter dropdown).
  const supplierOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const o of orders) {
      const key = supplierKey(o)
      if (!seen.has(key)) seen.set(key, supplierLabel(o))
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [orders])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return orders.filter((o) => {
      if (supplierFilter !== 'all' && supplierKey(o) !== supplierFilter) return false
      if (statusFilter !== 'all' && (o.status || 'draft') !== statusFilter) return false
      if (q) {
        const hay = `${o.projectName} ${o.orderNumber ?? ''} ${o.supplier ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [orders, supplierFilter, statusFilter, search])

  // Group filtered rows by supplier, each group's rows sorted by delivery date.
  const [copyingId, setCopyingId] = useState<string | null>(null)

  const copyShareLink = async (supplierId: string, label: string) => {
    setCopyingId(supplierId)
    try {
      const url = await getOrCreateSupplierShareLink(supplierId)
      await navigator.clipboard.writeText(url)
      toast.success(`Share link for ${label} copied to clipboard`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create share link')
    } finally {
      setCopyingId(null)
    }
  }

  const groups = useMemo(() => {
    const byKey = new Map<
      string,
      { label: string; supplierId: string | null; rows: SupplierOrderRow[] }
    >()
    for (const o of filtered) {
      const key = supplierKey(o)
      let g = byKey.get(key)
      if (!g) {
        g = { label: supplierLabel(o), supplierId: o.supplierId, rows: [] }
        byKey.set(key, g)
      }
      g.rows.push(o)
    }
    const arr = [...byKey.values()]
    for (const g of arr) g.rows.sort((a, b) => deliverySortKey(a) - deliverySortKey(b))
    arr.sort((a, b) => a.label.localeCompare(b.label))
    return arr
  }, [filtered])

  const upcomingFiltered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return upcoming.filter((u) => {
      if (supplierFilter !== 'all' && (u.supplierId ?? NO_SUPPLIER) !== supplierFilter) return false
      if (q) {
        const hay = `${u.projectName} ${u.itemName} ${u.supplierName ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [upcoming, supplierFilter, search])

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <Truck className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold">Supplier Orders</h1>
          <p className="text-sm text-muted-foreground">
            Every material order across drywall projects, grouped by supplier.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search project, order #, supplier…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-card/50"
          />
        </div>
        <Select value={supplierFilter} onValueChange={setSupplierFilter}>
          <SelectTrigger className="w-full sm:w-[200px] bg-card/50">
            <SelectValue placeholder="All suppliers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All suppliers</SelectItem>
            {supplierOptions.map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[170px] bg-card/50">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {DRYWALL_ORDER_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {ORDER_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!loading && upcomingFiltered.length > 0 ? (
        <Card className="border-dashed">
          <div className="border-b px-4 py-2.5">
            <h2 className="text-sm font-semibold text-muted-foreground">
              Upcoming — estimate (not yet ordered)
            </h2>
          </div>
          <div className="divide-y">
            {upcomingFiltered.map((u) => (
              <button
                key={u.itemId}
                type="button"
                onClick={() => navigate(`/drywall/projects/${u.projectId}/schedule`)}
                className="grid w-full grid-cols-12 items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-muted/50"
              >
                <span className="col-span-5 min-w-0 truncate font-medium sm:col-span-4">
                  {u.projectName}
                </span>
                <span className="col-span-4 truncate text-muted-foreground sm:col-span-4">
                  {u.itemName}
                  {u.supplierName ? ` · ${u.supplierName}` : ''}
                </span>
                <span className="col-span-3 tabular-nums text-muted-foreground sm:col-span-2">
                  {formatDelivery(u.stockDate).label}
                </span>
                <span className="hidden text-right text-muted-foreground sm:col-span-2 sm:inline">
                  {u.quotedSqft != null ? `~${u.quotedSqft.toLocaleString()} sqft` : '—'}
                </span>
              </button>
            ))}
          </div>
        </Card>
      ) : null}

      {loading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading orders…</p>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {orders.length === 0
              ? 'No material orders yet.'
              : 'No orders match these filters.'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <Card key={group.label}>
              <div className="flex items-center justify-between border-b px-4 py-2.5">
                <h2 className="font-semibold">{group.label}</h2>
                <div className="flex items-center gap-3">
                  {group.supplierId ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      disabled={copyingId === group.supplierId}
                      onClick={() => void copyShareLink(group.supplierId!, group.label)}
                    >
                      <Link2 className="h-3.5 w-3.5" />
                      {copyingId === group.supplierId ? 'Copying…' : 'Copy supplier link'}
                    </Button>
                  ) : null}
                  <span className="text-xs text-muted-foreground">
                    {group.rows.length} order{group.rows.length === 1 ? '' : 's'}
                  </span>
                </div>
              </div>
              <div className="divide-y">
                {group.rows.map((o) => {
                  const del = formatDelivery(o.deliveryDate)
                  return (
                    <button
                      key={o.orderId}
                      type="button"
                      onClick={() => navigate(`/drywall/projects/${o.projectId}/order`)}
                      className="grid w-full grid-cols-12 items-center gap-2 px-4 py-3 text-left text-sm hover:bg-muted/50"
                    >
                      <span className="col-span-5 min-w-0 sm:col-span-4">
                        <span className="block truncate font-medium">{o.projectName}</span>
                        {o.scheduleItemName ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            {o.scheduleItemName}
                          </span>
                        ) : null}
                      </span>
                      <span className="col-span-3 truncate text-muted-foreground sm:col-span-2">
                        {o.orderNumber || '—'}
                      </span>
                      <span
                        className={
                          'col-span-2 tabular-nums sm:col-span-2 ' +
                          (del.overdue
                            ? 'font-medium text-red-600'
                            : del.soon
                              ? 'font-medium text-amber-600'
                              : 'text-muted-foreground')
                        }
                      >
                        {del.label}
                      </span>
                      <span className="hidden text-muted-foreground sm:col-span-2 sm:inline">
                        {o.itemCount} item{o.itemCount === 1 ? '' : 's'}
                      </span>
                      <span className="col-span-2 flex items-center justify-end gap-1 sm:col-span-2">
                        <OrderStatusBadge status={o.status} />
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </span>
                    </button>
                  )
                })}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
