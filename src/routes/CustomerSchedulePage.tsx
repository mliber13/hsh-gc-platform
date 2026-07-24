// ============================================================================
// Customer comms — public, no-login schedule share page (/customer/:token).
// Shows the customer/super their HSH project schedules (curated) and lets them
// send a change request, which lands in the office customer thread.
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  fetchCustomerSchedule,
  submitCustomerRequest,
  type CustomerScheduleItem,
  type CustomerScheduleProject,
} from '@/services/customerShareService'
import hshLogo from '/HSH Contractor Logo - Color.png'

function fmt(date: string | null): string {
  if (!date) return ''
  const d = new Date(date)
  return Number.isNaN(d.getTime())
    ? date
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function dateRange(item: CustomerScheduleItem): string {
  const s = fmt(item.startDate)
  const e = fmt(item.endDate)
  if (s && e && s !== e) return `${s} – ${e}`
  return s || e || 'TBD'
}

const STATUS_STYLE: Record<string, string> = {
  complete: 'bg-green-100 text-green-800',
  'in-progress': 'bg-blue-100 text-blue-800',
  delayed: 'bg-amber-100 text-amber-800',
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function ProjectBlock({
  project,
  token,
  onSent,
}: {
  project: CustomerScheduleProject
  token: string
  onSent: () => void | Promise<void>
}) {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const messages = project.messages ?? []

  const send = async () => {
    if (!draft.trim()) return
    setSending(true)
    setError('')
    try {
      await submitCustomerRequest(token, project.projectId, draft.trim())
      setDraft('')
      await onSent()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send your message.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
      {/* Colored, centered project name */}
      <div className="bg-[#213069] px-4 py-3 text-center">
        <p className="text-lg font-bold text-white">{project.projectName}</p>
      </div>

      {/* Schedule */}
      <div className="px-4 py-3">
        {project.items.length === 0 ? (
          <p className="text-sm text-gray-400">No scheduled items yet.</p>
        ) : (
          <ul className="divide-y">
            {project.items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-gray-800">{item.name}</span>
                  {item.assignees.length > 0 ? (
                    <span className="block truncate text-xs text-gray-400">
                      {item.assignees.join(', ')}
                    </span>
                  ) : null}
                </div>
                <span className="shrink-0 text-sm tabular-nums text-gray-600">{dateRange(item)}</span>
                {item.status && STATUS_STYLE[item.status] ? (
                  <span
                    className={
                      'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ' +
                      STATUS_STYLE[item.status]
                    }
                  >
                    {item.status.replace('-', ' ')}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Conversation with HSH */}
      {messages.length > 0 ? (
        <div className="border-t px-4 py-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Messages</p>
          <div className="space-y-2">
            {messages.map((m) => {
              const mine = m.direction === 'inbound'
              return (
                <div key={m.id} className={mine ? 'flex justify-end' : 'flex justify-start'}>
                  <div
                    className={
                      mine
                        ? 'max-w-[85%] rounded-lg bg-blue-600 px-3 py-2 text-sm text-white'
                        : 'max-w-[85%] rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-800'
                    }
                  >
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <p
                      className={
                        mine ? 'mt-1 text-right text-[10px] text-blue-100' : 'mt-1 text-[10px] text-gray-400'
                      }
                    >
                      {mine ? 'You' : 'HSH'} · {formatTime(m.createdAt)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {/* Composer */}
      <div className="border-t px-4 py-3">
        <label className="text-sm font-medium text-gray-700">Request a change or ask a question</label>
        <Textarea
          rows={2}
          className="mt-2"
          value={draft}
          placeholder="e.g. Can we push stock to Friday? Any chance pointup moves up a day?"
          onChange={(e) => setDraft(e.target.value)}
        />
        {error ? <p className="mt-1 text-sm text-red-600">{error}</p> : null}
        <div className="mt-2 flex justify-end">
          <Button type="button" size="sm" disabled={sending || !draft.trim()} onClick={() => void send()}>
            {sending ? 'Sending…' : 'Send to HSH'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function CustomerSchedulePage() {
  const { token = '' } = useParams()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [contactName, setContactName] = useState<string | null>(null)
  const [clientName, setClientName] = useState<string | null>(null)
  const [projects, setProjects] = useState<CustomerScheduleProject[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchCustomerSchedule(token)
      setContactName(data.contactName)
      setClientName(data.clientName)
      setProjects(data.projects)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'This link is not valid.')
    } finally {
      setLoading(false)
    }
  }, [token])

  // Re-fetch without blanking the page (manual refresh + after sending a message).
  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const data = await fetchCustomerSchedule(token)
      setContactName(data.contactName)
      setClientName(data.clientName)
      setProjects(data.projects)
    } catch {
      /* keep current view */
    } finally {
      setRefreshing(false)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <div className="mb-6 flex items-center justify-between gap-3 rounded-xl bg-[#213069] px-4 py-3 text-white shadow-sm">
          <div className="flex min-w-0 items-center gap-3">
            <div className="shrink-0 rounded-md bg-white p-1">
              <img src={hshLogo} alt="HSH Drywall" className="h-8 w-auto" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold leading-tight">
                {clientName ? `${clientName} — ` : ''}Project Portal
              </h1>
              <p className="truncate text-xs text-blue-200">
                {contactName ? `${contactName} · ` : ''}Powered by HSH Drywall
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Refresh"
            title="Refresh"
            onClick={() => void refresh()}
            disabled={refreshing || loading}
            className="shrink-0 rounded-md bg-white/10 p-2 text-white transition hover:bg-white/20 disabled:opacity-50"
          >
            <RefreshCw className={'h-4 w-4 ' + (refreshing ? 'animate-spin' : '')} />
          </button>
        </div>

        {loading ? (
          <p className="py-16 text-center text-sm text-gray-500">Loading schedule…</p>
        ) : error ? (
          <div className="rounded-lg border bg-white p-8 text-center">
            <p className="font-medium text-gray-900">This link isn't available</p>
            <p className="mt-1 text-sm text-gray-500">{error}</p>
            <p className="mt-3 text-xs text-gray-400">Contact HSH Drywall at 330-614-1127 for help.</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-lg border bg-white p-8 text-center text-sm text-gray-500">
            No projects on your schedule right now.
          </div>
        ) : (
          <div className="space-y-4">
            {projects.map((project) => (
              <ProjectBlock
                key={project.projectId}
                project={project}
                token={token}
                onSent={refresh}
              />
            ))}
          </div>
        )}

        <p className="mt-8 text-center text-xs text-gray-400">
          HSH Drywall · 330-614-1127
        </p>
      </div>
    </div>
  )
}
