import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatQuoteMoney } from '@/lib/drywall/quoteV3Math'
import type { AccessoryComputation } from '@/lib/drywall/quoteV3Accessories'
import { cn } from '@/lib/utils'

type Props = {
  total: number
  items: AccessoryComputation[]
  showWasteHint?: boolean
  className?: string
}

export function AccessoryBreakdownPopover({
  total,
  items,
  showWasteHint,
  className,
}: Props) {
  const isZero = !Number.isFinite(total) || total === 0

  const amount = (
    <span className="inline-flex flex-col items-end leading-tight">
      <span>{formatQuoteMoney(total)}</span>
      {showWasteHint && !isZero && (
        <span className="text-[9px] font-normal text-muted-foreground">incl. waste</span>
      )}
    </span>
  )

  if (isZero || items.length === 0) {
    return (
      <span className={cn('tabular-nums text-muted-foreground text-xs', className)}>
        {formatQuoteMoney(0)}
      </span>
    )
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex cursor-pointer rounded-sm underline decoration-dotted decoration-muted-foreground/40 underline-offset-2',
            'text-xs text-violet-700 dark:text-violet-400 tabular-nums',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            className,
          )}
          aria-label="View accessory breakdown"
        >
          {amount}
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-80 p-3 text-xs">
        <p className="mb-2 font-medium">Accessory breakdown</p>
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li key={`${item.catalogEntryId}-${item.units}`} className="flex justify-between gap-2">
              <span className="text-muted-foreground">
                {item.display_name}
                <span className="block text-[10px]">
                  {item.units} {item.unit} × {formatQuoteMoney(item.unitRate)}
                </span>
              </span>
              <span className="shrink-0 font-medium tabular-nums">{formatQuoteMoney(item.cost)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex justify-between border-t pt-2 font-semibold tabular-nums">
          <span>Total</span>
          <span>{formatQuoteMoney(total)}</span>
        </div>
      </PopoverContent>
    </Popover>
  )
}
