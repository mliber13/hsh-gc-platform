import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Props = {
  value: string
  label?: string
  sublabel?: ReactNode
  size?: 'sm' | 'default' | 'lg'
  className?: string
}

const VALUE_SIZE_CLASS: Record<NonNullable<Props['size']>, string> = {
  sm: 'text-xl md:text-2xl',
  default: 'text-2xl md:text-3xl',
  lg: 'text-3xl md:text-4xl',
}

export function BigStat({ value, label, sublabel, size = 'default', className }: Props) {
  return (
    <div className={cn('space-y-0.5', className)}>
      {label ? <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p> : null}
      <p
        className={cn('font-semibold tracking-tight tabular-nums', VALUE_SIZE_CLASS[size])}
      >
        {value}
      </p>
      {sublabel ? <p className="text-xs text-muted-foreground">{sublabel}</p> : null}
    </div>
  )
}
