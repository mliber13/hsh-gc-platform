import { useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { projectColorClass } from '@/lib/drywall/projectColor'
import { cn } from '@/lib/utils'
import type { CrossProjectScheduleItem } from '@/services/drywallScheduleAggregateService'
import {
  phaseForScheduleItem,
  SCHEDULE_ITEM_STATUS_CLASS,
  SCHEDULE_ITEM_STATUS_LABELS,
  SCHEDULE_PHASE_DOT_CLASS,
} from '@/components/drywall/schedule/scheduleItemStatusStyles'

type Props = {
  items: CrossProjectScheduleItem[]
  personNames: Map<string, string>
  rangeLabel: string
  onItemClick: (item: CrossProjectScheduleItem) => void
}

function formatItemDates(item: CrossProjectScheduleItem): string {
  if (item.startDate === item.endDate) return item.startDate
  return `${item.startDate} → ${item.endDate}`
}

/** Compact, human date range for mobile cards (e.g. "Aug 4" or "Aug 4 → Aug 6"). */
function formatItemDatesShort(item: CrossProjectScheduleItem): string {
  const start = format(parseISO(item.startDate), 'MMM d')
  if (item.startDate === item.endDate) return start
  return `${start} → ${format(parseISO(item.endDate), 'MMM d')}`
}

function comparePortfolioItems(
  a: CrossProjectScheduleItem,
  b: CrossProjectScheduleItem,
): number {
  const byStart = a.startDate.localeCompare(b.startDate)
  if (byStart !== 0) return byStart
  const byProject = a.projectName.localeCompare(b.projectName)
  if (byProject !== 0) return byProject
  return a.name.localeCompare(b.name)
}

export function DrywallPortfolioList({ items, personNames, rangeLabel, onItemClick }: Props) {
  const sortedItems = useMemo(
    () => [...items].sort(comparePortfolioItems),
    [items],
  )

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Schedule items ({items.length})</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {sortedItems.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No schedule items for {rangeLabel}.
          </p>
        ) : (
          <>
            {/* Mobile: stacked cards (the wide table would force horizontal scroll). */}
            <div className="space-y-2 p-3 md:hidden">
              {sortedItems.map((item) => {
                const projectColors = projectColorClass(item.projectId)
                const phase = phaseForScheduleItem(item)
                const trulyUnassigned =
                  item.assignedPersons.length === 0 && !item.supplierId && !item.assignedCompanyId
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onItemClick(item)}
                    className="flex w-full flex-col gap-1.5 rounded-lg border bg-card p-3 text-left transition-colors active:bg-muted/50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className={cn(
                            'size-2.5 shrink-0 rounded-sm border',
                            projectColors.bg,
                            projectColors.border,
                          )}
                          aria-hidden
                        />
                        <span className="truncate text-sm font-medium">{item.projectName}</span>
                      </span>
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                          SCHEDULE_ITEM_STATUS_CLASS[item.status],
                        )}
                      >
                        {SCHEDULE_ITEM_STATUS_LABELS[item.status]}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'inline-block size-2.5 shrink-0 rounded-full',
                          SCHEDULE_PHASE_DOT_CLASS[phase],
                        )}
                        aria-hidden
                      />
                      <span className="text-sm font-medium">{item.name}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span className="tabular-nums">{formatItemDatesShort(item)}</span>
                      {trulyUnassigned ? (
                        <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 font-medium text-amber-600">
                          Unassigned
                        </span>
                      ) : item.assignedPersons.length > 0 ? (
                        item.assignedPersons.map((id) => (
                          <span
                            key={id}
                            className="rounded-full border bg-muted/40 px-1.5 py-0.5"
                          >
                            {personNames.get(id) ?? id}
                          </span>
                        ))
                      ) : (
                        <span className="rounded-full border bg-muted/40 px-1.5 py-0.5">
                          {item.supplierId ? 'Supplier assigned' : 'Sub assigned'}
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Desktop: full table. */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-left text-xs">
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Project</th>
                <th className="px-4 py-2 font-medium">Item</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Assigned</th>
              </tr>
            </thead>
            <tbody>
              {sortedItems.map((item) => {
                const projectColors = projectColorClass(item.projectId)
                const phase = phaseForScheduleItem(item)

                return (
                  <tr
                    key={item.id}
                    className="cursor-pointer border-b last:border-0 hover:bg-muted/10"
                    onClick={() => onItemClick(item)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onItemClick(item)
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {formatItemDates(item)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex max-w-[14rem] items-center gap-2">
                        <span
                          className={cn(
                            'size-2.5 shrink-0 rounded-sm border',
                            projectColors.bg,
                            projectColors.border,
                          )}
                          aria-hidden
                        />
                        <span className="truncate font-medium">{item.projectName}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className={cn(
                            'inline-block size-2.5 rounded-full',
                            SCHEDULE_PHASE_DOT_CLASS[phase],
                          )}
                          aria-hidden
                        />
                        {item.name}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-medium',
                          SCHEDULE_ITEM_STATUS_CLASS[item.status],
                        )}
                      >
                        {SCHEDULE_ITEM_STATUS_LABELS[item.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {item.assignedPersons.length === 0 ? (
                        <span className="text-muted-foreground text-xs">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {item.assignedPersons.map((id) => (
                            <span
                              key={id}
                              className="rounded-full border bg-muted/40 px-2 py-0.5 text-xs"
                            >
                              {personNames.get(id) ?? id}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
