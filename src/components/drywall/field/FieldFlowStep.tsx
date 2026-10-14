// One step of the Field flow (docs/DRYWALL_PROJECT_IA.md §13): measure → approve measurement →
// approve labor rates → material orders. Done steps fold to a one-line summary; the current
// step is open; a step whose gate is not met says what it is waiting on.

import type { ReactNode } from 'react'
import { CheckCircle2, ChevronDown, ChevronRight, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'

export type FieldFlowStepState = 'done' | 'current' | 'locked' | 'todo'

interface FieldFlowStepProps {
  number: number
  title: string
  state: FieldFlowStepState
  /** One line shown when folded — what was decided, or what the step is waiting on. */
  summary?: ReactNode
  open: boolean
  onToggle: () => void
  children: ReactNode
}

const STATE_CLASS: Record<FieldFlowStepState, string> = {
  done: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  current: 'border-primary bg-primary text-primary-foreground',
  locked: 'border-border bg-muted text-muted-foreground',
  todo: 'border-border bg-background text-muted-foreground',
}

export function FieldFlowStep({ number, title, state, summary, open, onToggle, children }: FieldFlowStepProps) {
  return (
    <section className={cn('rounded-lg border', state === 'current' && 'border-primary/40')}>
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-full border text-sm font-semibold',
            STATE_CLASS[state],
          )}
        >
          {state === 'done' ? (
            <CheckCircle2 className="size-4" />
          ) : state === 'locked' ? (
            <Lock className="size-3.5" />
          ) : (
            number
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{title}</span>
          {summary ? <span className="block truncate text-sm text-muted-foreground">{summary}</span> : null}
        </span>
        {open ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
      </button>
      {open ? <div className="space-y-4 border-t px-4 py-4">{children}</div> : null}
    </section>
  )
}
