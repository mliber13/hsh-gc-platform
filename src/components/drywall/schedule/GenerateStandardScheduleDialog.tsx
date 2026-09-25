import { useEffect, useState } from 'react'
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
  planStandardDrywallSchedule,
  type StandardScheduleGenerationPlan,
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
  const [plan, setPlan] = useState<StandardScheduleGenerationPlan | null>(null)
  const [loadingPlan, setLoadingPlan] = useState(false)

  // Work out what generating would do before offering to do it — a job that has been
  // measured but not scheduled is the common case, and it needs the rest of the chain
  // rather than a second Measure.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoadingPlan(true)
    planStandardDrywallSchedule(projectId)
      .then((next) => {
        if (!cancelled) setPlan(next)
      })
      .catch((e) => {
        if (!cancelled) toast.error(e instanceof Error ? e.message : 'Could not read the schedule')
      })
      .finally(() => {
        if (!cancelled) setLoadingPlan(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, projectId])

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

  const willCreate = plan?.stepsToCreate.map((step) => step.name) ?? []
  const willSkip = plan?.skipped.map((step) => step.name) ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generate standard schedule</DialogTitle>
        </DialogHeader>

        {loadingPlan ? (
          <p className="text-muted-foreground text-sm">Checking what is already scheduled…</p>
        ) : (
          <>
            <p className="text-muted-foreground text-sm">
              {willCreate.length > 0
                ? `Creates ${willCreate.join(' → ')} with default predecessor lags. You can edit any item afterward.`
                : 'Every step in the standard schedule is already on this job.'}
            </p>

            {willSkip.length > 0 ? (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Already on this job, so not created again: {willSkip.join(', ')}.
              </p>
            ) : null}

            {plan?.anchor ? (
              // Dates come from the anchor, so the measure-date field would be a lie.
              <p className="text-muted-foreground text-sm">
                Starts after <span className="font-medium">{plan.anchor.name}</span> ends on{' '}
                {plan.anchor.end_date}.
              </p>
            ) : (
              <div className="space-y-1.5 py-2">
                <Label htmlFor="measure-date">Measure date</Label>
                <Input
                  id="measure-date"
                  type="date"
                  value={measureDate}
                  onChange={(e) => setMeasureDate(e.target.value)}
                />
              </div>
            )}
          </>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={generating || loadingPlan || willCreate.length === 0}
          >
            {generating ? 'Generating…' : 'Generate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
