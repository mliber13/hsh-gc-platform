import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, FileSignature, Plus } from 'lucide-react'
import { toast } from 'sonner'
import type { Project } from '@/types'
import { CLIENT_QUOTE_STATUS, type ClientQuoteListRow } from '@/types/clientQuote'
import { listClientQuotesForProject } from '@/services/clientQuoteService'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

function quoteNumberLabel(q: ClientQuoteListRow): string {
  if (q.revision > 0) return `${q.quote_number} R${q.revision}`
  return q.quote_number
}

function displayTotal(q: ClientQuoteListRow): number {
  if (q.status !== 'draft' && q.sent_total != null) return q.sent_total
  return q.draft_live_total ?? 0
}

interface ProjectQuotesViewProps {
  project: Project
  onBack: () => void
  onNewQuote: () => void
  onEditDraft: (quoteId: string) => void
}

export function ProjectQuotesView({ project, onBack, onNewQuote, onEditDraft }: ProjectQuotesViewProps) {
  const [loading, setLoading] = useState(true)
  const [quotes, setQuotes] = useState<ClientQuoteListRow[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const rows = await listClientQuotesForProject(project.id)
      setQuotes(rows)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load quotes')
    } finally {
      setLoading(false)
    }
  }, [project.id])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 text-muted-foreground">
            <ArrowLeft className="size-4" />
            Back
          </Button>
          <h1 className="text-xl font-semibold tracking-tight">Quotes</h1>
        </div>
        {!loading && quotes.length > 0 && (
          <Button onClick={onNewQuote} size="sm">
            <Plus className="mr-2 size-4" />
            New Quote
          </Button>
        )}
      </div>

      {loading && (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}

      {!loading && error && (
        <Card className="border-destructive/40">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {!loading && !error && quotes.length === 0 && (
        <Card className="mx-auto w-full max-w-lg border-dashed">
          <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
            <div className="rounded-full bg-muted p-3">
              <FileSignature className="size-8 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-lg font-medium">No quotes yet</p>
              <p className="text-sm text-muted-foreground">Generate a quote for this project.</p>
            </div>
            <Button onClick={onNewQuote}>
              <Plus className="mr-2 size-4" />
              Create first quote
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && !error && quotes.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Quote</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Prepared for</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 text-left font-medium">Issued</th>
                <th className="px-4 py-3 text-left font-medium">Expires</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => {
                const pill = CLIENT_QUOTE_STATUS[q.status]
                const clickable = q.status === 'draft'
                return (
                  <tr
                    key={q.id}
                    className={
                      clickable
                        ? 'cursor-pointer border-b transition-colors hover:bg-muted/40 last:border-0'
                        : 'cursor-default border-b opacity-90 last:border-0'
                    }
                    onClick={() => {
                      if (clickable) onEditDraft(q.id)
                    }}
                  >
                    <td className="px-4 py-3 font-medium tabular-nums">{quoteNumberLabel(q)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${pill.pillClass}`}
                      >
                        {pill.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {q.prepared_for?.company?.trim() || '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {formatCurrency(displayTotal(q))}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {q.issued_at ? new Date(q.issued_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {q.expires_at ? new Date(q.expires_at).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
