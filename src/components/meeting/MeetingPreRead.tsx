import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { usePageTitle } from '@/contexts/PageTitleContext'
import { useAuth } from '@/contexts/AuthContext'
import {
  getCurrentUserMeetingLead,
  getCurrentWeekOf,
  getPreReadPromptState,
  upsertPreReadSubmissions,
} from '@/services/meetingService'
import type { MeetingLead, PreReadPromptState } from '@/types/meeting'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

function formatWeekOfDate(weekOf: string): string {
  const parsed = new Date(`${weekOf}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return weekOf
  return format(parsed, 'MMM d, yyyy')
}

function formatTimestamp(timestamp: string | null): string | null {
  if (!timestamp) return null
  const parsed = new Date(timestamp)
  if (Number.isNaN(parsed.getTime())) return null
  return format(parsed, 'MMM d, yyyy h:mm a')
}

export function MeetingPreRead() {
  usePageTitle('Meeting')
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [lead, setLead] = useState<MeetingLead | null>(null)
  const [weekOf, setWeekOf] = useState<string>('')
  const [prompts, setPrompts] = useState<PreReadPromptState[]>([])

  const loadPreRead = useCallback(async () => {
    if (!user?.id) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const [resolvedLead, resolvedWeekOf] = await Promise.all([
        getCurrentUserMeetingLead(user.id),
        getCurrentWeekOf(),
      ])

      setLead(resolvedLead)
      setWeekOf(resolvedWeekOf)

      if (!resolvedLead) {
        setPrompts([])
        return
      }

      const promptState = await getPreReadPromptState(
        resolvedLead.id,
        resolvedWeekOf,
      )
      setPrompts(promptState)
    } catch (error) {
      console.error('Failed to load meeting pre-read state', error)
      toast.error('Could not load your pre-read prompts.')
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    void loadPreRead()
  }, [loadPreRead])

  const lastSubmittedAt = useMemo(() => {
    const submittedValues = prompts
      .map((prompt) => prompt.submitted_at)
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => b.localeCompare(a))
    return submittedValues[0] ?? null
  }, [prompts])

  const handleAnswerChange = (promptId: string, value: string) => {
    setPrompts((current) =>
      current.map((prompt) =>
        prompt.prompt_id === promptId
          ? { ...prompt, answer_text: value }
          : prompt,
      ),
    )
  }

  const handleLiveDiscussChange = (promptId: string, checked: boolean) => {
    setPrompts((current) =>
      current.map((prompt) =>
        prompt.prompt_id === promptId
          ? { ...prompt, is_live_discuss: checked }
          : prompt,
      ),
    )
  }

  const handleSave = async () => {
    if (!lead || !weekOf) return

    setSaving(true)
    try {
      await upsertPreReadSubmissions({
        leadId: lead.id,
        weekOf,
        prompts: prompts.map((prompt) => ({
          prompt_id: prompt.prompt_id,
          answer_text: prompt.answer_text,
          is_live_discuss: prompt.is_live_discuss,
        })),
      })

      toast.success('Pre-read saved.')
      await loadPreRead()
    } catch (error) {
      console.error('Failed saving pre-read', error)
      toast.error('Could not save pre-read.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Card className="border-border/60 bg-card/50">
          <CardContent className="py-12 text-center">
            <div className="mx-auto inline-block size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
            <p className="mt-4 text-sm text-muted-foreground">
              Loading pre-read...
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!lead) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Card className="border-border/60 bg-card/50">
          <CardHeader>
            <CardTitle className="text-lg">Meeting Pre-read</CardTitle>
            <CardDescription>
              Your account is signed in, but it is not linked to a meeting lead.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Ask Mark to link your account, then refresh this page.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <Card className="border-border/60 bg-card/50">
        <CardHeader>
          <CardTitle className="text-lg">{lead.display_name} Pre-read</CardTitle>
          <CardDescription>
            {lead.area_label} · Week of {formatWeekOfDate(weekOf)}
          </CardDescription>
          {lastSubmittedAt && (
            <p className="text-sm text-muted-foreground">
              Last submitted: {formatTimestamp(lastSubmittedAt)}
            </p>
          )}
        </CardHeader>
      </Card>

      <Card className="border-border/60 bg-card/50">
        <CardContent className="space-y-6 pt-6">
          {prompts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No prompts are active for this week yet.
            </p>
          ) : (
            prompts.map((prompt, index) => (
              <div
                key={prompt.prompt_id}
                className="space-y-3 border-b border-border/60 pb-6 last:border-b-0 last:pb-0"
              >
                <Label htmlFor={`meeting-answer-${prompt.prompt_id}`}>
                  {index + 1}. {prompt.question_text}
                </Label>
                <Textarea
                  id={`meeting-answer-${prompt.prompt_id}`}
                  value={prompt.answer_text}
                  onChange={(event) =>
                    handleAnswerChange(prompt.prompt_id, event.target.value)
                  }
                  placeholder="Enter your update..."
                  className="min-h-[120px] bg-background"
                />
                <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={prompt.is_live_discuss}
                    onChange={(event) =>
                      handleLiveDiscussChange(
                        prompt.prompt_id,
                        event.target.checked,
                      )
                    }
                    className="h-4 w-4 rounded border-border/60"
                  />
                  Discuss live
                </label>
              </div>
            ))
          )}
        </CardContent>
        <CardFooter className="justify-end border-t border-border/60 pt-6">
          <Button onClick={handleSave} disabled={saving || prompts.length === 0}>
            {saving ? 'Saving...' : 'Save pre-read'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
