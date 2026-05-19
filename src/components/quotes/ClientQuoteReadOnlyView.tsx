import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Download, PlusCircle } from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import type { Project } from '@/types'
import {
  CLIENT_QUOTE_STATUS,
  effectiveStatus,
  type ClientQuoteStatus,
  type ClientQuoteWithChildren,
} from '@/types/clientQuote'
import {
  createQuoteRevision,
  getClientQuoteWithChildren,
  listClientQuotesForProject,
  markQuoteAccepted,
  markQuoteDeclined,
} from '@/services/clientQuoteService'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { QuoteActionsConfirmDialog } from './QuoteActionsConfirmDialog'
import { buildClientQuotePdfFilename, downloadPdfBlob } from '@/services/clientQuotePdf'
import { cn } from '@/lib/utils'

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

function quoteNumberLabel(q: ClientQuoteWithChildren): string {
  if (q.revision > 0) return `${q.quote_number} R${q.revision}`
  return q.quote_number
}

function projectSiteText(project: Project, quote: ClientQuoteWithChildren): string {
  if (quote.project_address_override?.trim()) return quote.project_address_override.trim()
  const a = project.address
  if (!a || typeof a === 'string') return project.name
  const parts = [a.street, [project.city, project.state].filter(Boolean).join(', '), project.zipCode]
    .filter(Boolean)
    .join('\n')
  return [project.name, parts].filter(Boolean).join('\n')
}

function isLiveRow(
  q: { id: string; status: string; expires_at: string | null },
  excludeId: string,
  now: number,
): boolean {
  if (q.id === excludeId) return false
  if (q.status === 'draft') return true
  if (q.status === 'sent') {
    if (!q.expires_at) return true
    return new Date(q.expires_at).getTime() > now
  }
  return false
}

interface ClientQuoteReadOnlyViewProps {
  project: Project
  quoteId: string
  onBack: () => void
}

