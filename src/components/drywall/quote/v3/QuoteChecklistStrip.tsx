// The quote's checklist strip (quoteChecklist.ts) — where the quote stands, at a glance, with each
// item a shortcut to where it is fixed. Same feel as the Field steps and the close-out card.

import { AlertTriangle, CheckCircle2, Circle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { QuoteCheckItem, QuoteCheckKey, QuoteCheckState } from '@/lib/drywall/quoteChecklist'

const ICON: Record<QuoteCheckState, typeof CheckCircle2> = {
  done: CheckCircle2,
  todo: Circle,
  warn: AlertTriangle,
  bad: XCircle,
}

const TONE: Record<QuoteCheckState, string> = {
  done: 'border-emerald-500/30 bg-emerald-500/5 [&_svg]:text-emerald-600 dark:[&_svg]:text-emerald-400',
  todo: 'border-border bg-background [&_svg]:text-muted-foreground',
  warn: 'border-amber-500/40 bg-amber-500/10 [&_svg]:text-amber-600 dark:[&_svg]:text-amber-400',
  bad: 'border-red-500/40 bg-red-500/10 [&_svg]:text-red-600 dark:[&_svg]:text-red-400',
}

export function QuoteChecklistStrip({
  items,
  onSelect,
}: {
  items: QuoteCheckItem[]
  onSelect: (key: QuoteCheckKey) => void
}) {
  // The next thing to do gets a ring, so the eye lands on it first.
  const next = items.find((i) => i.state !== 'done')?.key

  return (
    <nav aria-label="Quote checklist" className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
      {items.map((item) => {
        const Icon = ICON[item.state]
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelect(item.key)}
            className={cn(
              'flex min-w-0 items-start gap-2 rounded-lg border px-3 py-2 text-left transition-colors hover:bg-muted/60',
              TONE[item.state],
              item.key === next && 'ring-2 ring-primary/40',
            )}
          >
            <Icon className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{item.label}</span>
              <span className="block truncate text-xs text-muted-foreground" title={item.detail}>
                {item.detail}
              </span>
            </span>
          </button>
        )
      })}
    </nav>
  )
}
