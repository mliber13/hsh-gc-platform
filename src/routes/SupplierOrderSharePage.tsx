// ============================================================================
// Supplier view P3 — public, no-login order share page (/supplier/:token).
// Read-only order sheets for one supplier + PDF download + Confirm/Delivered actions.
// The token (URL param) is the only capability; all data/writes go through the
// supplier-order-share edge function.
// ============================================================================

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { downloadDrywallOrderPdf } from '@/lib/drywallOrderPdf'
import { groupOrderItemsByArea } from '@/lib/drywall/orderSuggest'
import {
  fetchSupplierShareOrders,
  supplierUpdateOrderStatus,
  type SupplierShareOrder,
} from '@/services/supplierShareService'
import type { DrywallOrder } from '@/types/drywall'
import hshLogo from '/HSH Contractor Logo - Color.png'

function formatDelivery(date: string | null): string {
  if (!date) return 'No date set'
  const d = new Date(date)
  return Number.isNaN(d.getTime())
    ? date
    : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

const STATUS_LABEL: Record<string, string> = {
  sent: 'Awaiting your confirmation',
  confirmed: 'Confirmed',
  partial: 'Partially delivered',
  complete: 'Delivered',
}

export function SupplierOrderSharePage() {
  const { token = '' } = useParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [supplierName, setSupplierName] = useState<string | null>(null)
  const [orders, setOrders] = useState<SupplierShareOrder[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const [sortBy, setSortBy] = useState<'action' | 'date'>('action')

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const sortedOrders = useMemo(() => {
    const deliveryKey = (r: SupplierShareOrder) => {
      if (!r.deliveryDate) return Number.POSITIVE_INFINITY
      const t = new Date(r.deliveryDate).getTime()
      return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t
    }
    // Needs-action first: awaiting confirmation → awaiting delivery → delivered.
    const actionRank: Record<string, number> = { sent: 0, confirmed: 1, partial: 1, complete: 2 }
    const copy = [...orders]
    copy.sort((a, b) => {
      if (sortBy === 'action') {
        const ra = actionRank[String(a.order.status ?? 'sent')] ?? 0
        const rb = actionRank[String(b.order.status ?? 'sent')] ?? 0
        if (ra !== rb) return ra - rb
      }
      return deliveryKey(a) - deliveryKey(b)
    })
    return copy
  }, [orders, sortBy])

  const allExpanded = sortedOrders.length > 0 && sortedOrders.every((r) => expanded.has(r.order.id))
  const toggleAll = () =>
    setExpanded(allExpanded ? new Set() : new Set(sortedOrders.map((r) => r.order.id)))

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchSupplierShareOrders(token)
      setSupplierName(data.supplierName)
      setOrders(data.orders)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'This link is not valid.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  const act = async (row: SupplierShareOrder, action: 'confirm' | 'deliver') => {
    setBusyId(row.order.id)
    setNotice('')
    try {
      await supplierUpdateOrderStatus(token, row.projectId, row.order.id, action)
      setNotice(action === 'confirm' ? 'Order confirmed — thank you.' : 'Marked delivered — thank you.')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusyId(null)
    }
  }

  const downloadPdf = (row: SupplierShareOrder) => {
    const order = row.order as DrywallOrder
    void downloadDrywallOrderPdf(
      {
        name: row.projectName,
        address: row.projectAddress || order.deliveryAddress || '',
        client: row.projectClient || '',
      },
      order,
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <div className="mb-6 flex items-center gap-3">
          <img src={hshLogo} alt="HSH Drywall" className="h-12 w-auto" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">HSH Drywall — Material Orders</h1>
            {supplierName ? <p className="text-sm text-gray-500">For {supplierName}</p> : null}
          </div>
        </div>

        {notice ? (
          <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            {notice}
          </div>
        ) : null}

        {loading ? (
          <p className="py-16 text-center text-sm text-gray-500">Loading orders…</p>
        ) : error ? (
          <div className="rounded-lg border bg-white p-8 text-center">
            <p className="font-medium text-gray-900">This link isn't available</p>
            <p className="mt-1 text-sm text-gray-500">{error}</p>
            <p className="mt-3 text-xs text-gray-400">
              Contact HSH Drywall at 330-614-1127 if you believe this is an error.
            </p>
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-lg border bg-white p-8 text-center text-sm text-gray-500">
            No open orders right now.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-sm text-gray-600">
                Sort:
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'action' | 'date')}
                  className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
                >
                  <option value="action">Needs action first</option>
                  <option value="date">Delivery date</option>
                </select>
              </label>
              <Button type="button" variant="outline" size="sm" onClick={toggleAll}>
                {allExpanded ? 'Collapse all' : 'Expand all'}
              </Button>
            </div>
            {sortedOrders.map((row) => {
              const order = row.order
              const status = String(order.status ?? 'sent')
              const busy = busyId === order.id
              const isOpen = expanded.has(order.id)
              const itemCount = order.items?.length ?? 0
              return (
                <div key={order.id} className="overflow-hidden rounded-lg border bg-white shadow-sm">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleExpanded(order.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        toggleExpanded(order.id)
                      }
                    }}
                    className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 hover:bg-gray-50"
                  >
                    <ChevronDown
                      className={
                        'h-4 w-4 shrink-0 text-gray-400 transition-transform ' +
                        (isOpen ? '' : '-rotate-90')
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-gray-900">{row.projectName}</p>
                      <p className="text-sm text-gray-500">
                        {order.orderNumber ? `${order.orderNumber} · ` : ''}Deliver{' '}
                        {formatDelivery(row.deliveryDate)} · {itemCount} item
                        {itemCount === 1 ? '' : 's'}
                      </p>
                    </div>
                    {status === 'sent' ? (
                      <Button
                        type="button"
                        size="sm"
                        className="shrink-0"
                        disabled={busy}
                        onClick={(e) => {
                          e.stopPropagation()
                          void act(row, 'confirm')
                        }}
                      >
                        {busy ? 'Saving…' : 'Confirm'}
                      </Button>
                    ) : status === 'confirmed' || status === 'partial' ? (
                      <Button
                        type="button"
                        size="sm"
                        className="shrink-0"
                        disabled={busy}
                        onClick={(e) => {
                          e.stopPropagation()
                          void act(row, 'deliver')
                        }}
                      >
                        {busy ? 'Saving…' : 'Mark delivered'}
                      </Button>
                    ) : (
                      <span className="shrink-0 text-sm font-medium text-green-700">✓ Delivered</span>
                    )}
                  </div>

                  {isOpen ? (
                   <>
                  <div className="border-t px-4 py-3">
                    {order.deliveryAddress ? (
                      <p className="mb-2 text-sm text-gray-600">
                        <span className="font-medium">Deliver to:</span> {order.deliveryAddress}
                      </p>
                    ) : null}

                    {order.items && order.items.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-left text-xs text-gray-500">
                              <th className="py-1 pr-2 font-medium">Item</th>
                              <th className="py-1 pr-2 font-medium">Qty</th>
                              <th className="py-1 font-medium">Unit</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              const itemGroups = groupOrderItemsByArea(order.items)
                              const showArea = itemGroups.length > 1
                              return itemGroups.map((group) => (
                                <Fragment key={group.area}>
                                  {showArea ? (
                                    <tr className="bg-gray-100">
                                      <td
                                        colSpan={3}
                                        className="py-1 text-xs font-semibold text-gray-700"
                                      >
                                        {group.area}
                                      </td>
                                    </tr>
                                  ) : null}
                                  {group.items.map((item) => (
                                    <tr key={item.id} className="border-b last:border-0">
                                      <td className="py-1.5 pr-2">
                                        {item.description || '—'}
                                        {item.notes ? (
                                          <span className="block text-xs text-gray-400">
                                            {item.notes}
                                          </span>
                                        ) : null}
                                      </td>
                                      <td className="py-1.5 pr-2 tabular-nums">
                                        {item.quantity || '—'}
                                      </td>
                                      <td className="py-1.5 text-gray-500">{item.unit || ''}</td>
                                    </tr>
                                  ))}
                                </Fragment>
                              ))
                            })()}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400">No line items.</p>
                    )}

                    {order.notes ? (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600">
                        <span className="font-medium">Notes:</span> {order.notes}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3">
                    <Button type="button" variant="outline" size="sm" onClick={() => downloadPdf(row)}>
                      Download PDF
                    </Button>
                  </div>
                   </>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}

        <p className="mt-8 text-center text-xs text-gray-400">
          HSH Drywall · 330-614-1127 · This page is read-only except confirming your orders.
        </p>
      </div>
    </div>
  )
}
