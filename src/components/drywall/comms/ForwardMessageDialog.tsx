import { useEffect, useMemo, useState } from 'react'
import { Megaphone, Search, User } from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  forwardProjectComms,
  type ProjectCommsMessage,
} from '@/services/projectCommsService'

export interface ForwardRecipientOption {
  personId: string
  name: string
  /** Assigned crew are listed first — usually who you mean. */
  assigned: boolean
}

interface ForwardMessageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  message: ProjectCommsMessage | null
  recipients: ForwardRecipientOption[]
  onForwarded: () => void
}

const JOB_WIDE = '__job__'

export function ForwardMessageDialog({
  open,
  onOpenChange,
  projectId,
  message,
  recipients,
  onForwarded,
}: ForwardMessageDialogProps) {
  const [target, setTarget] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [search, setSearch] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!open) return
    setTarget(null)
    setNote('')
    setSearch('')
  }, [open])

  // Don't offer to forward a message back into the lane it already sits in.
  const options = useMemo(() => {
    const q = search.trim().toLowerCase()
    return recipients
      .filter((r) => !(message?.audience === 'crew' && message.audiencePersonId === r.personId))
      .filter((r) => !q || r.name.toLowerCase().includes(q))
      .sort((a, b) => {
        if (a.assigned !== b.assigned) return a.assigned ? -1 : 1
        return a.name.localeCompare(b.name)
      })
  }, [recipients, search, message])

  const handleForward = async () => {
    if (!message || !target) return
    setSending(true)
    try {
      await forwardProjectComms({
        projectId,
        messageId: message.id,
        toPersonId: target === JOB_WIDE ? null : target,
        note,
      })
      const label =
        target === JOB_WIDE
          ? 'everyone on this job'
          : (recipients.find((r) => r.personId === target)?.name ?? 'them')
      toast.success(`Forwarded to ${label}`)
      onForwarded()
      onOpenChange(false)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to forward message')
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Forward message</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {message ? (
            <blockquote className="max-h-28 overflow-y-auto rounded-md border-l-2 border-muted-foreground/30 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{message.author}:</span>{' '}
              <span className="whitespace-pre-wrap">{message.body}</span>
            </blockquote>
          ) : null}

          <div className="space-y-1.5">
            <Label>Send to</Label>
            <button
              type="button"
              onClick={() => setTarget(JOB_WIDE)}
              aria-pressed={target === JOB_WIDE}
              className={cn(
                'flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                target === JOB_WIDE
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:bg-muted',
              )}
            >
              <Megaphone className="size-4 shrink-0 text-muted-foreground" />
              Everyone on this job
            </button>
          </div>

          {recipients.length > 4 ? (
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search people"
                className="h-8 pl-8"
              />
            </div>
          ) : null}

          <div className="max-h-52 space-y-1 overflow-y-auto">
            {options.length === 0 ? (
              <p className="px-1 py-3 text-center text-sm text-muted-foreground">
                No one to forward to.
              </p>
            ) : (
              options.map((r) => (
                <button
                  key={r.personId}
                  type="button"
                  onClick={() => setTarget(r.personId)}
                  aria-pressed={target === r.personId}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                    target === r.personId
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:bg-muted',
                  )}
                >
                  <User className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{r.name}</span>
                  {r.assigned ? (
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                      On this job
                    </span>
                  ) : null}
                </button>
              ))
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="forward-note">Add a note (optional)</Label>
            <Textarea
              id="forward-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Heads up — see below"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleForward()}
            disabled={sending || !target}
          >
            {sending ? 'Forwarding…' : 'Forward'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
