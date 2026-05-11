import { format, parseISO } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ConfirmationDot,
  confirmationStatusLabel,
} from '@/components/ConfirmationDot'
import type { PortfolioItem } from '@/services/scheduleService'

interface SchedulePortfolioItemModalProps {
  open: boolean
  onClose: () => void
  item: PortfolioItem | null
  projectName: string
}

export function SchedulePortfolioItemModal({
  open,
  onClose,
  item,
  projectName,
}: SchedulePortfolioItemModalProps) {
  const navigate = useNavigate()
  if (!item) return null

  const start = format(parseISO(item.start_date), 'MMM d, yyyy')
  const end = format(parseISO(item.end_date), 'MMM d, yyyy')

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{item.name}</DialogTitle>
          <DialogDescription>{projectName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="font-medium text-foreground">
              {start} – {end}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <ConfirmationDot status={item.confirmation_status} size="md" />
            <span className="text-foreground">
              {confirmationStatusLabel(item.confirmation_status)}
            </span>
          </div>

          <div className="text-muted-foreground">
            <span className="font-medium text-foreground">Assigned: </span>
            {item.assigned_company_name ?? 'Unassigned'}
          </div>

          {item.notes?.trim() && (
            <div className="text-muted-foreground">
              <div className="mb-1 font-medium text-foreground">Notes</div>
              <div className="whitespace-pre-wrap">{item.notes}</div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button
            onClick={() => {
              onClose()
              navigate(`/projects/${item.project_id}/schedule`)
            }}
          >
            Open in project schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
