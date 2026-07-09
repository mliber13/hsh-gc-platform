import { useMemo } from 'react'
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
      <CardContent className="overflow-x-auto p-0 sm:p-0">
        {sortedItems.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No schedule items for {rangeLabel}.
          </p>
        ) : (
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
        )}
      </CardContent>
    </Card>
  )
}
