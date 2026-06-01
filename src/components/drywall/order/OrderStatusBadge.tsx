import { cn } from '@/lib/utils'
import { ORDER_STATUS_CLASSES, orderStatusLabel } from '@/lib/drywall/orderConstants'

export function OrderStatusBadge({ status }: { status?: string }) {
  const key = status && status in ORDER_STATUS_CLASSES ? status : 'draft'
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        ORDER_STATUS_CLASSES[key],
      )}
    >
      {orderStatusLabel(status)}
    </span>
  )
}
