import { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Package } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { OrderStatusBadge } from '@/components/drywall/order/OrderStatusBadge'
import {
  fetchSupplierOrders,
  type SupplierOrderRow,
} from '@/services/supplierOrdersService'

type Props = {
  projectId: string
}

export function CrewOrderStatusCard({ projectId }: Props) {
  const [orders, setOrders] = useState<SupplierOrderRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void fetchSupplierOrders()
      .then((rows) => {
        if (cancelled) return
        setOrders(rows.filter((r) => r.projectId === projectId))
      })
      .catch(() => {
        if (!cancelled) setOrders([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  if (loading) {
    return (
      <Card>
        <CardContent className="py-4 text-sm text-muted-foreground">Loading orders…</CardContent>
      </Card>
    )
  }

  if (orders.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="size-4" />
            Orders / delivery
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No material orders on this project yet.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Package className="size-4" />
          Orders / delivery
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {orders.map((order) => (
          <div key={order.orderId} className="rounded-lg border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">
                {order.orderNumber?.trim() || order.supplier?.trim() || 'Order'}
              </p>
              <OrderStatusBadge status={order.status} />
            </div>
            {order.supplier?.trim() && order.orderNumber?.trim() ? (
              <p className="mt-1 text-muted-foreground">{order.supplier}</p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
              <span>
                Delivery:{' '}
                {order.deliveryDate
                  ? format(parseISO(order.deliveryDate), 'EEE MMM d')
                  : '—'}
              </span>
              <span>
                {order.itemCount} item{order.itemCount === 1 ? '' : 's'}
              </span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
