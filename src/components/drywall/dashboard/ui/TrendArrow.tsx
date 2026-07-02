import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'

type TrendDirection = 'up' | 'down' | 'flat'

type Props = {
  direction?: TrendDirection | null
  label?: string
  className?: string
}

const icons = {
  up: ArrowUpRight,
  down: ArrowDownRight,
  flat: ArrowRight,
}

const colors = {
  up: 'text-emerald-600 dark:text-emerald-400',
  down: 'text-rose-600 dark:text-rose-400',
  flat: 'text-muted-foreground',
}

/** Renders only when a real comparison basis exists — omit direction to hide. */
export function TrendArrow({ direction, label, className }: Props) {
  if (!direction) return null
  const Icon = icons[direction]
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium', colors[direction], className)}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label ? <span>{label}</span> : null}
    </span>
  )
}
