import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DrywallScheduleCascadeError,
  generateStandardDrywallSchedule,
} from '@/services/scheduleService'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  onGenerated: () => void
}

export function GenerateStandardScheduleDialog({
  open,
  onOpenChange,
  projectId,
  onGenerated,
}: Props) {
  const [measureDate, setMeasureDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [generating, setGenerating] = useState(false)

  const handleGenerate = async () => {
    if (!measureDate) {
      toast.error('Measure date is required')
      return
    }
    setGenerating(true)
    try {
      await generateStandardDrywallSchedule(projectId, measureDate)
      toast.success('Standard schedule created')
      onGenerated()
      onOpenChange(false)
    } catch (e) {
      if (e instanceof DrywallScheduleCascadeError) {
        toast.warning(e.message)
      } else {
        toast.error(e instanceof Error ? e.message : 'Failed to generate schedule')
      }
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generate standard schedule</DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground text-sm">
          Creates Measure → Stock → Scaffold / Prep → Hang → Finish → Cleanout with default
          predecessor lags. You can edit any item afterward.
        </p>
        <div className="space-y-1.5 py-2">
          <Label htmlFor="measure-date">Measure date</Label>
          <Input
            id="measure-date"
            type="date"
            value={measureDate}
            onChange={(e) => setMeasureDate(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleGenerate()} disabled={generating}>
            {generating ? 'Generating…' : 'Generate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
