import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { createCommsEntry } from '@/services/communicationLogService'
import { getCurrentUserProfile } from '@/services/userService'
import type {
  CommunicationLogEntry,
  CommLogChannel,
  CommLogDirection,
} from '@/types/communicationLog'
import type { UserProfile } from '@/services/userService'

type ManualChannel = Exclude<CommLogChannel, 'system'>
type ManualDirection = Exclude<CommLogDirection, 'system'>

interface SubcontractorOption {
  id: string
  name: string
  is_internal: boolean
}

interface LogCommsModalProps {
  open: boolean
  onClose: () => void
  onCreated: (entry: CommunicationLogEntry) => void
  projectId: string
  scheduleItemId?: string | null
}

const channelLabels: Record<ManualChannel, string> = {
  phone: 'Phone call',
  sms: 'SMS',
  email: 'Email',
  'in-app': 'In-app note',
}

export function LogCommsModal({
  open,
  onClose,
  onCreated,
  projectId,
  scheduleItemId = null,
}: LogCommsModalProps) {
  const { user } = useAuth()
  const [channel, setChannel] = useState<ManualChannel>('phone')
  const [direction, setDirection] = useState<ManualDirection>('outbound')
  const [companyId, setCompanyId] = useState<string>('none')
  const [body, setBody] = useState('')
  const [durationMinutes, setDurationMinutes] = useState('')
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [subcontractors, setSubcontractors] = useState<SubcontractorOption[]>([])
  const [loadingContext, setLoadingContext] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return

    let cancelled = false
    setChannel('phone')
    setDirection('outbound')
    setCompanyId('none')
    setBody('')
    setDurationMinutes('')
    setLoadingContext(true)

    ;(async () => {
      try {
        const currentProfile = await getCurrentUserProfile()
        if (cancelled) return
        setProfile(currentProfile)

        const { data, error } = await supabase
          .from('subcontractors')
          .select('id, name, is_internal')
          .eq('is_active', true)
          .order('is_internal', { ascending: false })
          .order('name', { ascending: true })

        if (error) throw error
        if (!cancelled) {
          setSubcontractors((data ?? []) as SubcontractorOption[])
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not load communication form data.'
        toast.error(message)
      } finally {
        if (!cancelled) setLoadingContext(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open])

  const durationNumber = useMemo(() => {
    if (durationMinutes.trim() === '') return null
    const parsed = Number(durationMinutes)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  }, [durationMinutes])

  const handleSubmit = async () => {
    if (!user) {
      toast.error('You must be signed in to log communications.')
      return
    }
    if (!profile?.organization_id) {
      toast.error('Unable to determine your organization.')
      return
    }
    if (direction === 'inbound' && companyId === 'none') {
      toast.error('Choose the company this inbound message came from.')
      return
    }
    if (!body.trim()) {
      toast.error('Add notes before saving this entry.')
      return
    }

    setSaving(true)
    try {
      const metadata =
        channel === 'phone' && durationNumber
          ? { duration_minutes: durationNumber }
          : null

      const entry = await createCommsEntry({
        organization_id: profile.organization_id,
        project_id: projectId,
        schedule_item_id: scheduleItemId,
        direction,
        channel,
        body: body.trim(),
        author_user_id: user.id,
        author_company_id: companyId === 'none' ? null : companyId,
        metadata,
      })

      toast.success('Communication logged')
      onCreated(entry)
      onClose()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not log communication.'
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose() }}>
      <DialogContent className="sm:max-w-lg border-border/60 bg-card text-foreground">
        <DialogHeader>
          <DialogTitle>Log communication</DialogTitle>
          <DialogDescription>
            Record a phone call, SMS, email, or in-app note for this schedule.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {loadingContext ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Loading form...
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Channel</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(channelLabels) as ManualChannel[]).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setChannel(value)}
                      className={cn(
                        'rounded-md border border-border/60 px-3 py-2 text-sm transition-colors',
                        channel === value
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-background text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {channelLabels[value]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Direction</Label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['inbound', 'Inbound (from sub)'],
                    ['outbound', 'Outbound (to sub)'],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setDirection(value as ManualDirection)}
                      className={cn(
                        'rounded-md border border-border/60 px-3 py-2 text-sm transition-colors',
                        direction === value
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-background text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="comms-company">
                  With company {direction === 'inbound' ? '(required)' : '(optional)'}
                </Label>
                <Select value={companyId} onValueChange={setCompanyId}>
                  <SelectTrigger id="comms-company">
                    <SelectValue placeholder="Select company..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No company</SelectItem>
                    {subcontractors.map((subcontractor) => (
                      <SelectItem key={subcontractor.id} value={subcontractor.id}>
                        {subcontractor.name}
                        {subcontractor.is_internal ? ' (internal)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {channel === 'phone' && (
                <div className="space-y-2">
                  <Label htmlFor="comms-duration">Duration (minutes)</Label>
                  <Input
                    id="comms-duration"
                    type="number"
                    min="1"
                    step="1"
                    value={durationMinutes}
                    onChange={(event) => setDurationMinutes(event.target.value)}
                    placeholder="Optional"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="comms-body">Notes</Label>
                <Textarea
                  id="comms-body"
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder="What was communicated?"
                  className="min-h-[140px]"
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={saving || loadingContext}>
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            Save entry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
