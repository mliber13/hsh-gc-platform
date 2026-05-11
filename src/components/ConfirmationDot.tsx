import { useState } from 'react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { ConfirmationStatus } from '@/types'

interface ConfirmationDotProps {
  status: ConfirmationStatus
  onChange?: (newStatus: ConfirmationStatus) => void
  size?: 'sm' | 'md'
}

const STATUS_META: Record<ConfirmationStatus, {
  label: string
  description: string
  dotClassName: string
}> = {
  unsent: {
    label: 'Unsent',
    description: 'not sent yet',
    dotClassName: 'bg-slate-400 dark:bg-slate-500',
  },
  pending: {
    label: 'Pending',
    description: 'waiting on sub',
    dotClassName: 'bg-amber-500',
  },
  confirmed: {
    label: 'Confirmed',
    description: 'sub confirmed',
    dotClassName: 'bg-emerald-500',
  },
  declined: {
    label: 'Declined',
    description: 'sub declined',
    dotClassName: 'bg-rose-500',
  },
  'no-reply': {
    label: 'No reply',
    description: 'no response received',
    dotClassName: 'bg-orange-500',
  },
}

const statusOrder: ConfirmationStatus[] = [
  'unsent',
  'pending',
  'confirmed',
  'declined',
  'no-reply',
]

export function confirmationStatusLabel(status: ConfirmationStatus): string {
  return STATUS_META[status]?.label ?? 'Unsent'
}

export function ConfirmationDot({
  status,
  onChange,
  size = 'sm',
}: ConfirmationDotProps) {
  const [open, setOpen] = useState(false)
  const meta = STATUS_META[status] ?? STATUS_META.unsent
  const title = `${meta.label} - ${meta.description}`
  const dotClassName = cn(
    'inline-block shrink-0 rounded-full',
    size === 'md' ? 'size-2.5' : 'size-2',
    meta.dotClassName,
  )

  if (!onChange) {
    return <span className={dotClassName} title={title} aria-label={title} />
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex size-6 items-center justify-center rounded-full hover:bg-muted/60 focus:outline-none focus:ring-2 focus:ring-ring"
          title={title}
          aria-label={`Confirmation status: ${title}`}
        >
          <span className={dotClassName} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-48 p-2">
        <div className="space-y-1">
          {statusOrder.map((option) => {
            const optionMeta = STATUS_META[option]
            return (
              <button
                key={option}
                type="button"
                onClick={() => {
                  onChange(option)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted',
                  option === status && 'bg-muted text-foreground',
                )}
              >
                <span className={cn('size-2 rounded-full', optionMeta.dotClassName)} />
                <span>{optionMeta.label}</span>
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
