import { useState } from 'react'
import { format, isBefore, parseISO, startOfDay } from 'date-fns'
import { ChevronsUpDown } from 'lucide-react'
import type { MeetingActionItem } from '@/types/meeting'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

function isOverdue(item: MeetingActionItem): boolean {
  if (!item.due_date) return false
  if (!(item.status === 'Open' || item.status === 'In Progress')) return false
  return isBefore(parseISO(item.due_date), startOfDay(new Date()))
}

interface ActionItemsSummarySlideProps {
  actionItems: MeetingActionItem[]
  ownerNameByLeadId: Map<string, string>
}

export function ActionItemsSummarySlide({
  actionItems,
  ownerNameByLeadId,
}: ActionItemsSummarySlideProps) {
  const [completedOpen, setCompletedOpen] = useState(false)

  const today = startOfDay(new Date())

  const activeItems = actionItems
    .filter((item) => item.status === 'Open' || item.status === 'In Progress')
    .sort((a, b) => {
      const aOverdue = a.due_date ? isBefore(parseISO(a.due_date), today) : false
      const bOverdue = b.due_date ? isBefore(parseISO(b.due_date), today) : false
      if (aOverdue !== bOverdue) return aOverdue ? -1 : 1
      if (!a.due_date && !b.due_date) return 0
      if (!a.due_date) return 1
      if (!b.due_date) return -1
      return a.due_date.localeCompare(b.due_date)
    })

  const completedItems = actionItems
    .filter((item) => item.status === 'Done' || item.status === 'Dropped')
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))

  const renderRow = (item: MeetingActionItem) => {
    const overdue = isOverdue(item)
    return (
      <tr key={item.id} className="border-b border-border/60 last:border-b-0">
        <td className="px-3 py-2.5 align-top">
          <div className="space-y-0.5">
            <p className="text-sm">{item.task}</p>
            {item.notes && (
              <p className="text-xs text-muted-foreground">
                {item.notes.length > 80 ? `${item.notes.slice(0, 80)}…` : item.notes}
              </p>
            )}
          </div>
        </td>
        <td className="px-3 py-2.5 align-top text-sm text-muted-foreground">
          {ownerNameByLeadId.get(item.owner_lead_id) ?? 'Unknown'}
        </td>
        <td
          className={
            overdue
              ? 'px-3 py-2.5 align-top text-sm text-destructive'
              : item.due_date
                ? 'px-3 py-2.5 align-top text-sm'
                : 'px-3 py-2.5 align-top text-sm text-muted-foreground'
          }
        >
          {item.due_date ? format(parseISO(item.due_date), 'MMM d') : '—'}
        </td>
        <td className="px-3 py-2.5 align-top">
          <span
            className={
              item.status === 'Open'
                ? 'rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground'
                : item.status === 'In Progress'
                  ? 'rounded-md bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300'
                  : item.status === 'Done'
                    ? 'rounded-md bg-green-500/15 px-2 py-0.5 text-xs text-green-700 dark:text-green-300'
                    : 'rounded-md bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground'
            }
          >
            {item.status}
          </span>
        </td>
      </tr>
    )
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-6 py-8">
      <div className="space-y-1">
        <h2 className="text-3xl font-semibold">Action Items</h2>
        <p className="text-base text-muted-foreground">
          {actionItems.length} total · {activeItems.length} open
        </p>
      </div>

      {activeItems.length === 0 ? (
        <p className="text-lg text-muted-foreground">No open action items.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border/60 bg-card/50">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/30 text-left text-xs font-medium text-muted-foreground">
                <th className="px-3 py-2">Task</th>
                <th className="px-3 py-2">Owner</th>
                <th className="px-3 py-2">Due</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>{activeItems.map(renderRow)}</tbody>
          </table>
        </div>
      )}

      {completedItems.length > 0 && (
        <Collapsible open={completedOpen} onOpenChange={setCompletedOpen} className="space-y-3">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronsUpDown className="size-4" />
              Completed ({completedItems.length})
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="overflow-x-auto rounded-lg border border-border/60 bg-card/50">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/30 text-left text-xs font-medium text-muted-foreground">
                    <th className="px-3 py-2">Task</th>
                    <th className="px-3 py-2">Owner</th>
                    <th className="px-3 py-2">Due</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>{completedItems.map(renderRow)}</tbody>
              </table>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  )
}
