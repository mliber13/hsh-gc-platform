// ============================================================================
// Settings → Standard Schedule: edit the steps "Generate standard schedule"
// creates (name, type, duration, lag, default assignees). Self-contained —
// loads and saves its own column via standardScheduleTemplateService.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, CalendarClock, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AssignedPersonsPicker } from '@/components/schedule/AssignedPersonsPicker'
import {
  DEFAULT_STANDARD_SCHEDULE_TEMPLATE,
  newStandardScheduleStep,
  type StandardScheduleStep,
} from '@/lib/drywall/standardScheduleTemplate'
import {
  fetchStandardScheduleTemplate,
  saveStandardScheduleTemplate,
} from '@/services/standardScheduleTemplateService'

type Props = { readOnly: boolean }

export function StandardScheduleTab({ readOnly }: Props) {
  const [steps, setSteps] = useState<StandardScheduleStep[]>([])
  const [savedSnapshot, setSavedSnapshot] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const t = await fetchStandardScheduleTemplate()
      const initial = t ?? DEFAULT_STANDARD_SCHEDULE_TEMPLATE
      setSteps(initial)
      setSavedSnapshot(JSON.stringify(initial))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load the schedule template')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const isDirty = useMemo(() => JSON.stringify(steps) !== savedSnapshot, [steps, savedSnapshot])

  const patchStep = (id: string, patch: Partial<StandardScheduleStep>) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  const removeStep = (id: string) => setSteps((prev) => prev.filter((s) => s.id !== id))

  const move = (index: number, dir: -1 | 1) => {
    setSteps((prev) => {
      const next = [...prev]
      const target = index + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const addStep = () => setSteps((prev) => [...prev, newStandardScheduleStep()])

  const handleSave = async () => {
    if (readOnly) return
    const cleaned = steps.map((s) => ({ ...s, name: s.name.trim() }))
    if (cleaned.some((s) => !s.name)) {
      toast.error('Every step needs a name')
      return
    }
    setSaving(true)
    try {
      await saveStandardScheduleTemplate(cleaned)
      setSteps(cleaned)
      setSavedSnapshot(JSON.stringify(cleaned))
      toast.success('Standard schedule saved')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save the schedule template')
    } finally {
      setSaving(false)
    }
  }

  const resetToDefault = () => setSteps(DEFAULT_STANDARD_SCHEDULE_TEMPLATE.map((s) => ({ ...s })))

  if (loading) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center text-muted-foreground">
        <div className="inline-block size-7 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2">
          <CalendarClock className="mt-0.5 h-5 w-5 text-primary" />
          <p className="max-w-2xl text-sm text-muted-foreground">
            The steps <strong>Generate standard schedule</strong> creates, in order. Each step
            starts after the one above it by its lag (work days). Duration is how many work days
            the step spans. Assignees are applied automatically when generated.
          </p>
        </div>
        {!readOnly && (
          <div className="flex shrink-0 gap-2">
            <Button variant="ghost" size="sm" onClick={resetToDefault} disabled={saving}>
              Reset to default
            </Button>
            <Button size="sm" onClick={() => void handleSave()} disabled={saving || !isDirty}>
              {saving ? 'Saving…' : isDirty ? 'Save' : 'Saved'}
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {steps.map((step, index) => (
          <Card key={step.id}>
            <CardContent className="space-y-3 p-3 sm:p-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[10rem] flex-1 space-y-1">
                  <Label className="text-xs">Step name</Label>
                  <Input
                    value={step.name}
                    disabled={readOnly}
                    placeholder={`Step ${index + 1}`}
                    onChange={(e) => patchStep(step.id, { name: e.target.value })}
                  />
                </div>
                <div className="w-28 space-y-1">
                  <Label className="text-xs">Type</Label>
                  <Select
                    value={step.type}
                    disabled={readOnly}
                    onValueChange={(v) => patchStep(step.id, { type: v as 'field' | 'office' })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="field">Field</SelectItem>
                      <SelectItem value="office">Office</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-24 space-y-1">
                  <Label className="text-xs">Duration (days)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={step.durationDays}
                    disabled={readOnly}
                    onChange={(e) =>
                      patchStep(step.id, { durationDays: Math.max(1, Number(e.target.value) || 1) })
                    }
                  />
                </div>
                <div className="w-24 space-y-1">
                  <Label className="text-xs">
                    {index === 0 ? 'Start offset' : 'Lag (days)'}
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    value={step.lagDays}
                    disabled={readOnly}
                    onChange={(e) =>
                      patchStep(step.id, { lagDays: Math.max(0, Number(e.target.value) || 0) })
                    }
                  />
                </div>
                {!readOnly && (
                  <div className="flex items-center gap-1 pb-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label="Move up"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label="Move down"
                      disabled={index === steps.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive"
                      aria-label="Remove step"
                      onClick={() => removeStep(step.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                )}
              </div>
              <AssignedPersonsPicker
                label="Default assignee(s)"
                value={step.assignedPersonIds}
                disabled={readOnly}
                onChange={(ids) => patchStep(step.id, { assignedPersonIds: ids })}
              />
            </CardContent>
          </Card>
        ))}
      </div>

      {!readOnly && (
        <Button variant="outline" onClick={addStep} className="gap-1.5">
          <Plus className="size-4" />
          Add step
        </Button>
      )}
    </div>
  )
}
