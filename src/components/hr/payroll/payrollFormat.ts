import { format, parseISO } from 'date-fns'

export const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(n ?? 0)

/** e.g. May 13 – May 19, 2026 */
export function formatPayPeriodRange(start: string, end: string): string {
  const s = parseISO(start)
  const e = parseISO(end)
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
    return `${start} – ${end}`
  }
  if (s.getFullYear() === e.getFullYear()) {
    return `${format(s, 'MMM d')} – ${format(e, 'MMM d, yyyy')}`
  }
  return `${format(s, 'MMM d, yyyy')} – ${format(e, 'MMM d, yyyy')}`
}
