import type { DrywallOrderStatus } from '@/types/drywall'

export const DRYWALL_ORDER_STATUSES: DrywallOrderStatus[] = [
  'draft',
  'sent',
  'confirmed',
  'partial',
  'complete',
  'cancelled',
]

export const ORDER_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  confirmed: 'Confirmed',
  partial: 'Partial',
  complete: 'Complete',
  cancelled: 'Cancelled',
}

export const ORDER_STATUS_CLASSES: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground border-border',
  sent: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-200',
  confirmed: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-200',
  partial: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-200',
  complete: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-200',
  cancelled: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-200',
}

export const ORDER_UNIT_OPTIONS = ['pcs', 'sqft', 'box', 'roll', 'bag', 'tube', 'can', 'lf'] as const

export function normalizeOrderUnit(unit: string | undefined): string {
  const normalized = String(unit || '').trim().toLowerCase()
  return ORDER_UNIT_OPTIONS.includes(normalized as (typeof ORDER_UNIT_OPTIONS)[number])
    ? normalized
    : 'pcs'
}

export function orderStatusLabel(status: string | undefined): string {
  if (!status) return 'Draft'
  return ORDER_STATUS_LABELS[status] ?? status
}
