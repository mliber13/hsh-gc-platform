// ============================================================================
// CustomerCommsCard (CC.1) — capture the customer/super contact and text them.
// Outbound-only for now; inbound replies + office inbox land in CC.2.
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import { Link2, MessageSquare, RefreshCw, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { getOrCreateCustomerShareLink } from '@/services/customerShareService'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  fetchCustomerContact,
  fetchProjectCustomerMessages,
  saveCustomerContact,
  sendCustomerMessage,
  normalizeCustomerPhone,
  type CustomerMessage,
} from '@/services/customerCommsService'

function formatPhone(digits: string): string {
  const p = normalizeCustomerPhone(digits)
  if (p.length !== 10) return digits
  return `(${p.slice(0, 3)}) ${p.slice(3, 6)}-${p.slice(6)}`
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString()
}

interface CustomerCommsCardProps {
  projectId: string
  readOnly: boolean
  /** Site & Access contact — often the same person, offered as a one-click fill. */
  siteContactName?: string
  siteContactPhone?: string
}

export function CustomerCommsCard({
  projectId,
  readOnly,
  siteContactName,
  siteContactPhone,
}: CustomerCommsCardProps) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [savedPhone, setSavedPhone] = useState('')
  const [messages, setMessages] = useState<CustomerMessage[]>([])
  const [draft, setDraft] = useState('')
  const [savingContact, setSavingContact] = useState(false)
  const [sending, setSending] = useState(false)

  const loadMessages = useCallback(async () => {
    setMessages(await fetchProjectCustomerMessages(projectId))
  }, [projectId])

  const [refreshingMessages, setRefreshingMessages] = useState(false)
  const refreshMessages = async () => {
    setRefreshingMessages(true)
    try {
      await loadMessages()
    } finally {
      setRefreshingMessages(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const contact = await fetchCustomerContact(projectId)
      if (cancelled) return
      if (contact) {
        setName(contact.name)
        setPhone(contact.phone)
        setSavedPhone(normalizeCustomerPhone(contact.phone))
      }
      await loadMessages()
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, loadMessages])

  // Live-update the conversation: poll every 20s while the tab is visible.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') void loadMessages()
    }
    const id = window.setInterval(tick, 20_000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [loadMessages])

  const handleSaveContact = async () => {
    const digits = normalizeCustomerPhone(phone)
    if (digits.length !== 10) {
      toast.error('Enter a valid 10-digit mobile number')
      return
    }
    setSavingContact(true)
    try {
      await saveCustomerContact(projectId, { name, phone: digits })
      setSavedPhone(digits)
      toast.success('Customer contact saved')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save contact')
    } finally {
      setSavingContact(false)
    }
  }

  const handleSend = async () => {
    const digits = normalizeCustomerPhone(phone)
    if (digits.length !== 10) {
      toast.error('Save a valid customer mobile number first')
      return
    }
    if (!draft.trim()) return
    setSending(true)
    try {
      await sendCustomerMessage({ projectId, phone: digits, name: name || undefined, body: draft.trim() })
      setDraft('')
      toast.success('Text sent')
      await loadMessages()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to send text')
    } finally {
      setSending(false)
    }
  }

  const canText = savedPhone.length === 10
  const [copyingLink, setCopyingLink] = useState(false)

  const handleCopyScheduleLink = async () => {
    setCopyingLink(true)
    try {
      const url = await getOrCreateCustomerShareLink(savedPhone)
      await navigator.clipboard.writeText(url)
      toast.success('Customer schedule link copied to clipboard')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create schedule link')
    } finally {
      setCopyingLink(false)
    }
  }

  const siteName = (siteContactName ?? '').trim()
  const sitePhone10 = normalizeCustomerPhone(siteContactPhone ?? '')
  const siteContactAvailable = Boolean(siteName) || sitePhone10.length === 10
  const matchesSite = name.trim() === siteName && normalizeCustomerPhone(phone) === sitePhone10
  const useSiteContact = () => {
    setName(siteContactName ?? '')
    setPhone(siteContactPhone ?? '')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <MessageSquare className="h-5 w-5" />
          Customer contact
        </CardTitle>
        <CardDescription>
          Text the customer or GC superintendent about scheduling — stock dates, pointup, questions.
          They just reply to the text; you tag which job it belongs to.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="cust-name">Name</Label>
            <Input
              id="cust-name"
              placeholder="e.g. John Ingram (Superintendent)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={readOnly}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cust-phone">Mobile number</Label>
            <div className="flex gap-2">
              <Input
                id="cust-phone"
                inputMode="tel"
                placeholder="(216) 555-0199"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={readOnly}
              />
              {!readOnly && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSaveContact}
                  disabled={savingContact}
                >
                  {savingContact ? 'Saving…' : 'Save'}
                </Button>
              )}
            </div>
          </div>
        </div>

        {!readOnly && siteContactAvailable && !matchesSite ? (
          <button
            type="button"
            onClick={useSiteContact}
            className="text-left text-xs font-medium text-primary hover:underline"
          >
            Same as site contact{siteName ? ` (${siteName})` : ''}? Use it →
          </button>
        ) : null}

        {!readOnly && canText ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleCopyScheduleLink()}
            disabled={copyingLink}
          >
            <Link2 className="mr-1 h-4 w-4" />
            {copyingLink ? 'Copying…' : 'Copy schedule link for customer'}
          </Button>
        ) : null}

        {/* Thread */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Conversation</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs text-muted-foreground"
              onClick={() => void refreshMessages()}
              disabled={refreshingMessages}
            >
              <RefreshCw className={'h-3.5 w-3.5 ' + (refreshingMessages ? 'animate-spin' : '')} />
              Refresh
            </Button>
          </div>
          {messages.length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
              No texts yet. Save a number and send the first message below.
            </p>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border p-3">
              {messages.map((m) => {
                const outbound = m.direction === 'outbound'
                return (
                  <div
                    key={m.id}
                    className={outbound ? 'flex justify-end' : 'flex justify-start'}
                  >
                    <div
                      className={
                        outbound
                          ? 'max-w-[80%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground'
                          : 'max-w-[80%] rounded-lg bg-muted px-3 py-2 text-sm'
                      }
                    >
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      <p
                        className={
                          outbound
                            ? 'mt-1 text-right text-[10px] text-primary-foreground/70'
                            : 'mt-1 text-[10px] text-muted-foreground'
                        }
                      >
                        {outbound ? 'You' : m.contactName || 'Customer'} · {formatTime(m.createdAt)}
                        {m.status === 'failed' ? ' · failed' : ''}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Composer */}
        {!readOnly && (
          <div className="space-y-2">
            <Textarea
              rows={2}
              placeholder={
                canText
                  ? `Text ${name || formatPhone(savedPhone)}…`
                  : 'Save a valid mobile number above to enable texting'
              }
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={!canText}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {canText ? `Sends an SMS to ${formatPhone(savedPhone)}` : ''}
              </span>
              <Button
                type="button"
                onClick={handleSend}
                disabled={!canText || sending || !draft.trim()}
              >
                <Send className="mr-2 h-4 w-4" />
                {sending ? 'Sending…' : 'Send text'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
