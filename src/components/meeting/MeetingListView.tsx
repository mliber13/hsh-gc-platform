import { format, isBefore, parseISO, startOfDay } from 'date-fns'
import { Trash2 } from 'lucide-react'
import type {
  ActionItemStatus,
  MeetingActionItem,
  MeetingParkingLotItem,
  MeetingViewData,
} from '@/types/meeting'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ParkingRow, type ParkingRowHandlers } from '@/components/meeting/ParkingRow'

const statusOptions: ActionItemStatus[] = ['Open', 'In Progress', 'Done', 'Dropped']

function isOverdue(item: MeetingActionItem): boolean {
  if (!item.due_date) return false
  if (!(item.status === 'Open' || item.status === 'In Progress')) return false
  return isBefore(parseISO(item.due_date), startOfDay(new Date()))
}

export interface MeetingListViewProps {
  data: MeetingViewData
  sortedActionItems: MeetingActionItem[]
  deferredItems: MeetingParkingLotItem[]
  thisMeetingParkingItems: MeetingParkingLotItem[]
  ownerNameByLeadId: Map<string, string>
  meetingLeads: Array<{ lead_id: string; display_name: string }>
  isOperator: boolean
  canManageMeetingPrompts: boolean
  formattedMeetingDate: string
  onToggleLiveDiscuss: (leadId: string, promptId: string, currentValue: boolean) => void
  onAddActionItemClick: () => void
  onStatusChange: (id: string, status: ActionItemStatus) => void
  onDeleteRequest: (id: string) => void
  onParkItClick: () => void
  parkingRowHandlers: ParkingRowHandlers
  onToggleViewMode: () => void
}

