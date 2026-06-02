import { format, parseISO } from 'date-fns'
import { Trash2 } from 'lucide-react'
import type { MeetingParkingLotItem, ParkingLotStatus } from '@/types/meeting'
import { Button } from '@/components/ui/button'

export function statusPillClass(status: ParkingLotStatus): string {
  switch (status) {
    case 'open':
      return 'rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground'
    case 'discussed':
      return 'rounded-md bg-green-500/15 px-2 py-0.5 text-xs text-green-700 dark:text-green-300'
    case 'dropped':
      return 'rounded-md bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground line-through'
    case 'deferred':
      return 'rounded-md bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300'
    case 'converted':
      return 'rounded-md bg-blue-500/15 px-2 py-0.5 text-xs text-blue-700 dark:text-blue-300'
    case 'sidebar':
      return 'rounded-md bg-violet-500/15 px-2 py-0.5 text-xs text-violet-700 dark:text-violet-300'
    case 'sidebar_resolved':
      return 'rounded-md bg-green-500/15 px-2 py-0.5 text-xs text-green-700 dark:text-green-300'
    default:
      return 'rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground'
  }
}

export function statusLabel(status: ParkingLotStatus): string {
  switch (status) {
    case 'open': return 'Open'
    case 'discussed': return 'Discussed'
    case 'dropped': return 'Dropped'
    case 'deferred': return 'Deferred'
    case 'converted': return 'Converted'
    case 'sidebar': return 'Sidebar'
    case 'sidebar_resolved': return 'Sidebar resolved'
    default: return status
  }
}

export interface ParkingRowHandlers {
  onDiscuss: (id: string) => void
  onDefer: (id: string) => void
  onOpenConvertDialog: (item: MeetingParkingLotItem) => void
  onOpenSidebarDialog: (id: string) => void
  onOpenDropDialog: (id: string) => void
  onDeleteParkingItem: (id: string) => void
}

interface ParkingRowProps {
  item: MeetingParkingLotItem
  ownerNameByLeadId: Map<string, string>
  isOperator: boolean
  handlers: ParkingRowHandlers
}

export function ParkingRow({ item, ownerNameByLeadId, isOperator, handlers }: ParkingRowProps) {
  const raisedByName = item.raised_by_lead_id
    ? ownerNameByLeadId.get(item.raised_by_lead_id)
    : null
  const resolverName = item.sidebar_resolved_by_lead_id
    ? ownerNameByLeadId.get(item.sidebar_resolved_by_lead_id)
    : null
  const participantNames = item.sidebar_participants
    .map((pid) => ownerNameByLeadId.get(pid) ?? pid)
    .join(', ')

  return (
    <div className="rounded-lg border border-border/60 bg-card/50 p-3 space-y-2">
      <div className="flex flex-wrap items-start gap-2">
        <p className="flex-1 text-sm font-medium">{item.topic}</p>
        <span className={statusPillClass(item.status)}>{statusLabel(item.status)}</span>
        {isOperator && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => handlers.onDeleteParkingItem(item.id)}
          >
            <Trash2 className="size-3.5" />
            <span className="sr-only">Delete</span>
          </Button>
        )}
      </div>

      {raisedByName && (
        <p className="text-xs text-muted-foreground">Raised by: {raisedByName}</p>
      )}

      {item.status === 'sidebar' && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Sidebar — {participantNames}</p>
          {item.sidebar_note && (
            <p className="text-xs text-muted-foreground">Note: {item.sidebar_note}</p>
          )}
        </div>
      )}

      {item.status === 'sidebar_resolved' && (
        <div className="space-y-0.5">
          {resolverName && (
            <p className="text-xs text-muted-foreground">
              Resolved by {resolverName}
              {item.sidebar_resolved_at
                ? ` · ${format(parseISO(item.sidebar_resolved_at), 'MMM d')}`
                : ''}
            </p>
          )}
          {item.sidebar_note && (
            <p className="text-xs text-muted-foreground">Note: {item.sidebar_note}</p>
          )}
        </div>
      )}

      {item.status === 'converted' && item.action_item_id && (
        <p className="text-xs text-blue-700 dark:text-blue-300">→ Action item created</p>
      )}

      {item.status === 'dropped' && item.drop_reason && (
        <p className="text-xs text-muted-foreground">Reason: {item.drop_reason}</p>
      )}

      {isOperator && item.status === 'open' && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => handlers.onDiscuss(item.id)}
          >
            Discuss now
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => handlers.onDefer(item.id)}
          >
            Defer
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => handlers.onOpenConvertDialog(item)}
          >
            Convert
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => handlers.onOpenSidebarDialog(item.id)}
          >
            Sidebar
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => handlers.onOpenDropDialog(item.id)}
          >
            Drop
          </Button>
        </div>
      )}

      {isOperator && item.status === 'sidebar' && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => handlers.onOpenConvertDialog(item)}
          >
            Convert
          </Button>
        </div>
      )}
    </div>
  )
}
