import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { usePermissions } from '@/hooks/usePermissions'
import { format, parseISO } from 'date-fns'
import { ChevronDown, ChevronRight, Clock, Wallet } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchMyPaystubs } from '@/services/hrPayrollService'
import type { MyPaystub } from '@/types/payroll'

function money(n: number): string {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
}

function num(value: unknown): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''))
  return Number.isFinite(n) ? n : 0
}

/**
 * Whether sqft × rate × steps actually produces the stored amount.
 *
 * It does for 205 of 211 live piece rows. The other six were adjusted by hand in payroll —
 * two are paid at zero — so any formula printed beside them would contradict the figure
 * that was actually paid.
 */
function reconciles(piece: {
  jobTotalSqft?: unknown
  rate?: unknown
  phasesCompleted?: unknown
  totalPhases?: unknown
  amount?: unknown
}): boolean {
  const sqft = num(piece.jobTotalSqft)
  const rate = num(piece.rate)
  if (sqft <= 0 || rate <= 0) return false
  const total = num(piece.totalPhases)
  const done = num(piece.phasesCompleted)
  const expected = sqft * rate * (total > 1 ? done / total : 1)
  return Math.abs(expected - num(piece.amount)) <= 0.02
}

function weekLabel(stub: MyPaystub): string {
  if (!stub.start_date || !stub.end_date) return stub.period_label
  try {
    return `${format(parseISO(stub.start_date), 'MMM d')} – ${format(parseISO(stub.end_date), 'MMM d, yyyy')}`
  } catch {
    return stub.period_label
  }
}

/**
 * What a crew member was paid, week by week.
 *
 * The thing Mark actually asked for: most of the crew are on piece, so hours alone told
 * them nothing. Piece rows carry the job, the sqft and the rate they were paid at, which
 * is the calculation they want to check.
 *
 * `gross` is read from the stored entry rather than recomputed here. It is the number
 * payroll actually arrived at, after the helper day-rate deduction that reduces a
 * journeyman's piece — recomputing it in the UI would risk showing a finisher a figure
 * higher than their cheque (CREW_TIME_CLOCK_PLAN §6.2).
 *
 * Only locked periods reach this page; list_my_paystubs filters drafts out server-side.
 */