export function MeetingListView({
  data,
  sortedActionItems,
  deferredItems,
  thisMeetingParkingItems,
  ownerNameByLeadId,
  isOperator,
  canManageMeetingPrompts,
  formattedMeetingDate,
  onToggleLiveDiscuss,
  onAddActionItemClick,
  onStatusChange,
  onDeleteRequest,
  onParkItClick,
  parkingRowHandlers,
  onToggleViewMode,
}: MeetingListViewProps) {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="mx-auto w-full max-w-4xl space-y-10">
        <div className="flex items-center justify-between gap-4">
          <Card className="flex-1 border-border/60 bg-card/50">
            <CardHeader>
              <CardTitle className="text-2xl">Meeting — {formattedMeetingDate}</CardTitle>
            </CardHeader>
          </Card>
          <Button type="button" variant="outline" size="sm" onClick={onToggleViewMode}>
            Slide view
          </Button>
        </div>

        <div className="space-y-12">
          {data.sections.map((section) => {
            const hasNoPrompts = section.prompts.length === 0
            const showNotSubmitted = !section.has_submission

            return (
              <section key={section.lead_id} className="space-y-6">
                <header className="space-y-1">
                  <h2 className="text-2xl font-semibold">{section.display_name}</h2>
                  <p className="text-sm text-muted-foreground">{section.area_label}</p>
                </header>

                {hasNoPrompts ? (
                  <p className="text-base text-muted-foreground">(no prompts configured)</p>
                ) : showNotSubmitted ? (
                  <div className="space-y-3">
                    <p className="text-base text-muted-foreground">
                      — not submitted; topics for verbal review —
                    </p>
                    <div className="space-y-2">
                      {section.prompts.map((prompt, index) => (
                        <p key={prompt.prompt_id} className="text-base text-muted-foreground">
                          {index + 1}. {prompt.question_text}
                        </p>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {section.prompts.map((prompt) => (
                      <article key={prompt.prompt_id} className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold text-foreground">
                            {prompt.question_text}
                          </h3>
                          {canManageMeetingPrompts ? (
                            <button
                              type="button"
                              onClick={() =>
                                void onToggleLiveDiscuss(
                                  section.lead_id,
                                  prompt.prompt_id,
                                  prompt.is_live_discuss,
                                )
                              }
                              className={
                                prompt.is_live_discuss
                                  ? 'rounded-md bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700 transition-colors hover:bg-amber-500/25 dark:text-amber-300'
                                  : 'rounded-md border border-dashed border-muted-foreground/40 px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-amber-500/60 hover:text-amber-700 dark:hover:text-amber-300'
                              }
                              title={
                                prompt.is_live_discuss
                                  ? 'Click to unmark live discussion'
                                  : 'Click to mark for live discussion'
                              }
                            >
                              {prompt.is_live_discuss ? 'Discuss live' : 'Mark live'}
                            </button>
                          ) : (
                            prompt.is_live_discuss && (
                              <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">
                                Discuss live
                              </span>
                            )
                          )}
                        </div>
                        <p
                          className={
                            prompt.is_live_discuss
                              ? 'text-base leading-relaxed text-amber-600 dark:text-amber-400'
                              : 'text-base leading-relaxed text-muted-foreground'
                          }
                        >
                          {!prompt.answer_text || prompt.answer_text.trim().length === 0
                            ? '—'
                            : prompt.answer_text}
                        </p>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )
          })}

          {/* Action Items */}
          <section className="space-y-6">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-2xl font-semibold">Action Items</h2>
              <Button type="button" onClick={onAddActionItemClick}>
                Add Action Item
              </Button>
            </div>

            {sortedActionItems.length === 0 ? (
              <p className="text-base text-muted-foreground">No action items yet.</p>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {sortedActionItems.length} items
                </p>
                <div className="overflow-x-auto rounded-lg border border-border/60 bg-card/50">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border/60 bg-muted/30 text-left text-xs font-medium text-muted-foreground">
                        <th className="px-3 py-2">Task</th>
                        <th className="px-3 py-2">Owner</th>
                        <th className="px-3 py-2">Due</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="w-12 px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {sortedActionItems.map((item) => (
                        <tr
                          key={item.id}
                          className="border-b border-border/60 last:border-b-0"
                        >
                          <td className="px-3 py-2 align-top">
                            <div className="space-y-1">
                              <p className="text-sm">{item.task}</p>
                              {item.notes && (
                                <p className="text-xs text-muted-foreground">{item.notes}</p>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 align-top text-sm">
                            {ownerNameByLeadId.get(item.owner_lead_id) ?? 'Unknown'}
                          </td>
                          <td
                            className={
                              isOverdue(item)
                                ? 'px-3 py-2 align-top text-sm text-destructive'
                                : item.due_date
                                  ? 'px-3 py-2 align-top text-sm'
                                  : 'px-3 py-2 align-top text-sm text-muted-foreground'
                            }
                          >
                            {item.due_date
                              ? format(parseISO(item.due_date), 'MMM d')
                              : '—'}
                          </td>
                          <td className="px-3 py-2 align-top">
                            <Select
                              value={item.status}
                              onValueChange={(value) =>
                                void onStatusChange(item.id, value as ActionItemStatus)
                              }
                            >
                              <SelectTrigger className="h-8 w-[150px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {statusOptions.map((status) => (
                                  <SelectItem key={status} value={status}>
                                    {status}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-3 py-2 align-top text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => onDeleteRequest(item.id)}
                            >
                              <Trash2 className="size-4" />
                              <span className="sr-only">Delete action item</span>
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          {/* Parking Lot */}
          <section className="space-y-6">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-2xl font-semibold">Parking Lot</h2>
              {isOperator && (
                <Button type="button" onClick={onParkItClick}>
                  Park it
                </Button>
              )}
            </div>

            {deferredItems.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Deferred from prior meetings ({deferredItems.length})
                </p>
                <div className="space-y-2">
                  {deferredItems.map((item) => (
                    <ParkingRow
                      key={item.id}
                      item={item}
                      ownerNameByLeadId={ownerNameByLeadId}
                      isOperator={isOperator}
                      handlers={parkingRowHandlers}
                    />
                  ))}
                </div>
              </div>
            )}

            {thisMeetingParkingItems.length === 0 && deferredItems.length === 0 ? (
              <p className="text-base text-muted-foreground">No parked topics yet.</p>
            ) : thisMeetingParkingItems.length > 0 ? (
              <div className="space-y-3">
                {deferredItems.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Parked this meeting ({thisMeetingParkingItems.length})
                  </p>
                )}
                <div className="space-y-2">
                  {thisMeetingParkingItems.map((item) => (
                    <ParkingRow
                      key={item.id}
                      item={item}
                      ownerNameByLeadId={ownerNameByLeadId}
                      isOperator={isOperator}
                      handlers={parkingRowHandlers}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  )
}
