import { useCallback, useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import {
  ArrowLeft,
  Calendar,
  DollarSign,
  FileText,
  MapPin,
  Phone,
  RefreshCw,
  Ruler,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { usePageTitle } from '@/contexts/PageTitleContext'
import { usePermissions } from '@/hooks/usePermissions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { drywallStatusLabel, drywallStatusPillClass } from '@/lib/drywall/crewStatusStyles'
import {
  CrewWorkspacePermissionError,
  fetchCrewProjectDetail,
  fetchCrewProjectDetailForPreview,
} from '@/services/crewWorkspaceService'
import type { CrewProjectDetail } from '@/types/crew'
import { isCrewRole } from '@/lib/rbac'
import { CrewCommsPanel } from '@/components/crew/CrewCommsPanel'

function formatRate(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `$${value.toFixed(2)}`
}

function formatPay(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Auto-conversion placeholders that aren't useful to show crew. */
const STUB_DESCRIPTION_PATTERNS = [
  /migrated from v2/i,
  /^review and refine$/i,
  /^scope$/i,
]

function isStubDescription(desc: string | null | undefined): boolean {
  if (!desc) return true
  const trimmed = desc.trim()
  if (!trimmed) return true
  return STUB_DESCRIPTION_PATTERNS.some((p) => p.test(trimmed))
}

function breakdownMetaLine(row: CrewProjectDetail['breakdowns'][number]): string {
  const parts: string[] = []
  if (row.location?.trim()) parts.push(row.location.trim())
  if (row.sqft != null) parts.push(`${row.sqft.toLocaleString()} sqft`)
  if (row.finishScope?.trim()) parts.push(row.finishScope.trim())
  return parts.join(' · ')
}

function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`
}

export function CrewProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { effectiveRole } = usePermissions()
  const isPreview = !isCrewRole(effectiveRole)
  const [detail, setDetail] = useState<CrewProjectDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  usePageTitle(detail?.projectName ?? 'Job detail')

  const load = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    setError(null)
    try {
      const data = isCrewRole(effectiveRole)
        ? await fetchCrewProjectDetail(projectId)
        : await fetchCrewProjectDetailForPreview(projectId)
      setDetail(data)
    } catch (e) {
      if (e instanceof CrewWorkspacePermissionError) {
        setError('You are not assigned to this job.')
      } else {
        setError(e instanceof Error ? e.message : 'Failed to load job')
      }
      setDetail(null)
    } finally {
      setLoading(false)
    }
  }, [projectId, effectiveRole])

  useEffect(() => {
    void load()
  }, [load])

  if (!projectId) {
    return null
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    )
  }

  if (error || !detail) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/crew')}>
          <ArrowLeft className="mr-2 size-4" />
          Back
        </Button>
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
          <p className="text-sm text-muted-foreground">{error ?? 'Job not found'}</p>
          <Button variant="outline" onClick={() => void load()}>
            <RefreshCw className="mr-2 size-4" />
            Retry
          </Button>
        </div>
      </div>
    )
  }

  const contactPhone =
    detail.fieldNotes?.contactPhone?.trim() ||
    null

  return (
    <div className="space-y-4 pb-10">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate('/crew')}>
        <ArrowLeft className="mr-2 size-4" />
        All jobs
      </Button>

      <div className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h1 className="text-2xl font-bold leading-tight">{detail.projectName}</h1>
          <span className={drywallStatusPillClass(detail.status)}>
            {drywallStatusLabel(detail.status)}
          </span>
        </div>
        {detail.client ? (
          <p className="text-lg font-semibold text-foreground">{detail.client}</p>
        ) : null}
        {detail.address ? (
          <p className="flex items-start gap-2 text-base font-medium text-foreground">
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            {detail.address}
          </p>
        ) : null}
        {contactPhone ? (
          <a
            href={telHref(contactPhone)}
            className="inline-flex items-center gap-2 text-sm font-medium text-primary"
          >
            <Phone className="size-4" />
            {contactPhone}
          </a>
        ) : null}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="size-4" />
            {isPreview || detail.specialty === 'both' ? 'Pay rates' : 'Pay rate'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isPreview && detail.specialty === 'unknown' ? (
            <p className="text-sm text-muted-foreground">
              Contact office to set your role before pay rates can be shown.
            </p>
          ) : (
            <>
              {(isPreview || detail.specialty === 'hanger' || detail.specialty === 'both') &&
              detail.laborRates.hangerRate != null ? (
                <div className="space-y-1">
                  <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
                    {detail.totalSqft != null && detail.totalSqft > 0 ? (
                      <p>
                        <span className="text-3xl font-bold tabular-nums">
                          {detail.totalSqft.toLocaleString()}
                        </span>
                        <span className="ml-1 text-base font-medium text-muted-foreground">
                          sqft
                        </span>
                      </p>
                    ) : null}
                    <p>
                      <span className="text-3xl font-bold tabular-nums">
                        {formatRate(detail.laborRates.hangerRate)}
                      </span>
                      <span className="ml-1 text-base font-medium text-muted-foreground">
                        /sqft hanger
                      </span>
                    </p>
                  </div>
                  {detail.estimatedTotalPay.hanger != null ? (
                    <p className="text-base">
                      <span className="text-muted-foreground">Estimated pay </span>
                      <span className="text-xl font-bold tabular-nums">
                        {formatPay(detail.estimatedTotalPay.hanger)}
                      </span>
                    </p>
                  ) : null}
                </div>
              ) : null}

              {(isPreview || detail.specialty === 'finisher' || detail.specialty === 'both') &&
              detail.laborRates.finisherRate != null ? (
                <div className="space-y-1">
                  <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
                    {/* Only show sqft on the first eligible block — avoid double display for 'both' */}
                    {detail.totalSqft != null &&
                    detail.totalSqft > 0 &&
                    !(isPreview || detail.specialty === 'both') ? (
                      <p>
                        <span className="text-3xl font-bold tabular-nums">
                          {detail.totalSqft.toLocaleString()}
                        </span>
                        <span className="ml-1 text-base font-medium text-muted-foreground">
                          sqft
                        </span>
                      </p>
                    ) : null}
                    <p>
                      <span className="text-3xl font-bold tabular-nums">
                        {formatRate(detail.laborRates.finisherRate)}
                      </span>
                      <span className="ml-1 text-base font-medium text-muted-foreground">
                        /sqft finisher
                      </span>
                    </p>
                  </div>
                  {detail.estimatedTotalPay.finisher != null ? (
                    <p className="text-base">
                      <span className="text-muted-foreground">Estimated pay </span>
                      <span className="text-xl font-bold tabular-nums">
                        {formatPay(detail.estimatedTotalPay.finisher)}
                      </span>
                    </p>
                  ) : null}
                </div>
              ) : null}

              {isPreview && detail.laborRates.prepCleanRate != null ? (
                <p className="text-sm text-muted-foreground">
                  Cleanup {formatRate(detail.laborRates.prepCleanRate)}/sqft
                </p>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      {detail.beadSticks != null && detail.beadSticks > 0 ? (
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <Ruler className="size-8 text-muted-foreground" />
            <div>
              <p className="text-3xl font-bold tabular-nums">
                {detail.beadSticks.toLocaleString()}
              </p>
              <p className="text-sm text-muted-foreground">Bead sticks (excl. tearaway)</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {(() => {
        const scope = detail.structuredScope
        if (!scope) {
          // Fall back to legacy text-only scope when no structured scope is available (e.g. PO intake)
          return detail.scopeOfWork ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="size-4" />
                  Scope of work
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{detail.scopeOfWork}</p>
              </CardContent>
            </Card>
          ) : null
        }

        if (scope.useCustom && scope.customText) {
          return (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="size-4" />
                  Scope of work
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{scope.customText}</p>
              </CardContent>
            </Card>
          )
        }

        const hangThickness = [
          scope.hangCeilingThickness ? `Ceiling ${scope.hangCeilingThickness}` : null,
          scope.hangWallThickness ? `Wall ${scope.hangWallThickness}` : null,
        ]
          .filter(Boolean)
          .join(' · ')

        const hasAny =
          hangThickness ||
          scope.hangExceptions ||
          scope.ceilingFinish ||
          scope.ceilingExceptions ||
          scope.wallFinish ||
          scope.wallExceptions ||
          scope.additionalNotes
        if (!hasAny) return null

        const Row = ({ label, value }: { label: string; value: string | null }) =>
          value ? (
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
              <p className="whitespace-pre-wrap">{value}</p>
            </div>
          ) : null

        return (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="size-4" />
                Scope of work
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label="Drywall thickness" value={hangThickness || null} />
              <Row label="Hang exceptions" value={scope.hangExceptions} />
              <Row label="Ceiling finish" value={scope.ceilingFinish} />
              <Row label="Ceiling exceptions" value={scope.ceilingExceptions} />
              <Row label="Wall finish" value={scope.wallFinish} />
              <Row label="Wall exceptions" value={scope.wallExceptions} />
              <Row label="Additional notes" value={scope.additionalNotes} />
            </CardContent>
          </Card>
        )
      })()}

      {detail.fieldNotes ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Field notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {detail.fieldNotes.siteContact ? (
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground">Site contact</p>
                <p>{detail.fieldNotes.siteContact}</p>
              </div>
            ) : null}
            {detail.fieldNotes.contactPhone ? (
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground">Phone</p>
                <a href={telHref(detail.fieldNotes.contactPhone)} className="font-medium text-primary">
                  {detail.fieldNotes.contactPhone}
                </a>
              </div>
            ) : null}
            {detail.fieldNotes.meetingLocation ? (
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground">Meeting location</p>
                <p className="whitespace-pre-wrap">{detail.fieldNotes.meetingLocation}</p>
              </div>
            ) : null}
            {detail.fieldNotes.accessNotes ? (
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground">Access</p>
                <p className="whitespace-pre-wrap">{detail.fieldNotes.accessNotes}</p>
              </div>
            ) : null}
            {detail.fieldNotes.hazards ? (
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground">Hazards</p>
                <p className="whitespace-pre-wrap">{detail.fieldNotes.hazards}</p>
              </div>
            ) : null}
            {detail.fieldNotes.notes ? (
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground">Notes</p>
                <p className="whitespace-pre-wrap">{detail.fieldNotes.notes}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {detail.scheduleEntries.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="size-4" />
              Your schedule
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {detail.scheduleEntries.map((entry) => (
              <div key={entry.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{entry.name}</p>
                  <span
                    className={
                      entry.type === 'field'
                        ? 'rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-rose-700 dark:text-rose-300'
                        : 'rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-sky-700 dark:text-sky-300'
                    }
                  >
                    {entry.type}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {format(parseISO(entry.startDate), 'EEE MMM d')}
                  {' – '}
                  {format(parseISO(entry.endDate), 'EEE MMM d')}
                </p>
                {entry.notes ? (
                  <p className="mt-2 text-sm whitespace-pre-wrap">{entry.notes}</p>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {(() => {
        const meaningful = detail.breakdowns.filter((b) => !isStubDescription(b.description))
        if (meaningful.length === 0) return null
        return (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Scope of work — by area</CardTitle>
          </CardHeader>
          <CardContent className="p-0 sm:p-0">
            <table className="w-full text-sm">
              <tbody>
                {meaningful.map((row) => {
                  const meta = breakdownMetaLine(row)
                  return (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="px-4 py-3">
                        <p className="font-semibold">{row.description}</p>
                        {meta ? (
                          <p className="mt-0.5 text-muted-foreground">{meta}</p>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
        )
      })()}

      <CrewCommsPanel projectId={projectId} readOnly={isPreview} />
    </div>
  )
}
