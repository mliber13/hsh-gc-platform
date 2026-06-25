import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { formatQuoteMoney } from '@/lib/drywall/quoteV3Math'

type Variant = 'material' | 'labor' | 'accessories' | 'total'

type Props = {
  value: number
  variant: Variant
  tooltip?: string
  showWasteHint?: boolean
  className?: string
}

export function CurrencyAmountCell({
  value,
  variant,
  tooltip,
  showWasteHint,
  className,
}: Props) {
  const isZero = !Number.isFinite(value) || value === 0

  const amount = (
    <span className="inline-flex flex-col items-end leading-tight">
      <span>{formatQuoteMoney(value)}</span>
      {showWasteHint && !isZero && (
        <span className="text-[9px] font-normal text-muted-foreground">incl. waste</span>
      )}
    </span>
  )

  const inner = tooltip ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex cursor-help rounded-sm underline decoration-dotted decoration-muted-foreground/40 underline-offset-2',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          )}
          aria-label={tooltip}
        >
          {amount}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-sm text-xs tabular-nums">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  ) : (
    amount
  )

  return (
    <td
      className={cn(
        'px-1.5 py-1 text-right tabular-nums',
        isZero && 'text-muted-foreground text-xs',
        !isZero && variant === 'material' && 'text-xs text-sky-700 dark:text-sky-400',
        !isZero && variant === 'labor' && 'text-xs text-amber-700 dark:text-amber-400',
        !isZero && variant === 'accessories' && 'text-xs text-violet-700 dark:text-violet-400',
        !isZero && variant === 'total' && 'text-sm font-semibold text-foreground',
        className,
      )}
    >
      {inner}
    </td>
  )
}
