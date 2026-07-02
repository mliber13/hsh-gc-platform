import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Props = {
  value: string
  label?: string
  sublabel?: ReactNode
  className?: string
}

export function BigStat({ value, label, sublabel, className }: Props) {
  return (
    <div className={cn('space-y-0.5', className)}>
      {label ? <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p> : null}
      <p className="text-2xl font-semibold tracking-tight tabular-nums md:text-3xl">{value}</p>
      {sublabel ? <p className="text-xs text-muted-foreground">{sublabel}</p> : null}
    </div>
  )
}
