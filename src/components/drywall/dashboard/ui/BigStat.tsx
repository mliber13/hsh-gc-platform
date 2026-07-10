import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Props = {
  value: string
  label?: string
  sublabel?: ReactNode
  size?: 'default' | 'lg'
  className?: string
}

export function BigStat({ value, label, sublabel, size = 'default', className }: Props) {
  return (
    <div className={cn('space-y-0.5', className)}>
      {label ? <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p> : null}
      <p
        className={cn(
          'font-semibold tracking-tight tabular-nums',
          size === 'lg' ? 'text-3xl md:text-4xl' : 'text-2xl md:text-3xl',
        )}
      >
        {value}
      </p>
      {sublabel ? <p className="text-xs text-muted-foreground">{sublabel}</p> : null}
    </div>
  )
}
