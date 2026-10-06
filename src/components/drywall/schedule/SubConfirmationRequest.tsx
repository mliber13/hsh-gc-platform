// ============================================================================
// Sub confirmation request — the send half of step 6
// ============================================================================
//
// Everything else for this already existed and had never been switched on: `send-sms` sends
// and stamps `confirmation_status: 'pending'`, `receive-sms` matches the sender's phone to a
// subcontractor and writes `confirmed` or `declined` from a Y/N reply, and `smsService` builds
// the message. All 534 schedule items read `unsent` because nothing in the editor called the
// send path. This is that button.
//
// **Deliberately separate from "Notify assigned crew"**, per Mark (2026-10-05): "I suppose
// there is an instance that a sub and crew member are both assigned and maybe I don't want to
// notify the crew member." One adaptive control would have made that choice for him. These do
// different things to different people over different channels — push to our staff,
// fire-and-forget; SMS to an outside company, expecting a reply — so they stay two buttons
// that can both be present and are pressed independently.
//
// The message is shown verbatim before sending. These go to real phones at real companies,
// and an operator should never have to guess what a button is about to say in their name.

import { useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { buildAssignmentMessage, sendOneAssignment } from '@/services/smsService'
import type { PublishCandidate } from '@/services/smsService'
import type { ConfirmationStatus } from '@/types'
import { cn } from '@/lib/utils'

const STATUS_META: Record<
  ConfirmationStatus,
  { label: string; dot: string; hint: string }
> = {
  unsent: { label: 'Not asked yet', dot: 'bg-slate-400 dark:bg-slate-500', hint: '' },
  pending: { label: 'Waiting on reply', dot: 'bg-amber-500', hint: 'asked' },
  confirmed: { label: 'Confirmed', dot: 'bg-emerald-500', hint: 'replied' },
  declined: { label: 'Declined', dot: 'bg-rose-500', hint: 'replied' },
  'no-reply': { label: 'No reply', dot: 'bg-orange-500', hint: 'asked' },
}

function shortDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return null
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

type Props = {
  scheduleItemId: string
  projectId: string
  projectName: string
  itemName: string
  startDate: string
  companyId: string
  companyName: string
  /** Null when the subcontractor record has no phone — 25 of 36 are phone-only, but not all. */
  companyPhone: string | null
  status: ConfirmationStatus
  lastSentAt: string | null | undefined
  /**
   * The draft has changes the row does not carry yet. Sending now would tell the sub about a
   * schedule that is not saved, and if the COMPANY is the unsaved part their reply cannot be
   * matched back at all — `receive-sms` finds the item by `assigned_company_id`.
   */
  unsavedEdits?: boolean
  onStatusChange: (next: ConfirmationStatus, sentAt: string) => void
}

export function SubConfirmationRequest({
  scheduleItemId,
  projectId,
  projectName,
  itemName,
  startDate,
  companyId,
  companyName,
  companyPhone,
  status,
  lastSentAt,
  unsavedEdits = false,
  onStatusChange,
}: Props) {
  const [open, setOpen] = useState(false)
  const [sending, setSending] = useState(false)

  const candidate: PublishCandidate = {
    schedule_item_id: scheduleItemId,
    project_id: projectId,
    item_name: itemName,
    project_name: projectName,
    start_date: startDate,
    assigned_company_id: companyId,
    company_name: companyName,
    recipient_phone: companyPhone ?? '',
  }

  // Built from the same function that sends, so the preview cannot drift from the message.
  const message = buildAssignmentMessage(candidate)
  const meta = STATUS_META[status]
  const sentOn = shortDate(lastSentAt)
  const alreadyAsked = status !== 'unsent'

  const handleSend = async () => {
    if (!companyPhone) return
    setSending(true)
    try {
      const result = await sendOneAssignment(candidate)
      if (!result.success) {
        toast.error(result.errorMessage ?? 'Could not send the confirmation request')
        return
      }
      // send-sms stamps pending itself; mirror it locally so the row updates without a reload.
      onStatusChange('pending', new Date().toISOString())
      toast.success(`Asked ${companyName} to confirm`)
      setOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not send the confirmation request')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-2 rounded-lg border bg-background/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn('size-2 shrink-0 rounded-full', meta.dot)} aria-hidden />
          <span className="truncate text-sm font-medium">{meta.label}</span>
          {sentOn && meta.hint ? (
            <span className="shrink-0 text-xs text-muted-foreground">
              {meta.hint} {sentOn}
            </span>
          ) : null}
        </div>

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5"
              disabled={!companyPhone || unsavedEdits}
            >
              <MessageSquare className="size-3.5" />
              {alreadyAsked ? 'Ask again' : 'Request confirmation'}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[min(100vw-2rem,24rem)] space-y-2">
            <p className="text-sm font-medium">
              Text {companyName}
              <span className="font-normal text-muted-foreground"> · {companyPhone}</span>
            </p>
            {/* Verbatim, because it goes out over the company's name. */}
            <p className="rounded-md border bg-muted/50 p-2 text-xs leading-relaxed">{message}</p>
            <p className="text-[11px] text-muted-foreground">
              Their reply of Y or N updates this item automatically. Anything else lands in
              the office inbox.
            </p>
            <div className="flex justify-end">
              <Button type="button" size="sm" disabled={sending} onClick={() => void handleSend()}>
                {sending ? 'Sending…' : 'Send text'}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {!companyPhone ? (
        <p className="text-[11px] text-muted-foreground">
          {companyName} has no phone number on file — add one in the subcontractor directory to
          text them.
        </p>
      ) : null}

      {unsavedEdits ? (
        <p className="text-[11px] text-amber-700 dark:text-amber-400">
          Save this item first — a confirmation is sent about the saved schedule, and a reply is
          matched back by the saved company.
        </p>
      ) : null}
    </div>
  )
}