export function ClientQuoteReadOnlyView({ project, quoteId, onBack }: ClientQuoteReadOnlyViewProps) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [quote, setQuote] = useState<ClientQuoteWithChildren | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [acceptOpen, setAcceptOpen] = useState(false)
  const [declineOpen, setDeclineOpen] = useState(false)
  const [declineOnlyLive, setDeclineOnlyLive] = useState(false)
  const [reviseOpen, setReviseOpen] = useState(false)
  const [supersederQuote, setSupersederQuote] = useState<ClientQuoteWithChildren | null>(null)
  const [actionBusy, setActionBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const q = await getClientQuoteWithChildren(quoteId)
      if (!q) {
        setQuote(null)
        setError('Quote not found')
        return
      }
      if (q.status === 'draft') {
        navigate(`/projects/${project.id}/quotes/${quoteId}/edit`, { replace: true })
        return
      }
      if (q.status === 'superseded' && q.superseded_by_id) {
        const child = await getClientQuoteWithChildren(q.superseded_by_id)
        setSupersederQuote(child)
      } else {
        setSupersederQuote(null)
      }
      setQuote(q)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load quote')
      setQuote(null)
    } finally {
      setLoading(false)
    }
  }, [quoteId, project.id, navigate])

  useEffect(() => {
    void load()
  }, [load])

  const eff = quote ? effectiveStatus(quote) : ('draft' as ClientQuoteStatus)
  const pill = CLIENT_QUOTE_STATUS[eff]

  const openDeclineDialog = async () => {
    if (!quote) return
    try {
      const rows = await listClientQuotesForProject(project.id)
      const now = Date.now()
      const others = rows.filter((r) => isLiveRow(r, quote.id, now))
      setDeclineOnlyLive(others.length === 0)
    } catch {
      setDeclineOnlyLive(false)
    }
    setDeclineOpen(true)
  }

  const handleDownloadPdf = async () => {
    if (!quote?.sent_pdf_url) return
    const { data, error: downloadErr } = await supabase.storage
      .from('quote-documents')
      .download(quote.sent_pdf_url)
    if (downloadErr || !data) {
      toast.error(downloadErr?.message ?? 'Could not download PDF')
      return
    }
    const filename = buildClientQuotePdfFilename(project.name, quote)
    downloadPdfBlob(data, filename)
  }

  const showAccept = quote && (eff === 'sent' || eff === 'expired')
  const showDecline = quote && eff === 'sent'
  const showCreateRevision =
    quote && (eff === 'sent' || eff === 'declined' || eff === 'expired')

  if (loading) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error || !quote) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
        <p className="text-destructive">{error ?? 'Quote not found'}</p>
        <Button variant="outline" onClick={onBack}>
          Back to quotes
        </Button>
      </div>
    )
  }

  const sortedLines = [...quote.line_items].sort((a, b) => a.sort_order - b.sort_order)
  const sortedOpts = [...quote.options].sort((a, b) => a.sort_order - b.sort_order)
  const lineSum = sortedLines.reduce((s, li) => s + li.amount, 0)
  const optSum = sortedOpts.reduce((s, o) => s + o.amount, 0)
  const subtotal = lineSum + optSum

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 text-muted-foreground">
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <h1 className="text-center text-xl font-semibold">{quoteNumberLabel(quote)}</h1>
        <div className="flex flex-wrap justify-end gap-2">
          {quote.sent_pdf_url && (
            <Button type="button" variant="outline" size="sm" onClick={() => void handleDownloadPdf()}>
              <Download className="mr-2 size-4" />
              Download PDF
            </Button>
          )}
          {showAccept && (
            <Button type="button" size="sm" disabled={actionBusy} onClick={() => setAcceptOpen(true)}>
              Mark accepted
            </Button>
          )}
          {showDecline && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={actionBusy}
              onClick={() => void openDeclineDialog()}
            >
              Mark declined
            </Button>
          )}
          {showCreateRevision && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={actionBusy}
              onClick={() => setReviseOpen(true)}
            >
              <PlusCircle className="mr-2 size-4" />
              Create revision
            </Button>
          )}
        </div>
      </div>

      <Card
        className={cn(
          'border-2',
          eff === 'accepted' && 'border-emerald-500/40 bg-emerald-500/5',
          eff === 'declined' && 'border-rose-500/40 bg-rose-500/5',
          eff === 'expired' && 'border-amber-500/40 bg-amber-500/5',
          eff === 'sent' && 'border-sky-500/40 bg-sky-500/5',
          eff === 'superseded' && 'border-muted',
        )}
      >
        <CardContent className="space-y-2 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${pill.pillClass}`}>
              {pill.label}
            </span>
          </div>
          {eff === 'sent' && quote.issued_at && quote.expires_at && (
            <p className="text-sm text-muted-foreground">
              Sent {format(new Date(quote.issued_at), 'MMM d, yyyy')}. Valid until{' '}
              {format(new Date(quote.expires_at), 'MMM d, yyyy')}.
            </p>
          )}
          {eff === 'expired' && quote.expires_at && (
            <p className="text-sm text-muted-foreground">
              Expired {format(new Date(quote.expires_at), 'MMM d, yyyy')}.
            </p>
          )}
          {eff === 'accepted' && quote.accepted_at && (
            <p className="text-sm text-emerald-800 dark:text-emerald-200">
              Accepted {format(new Date(quote.accepted_at), 'MMM d, yyyy')}.
            </p>
          )}
          {eff === 'declined' && quote.declined_at && (
            <p className="text-sm text-rose-800 dark:text-rose-200">
              Declined {format(new Date(quote.declined_at), 'MMM d, yyyy')}.
            </p>
          )}
          {eff === 'superseded' && quote.superseded_by_id && (
            <p className="text-sm text-muted-foreground">
              Superseded by a newer revision.{' '}
              <Link
                to={`/projects/${project.id}/quotes/${quote.superseded_by_id}`}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                View current revision
                {supersederQuote != null ? ` (R${supersederQuote.revision})` : ''}
              </Link>
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quote metadata</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <span className="text-muted-foreground">Validity </span>
            {quote.validity_days} days
          </div>
          <div>
            <span className="text-muted-foreground">Total </span>
            <span className="font-semibold tabular-nums">{formatCurrency(quote.sent_total ?? subtotal)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Prepared for</CardTitle>
        </CardHeader>
        <CardContent className="whitespace-pre-wrap text-sm">
          {quote.prepared_for ? (
            <>
              {quote.prepared_for.company && <p className="font-medium">{quote.prepared_for.company}</p>}
              {quote.prepared_for.attn_name && (
                <p>
                  Attn: {quote.prepared_for.attn_name}
                  {quote.prepared_for.attn_title ? `, ${quote.prepared_for.attn_title}` : ''}
                </p>
              )}
              {quote.prepared_for.mailing_address && <p>{quote.prepared_for.mailing_address}</p>}
              {quote.prepared_for.phone && <p>Phone: {quote.prepared_for.phone}</p>}
              {quote.prepared_for.email && <p>Email: {quote.prepared_for.email}</p>}
            </>
          ) : (
            <p className="italic text-muted-foreground">Not specified</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Project</CardTitle>
        </CardHeader>
        <CardContent className="whitespace-pre-wrap text-sm">{projectSiteText(project, quote)}</CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scope of work</CardTitle>
        </CardHeader>
        <CardContent className="whitespace-pre-wrap text-sm text-muted-foreground">
          {quote.scope_narrative?.trim() || <span className="italic">No scope narrative.</span>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pricing</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Trade category</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {sortedLines.map((li) => (
                <tr key={li.id} className="border-b last:border-0">
                  <td className="px-3 py-2">{li.display_label}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(li.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-right text-sm font-semibold text-sky-700 dark:text-sky-300">
            Subtotal {formatCurrency(lineSum)}
          </p>
        </CardContent>
      </Card>

      {sortedOpts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Options / alternates</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Label</th>
                  <th className="px-3 py-2 text-left font-medium">Description</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {sortedOpts.map((o) => (
                  <tr key={o.id} className="border-b last:border-0">
                    <td className="px-3 py-2">{o.label}</td>
                    <td className="px-3 py-2 text-muted-foreground">{o.description || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(o.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Inclusions</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {(quote.inclusions ?? []).filter(Boolean).map((t, i) => (
              <li key={i}>{t}</li>
            ))}
            {!(quote.inclusions ?? []).filter(Boolean).length && (
              <li className="list-none pl-0 italic text-muted-foreground">None listed</li>
            )}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Exclusions</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {(quote.exclusions ?? []).filter(Boolean).map((t, i) => (
              <li key={i}>{t}</li>
            ))}
            {!(quote.exclusions ?? []).filter(Boolean).length && (
              <li className="list-none pl-0 italic text-muted-foreground">None listed</li>
            )}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Terms</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Validity: This quote is valid for {quote.validity_days} days from the issue date.</p>
          <p>
            Warranty: HSH Contractor provides a one-year workmanship warranty from substantial completion.
          </p>
          <p>
            This quote does not constitute a contract. A separate construction contract will be executed upon
            acceptance.
          </p>
        </CardContent>
      </Card>

      <QuoteActionsConfirmDialog
        open={acceptOpen}
        mode="accept"
        quoteNumber={quote.quote_number}
        onCancel={() => setAcceptOpen(false)}
        onConfirm={async () => {
          setActionBusy(true)
          try {
            const next = await markQuoteAccepted(quote.id)
            setQuote(next)
            setSupersederQuote(null)
            toast.success('Quote marked accepted. Project is now In Progress.')
            setAcceptOpen(false)
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Failed to accept quote')
          } finally {
            setActionBusy(false)
          }
        }}
      />

      <QuoteActionsConfirmDialog
        open={declineOpen}
        mode="decline"
        quoteNumber={quote.quote_number}
        isOnlyLiveQuote={declineOnlyLive}
        onCancel={() => setDeclineOpen(false)}
        onConfirm={async () => {
          setActionBusy(true)
          try {
            const { quote: next, projectMarkedLost } = await markQuoteDeclined(quote.id)
            setQuote(next)
            setSupersederQuote(null)
            toast.success(
              projectMarkedLost
                ? 'Quote declined. Project moved to Lost (no other live quotes).'
                : 'Quote declined.',
            )
            setDeclineOpen(false)
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Failed to decline quote')
          } finally {
            setActionBusy(false)
          }
        }}
      />

      <QuoteActionsConfirmDialog
        open={reviseOpen}
        mode="revise"
        quoteNumber={quote.quote_number}
        parentRevision={quote.revision}
        onCancel={() => setReviseOpen(false)}
        onConfirm={async () => {
          setActionBusy(true)
          try {
            const full = await createQuoteRevision(quote.id)
            toast.success(`Revision R${full.revision} created — now editing draft.`)
            setReviseOpen(false)
            navigate(`/projects/${project.id}/quotes/${full.id}/edit`)
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Failed to create revision')
          } finally {
            setActionBusy(false)
          }
        }}
      />
    </div>
  )
}