export function CrewPayPage() {
  const [searchParams] = useSearchParams()
  const { effectiveRole } = usePermissions()
  const isOperator = effectiveRole !== 'crew'
  const viewAsPersonId = isOperator ? searchParams.get('as') : null

  const [stubs, setStubs] = useState<MyPaystub[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    // list_my_paystubs resolves the person from the session, so in an operator preview it
    // returns the OPERATOR's pay — not the person on the banner. Rather than show one
    // person's earnings under another's name, the preview says it cannot show this.
    // Payroll itself is where an operator looks at somebody's pay.
    if (viewAsPersonId) {
      setLoading(false)
      return
    }
    let cancelled = false
    fetchMyPaystubs()
      .then((rows) => {
        if (cancelled) return
        setStubs(rows)
        setOpenId(rows[0]?.period_id ?? null)
      })
      .catch((e) => {
        if (!cancelled) toast.error(e instanceof Error ? e.message : 'Could not load your pay')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const weeks = useMemo(
    () =>
      stubs.map((stub) => {
        const entry = stub.entries?.[0]
        const pieces = entry?.pieceEntries ?? []
        return {
          stub,
          label: weekLabel(stub),
          gross: num(entry?.gross),
          pieceTotal: num(entry?.pieceTotal),
          hours: num(entry?.hours),
          perDiem: num(entry?.perDiem),
          reimbursement: num(entry?.reimbursement),
          pieces,
        }
      }),
    [stubs],
  )

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <Wallet className="size-5" />
          My pay
        </h1>
        <Button asChild variant="outline" size="sm">
          <Link to="/crew/hours">
            <Clock className="mr-2 size-4" />
            Hours
          </Link>
        </Button>
      </div>

      {viewAsPersonId ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-6 text-sm text-amber-900 dark:text-amber-200">
            Pay cannot be previewed. This page reads the signed-in person's own payroll, so
            it would show yours rather than theirs. Use the Payroll workspace to look at
            someone else's pay.
          </CardContent>
        </Card>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : weeks.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No finished pay weeks yet. A week shows up here once the office closes it out.
          </CardContent>
        </Card>
      ) : (
        weeks.map((week) => {
          const open = openId === week.stub.period_id
          return (
            <Card key={week.stub.period_id}>
              <CardHeader className="pb-2">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 text-left"
                  onClick={() => setOpenId(open ? null : week.stub.period_id)}
                >
                  <CardTitle className="flex items-center gap-1.5 text-base font-medium">
                    {open ? (
                      <ChevronDown className="size-4 shrink-0 opacity-60" />
                    ) : (
                      <ChevronRight className="size-4 shrink-0 opacity-60" />
                    )}
                    {week.label}
                  </CardTitle>
                  <span className="shrink-0 text-lg font-semibold tabular-nums">
                    {money(week.gross)}
                  </span>
                </button>
              </CardHeader>

              {open ? (
                <CardContent className="space-y-3 text-sm">
                  {week.pieces.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Piece work
                      </p>
                      {week.pieces.map((piece) => (
                        <div key={piece.id} className="rounded-lg border bg-muted/20 p-2.5">
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="min-w-0 truncate font-medium">
                              {piece.jobName || 'Job not recorded'}
                            </span>
                            <span className="shrink-0 tabular-nums">{money(num(piece.amount))}</span>
                          </div>
                          {/*
                            The sum they can check on their own, shown only when it
                            actually reaches the amount beside it.

                            The step fraction is the whole difference between a hanger and
                            a finisher: 2 of 5 steps on 14,320 sqft at $0.27 is $773.28,
                            not $3,866.40. And six of 211 live rows reconcile to neither,
                            because the office adjusted the amount by hand — two are paid
                            at zero. For those the arithmetic is fiction, so it is not
                            printed; `amount` is what was paid and stays the headline.
                          */}
                          {reconciles(piece) ? (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {num(piece.jobTotalSqft).toLocaleString()} sqft × ${piece.rate}
                              {num(piece.totalPhases) > 1
                                ? ` × ${piece.phasesCompleted}/${piece.totalPhases} steps`
                                : ''}
                              {piece.workType ? ` · ${piece.workType}` : ''}
                            </p>
                          ) : (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {piece.workType ? `${piece.workType} · ` : ''}set by the office
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="space-y-1 border-t pt-2 text-xs text-muted-foreground">
                    {week.pieceTotal > 0 ? (
                      <div className="flex justify-between">
                        <span>Piece total</span>
                        <span className="tabular-nums">{money(week.pieceTotal)}</span>
                      </div>
                    ) : null}
                    {week.hours > 0 ? (
                      <div className="flex justify-between">
                        <span>Hours</span>
                        <span className="tabular-nums">{week.hours}</span>
                      </div>
                    ) : null}
                    {week.perDiem > 0 ? (
                      <div className="flex justify-between">
                        <span>Per diem</span>
                        <span className="tabular-nums">{money(week.perDiem)}</span>
                      </div>
                    ) : null}
                    {week.reimbursement > 0 ? (
                      <div className="flex justify-between">
                        <span>Reimbursement</span>
                        <span className="tabular-nums">{money(week.reimbursement)}</span>
                      </div>
                    ) : null}
                    <div className="flex justify-between pt-1 text-sm font-medium text-foreground">
                      <span>Gross</span>
                      <span className="tabular-nums">{money(week.gross)}</span>
                    </div>
                  </div>
                </CardContent>
              ) : null}
            </Card>
          )
        })
      )}

      <p className="px-1 text-xs text-muted-foreground">
        Finished weeks only — a week appears once the office closes it out. Gross before
        taxes and withholding. If a number looks wrong, message the office on the job.
      </p>
    </div>
  )
}
