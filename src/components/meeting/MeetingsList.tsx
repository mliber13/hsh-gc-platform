import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { usePageTitle } from '@/contexts/PageTitleContext'
import { getCurrentUserMeetingLead, getMeetingsList } from '@/services/meetingService'
import type { MeetingLead, MeetingsSummaryRow } from '@/types/meeting'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function MeetingsList() {
  usePageTitle('Meeting History')
  const { user } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [lead, setLead] = useState<MeetingLead | null>(null)
  const [rows, setRows] = useState<MeetingsSummaryRow[]>([])

  const load = useCallback(async () => {
    if (!user?.id) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const resolvedLead = await getCurrentUserMeetingLead(user.id)
      setLead(resolvedLead)

      if (!resolvedLead) {
        setRows([])
        return
      }

      const list = await getMeetingsList()
      setRows(list)
    } catch (error) {
      console.error('Failed to load meetings list', error)
      toast.error('Could not load meeting history.')
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    void load()
  }, [load])

  const todayYmd = useMemo(() => format(new Date(), 'yyyy-MM-dd'), [])

  if (loading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Card className="border-border/60 bg-card/50">
          <CardContent className="py-12 text-center">
            <div className="mx-auto inline-block size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
            <p className="mt-4 text-sm text-muted-foreground">Loading meeting history...</p>
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
            <CardTitle className="text-lg">Meeting History</CardTitle>
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
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold">Meeting History</h1>
          <p className="text-sm text-muted-foreground">{rows.length} meetings on file</p>
        </header>

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No meetings yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border/60 bg-card/50">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-muted/30 text-left text-xs font-medium text-muted-foreground">
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Submissions</th>
                  <th className="px-3 py-2">Action items</th>
                  <th className="px-3 py-2">Open</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const upcoming = row.meeting_date > todayYmd
                  return (
                    <tr
                      key={row.id}
                      className="cursor-pointer border-b border-border/60 transition-colors hover:bg-muted/40 last:border-b-0"
                      onClick={() => navigate(`/meeting/${row.meeting_date}`)}
                    >
                      <td className="px-3 py-2">
                        <div className="inline-flex items-center gap-2">
                          <span>{format(parseISO(row.meeting_date), 'EEE, MMM d, yyyy')}</span>
                          {upcoming && (
                            <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              upcoming
                            </span>
                          )}
                        </div>
                      </td>
                      <td
                        className={
                          row.submission_count === 0
                            ? 'px-3 py-2 text-muted-foreground'
                            : 'px-3 py-2'
                        }
                      >
                        {row.submission_count}
                      </td>
                      <td
                        className={
                          row.action_item_count === 0
                            ? 'px-3 py-2 text-muted-foreground'
                            : 'px-3 py-2'
                        }
                      >
                        {row.action_item_count}
                      </td>
                      <td
                        className={
                          row.open_action_item_count > 0
                            ? 'px-3 py-2 text-amber-600 dark:text-amber-400'
                            : 'px-3 py-2 text-muted-foreground'
                        }
                      >
                        {row.open_action_item_count}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <ChevronRight className="inline size-4 text-muted-foreground" />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
