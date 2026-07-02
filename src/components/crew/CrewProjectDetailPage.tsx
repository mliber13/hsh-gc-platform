import { useCallback, useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import {
  ArrowLeft,
  Calendar,
  Camera,
  DollarSign,
  FileText,
  MapPin,
  Package,
  Phone,
  RefreshCw,
  Ruler,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { usePageTitle } from '@/contexts/PageTitleContext'
import { usePermissions } from '@/hooks/usePermissions'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { drywallStatusLabel, drywallStatusPillClass } from '@/lib/drywall/crewStatusStyles'
import { isMeasurerSpecialty } from '@/lib/drywall/crewSpecialty'
import { phaseForScheduleItem } from '@/components/drywall/schedule/scheduleItemStatusStyles'
import {
  CrewWorkspacePermissionError,
  fetchCrewProjectDetail,
  fetchCrewProjectDetailForPreview,
} from '@/services/crewWorkspaceService'
import { getSignedPhotoUrl } from '@/services/drywallPhotosService'
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

function CrewPhotoThumb({
  photo,
}: {
  photo: { id: string; storagePath: string | null; url: string | null; label: string | null }
}) {
  const [src, setSrc] = useState<string | null>(photo.url)
  useEffect(() => {
    let cancelled = false
    if (photo.url) {
      setSrc(photo.url)
      return
    }
    if (photo.storagePath) {
      void getSignedPhotoUrl(photo.storagePath)
        .then((u) => {
          if (!cancelled) setSrc(u)
        })
        .catch(() => {
          if (!cancelled) setSrc(null)
        })
    }
    return () => {
      cancelled = true
    }
  }, [photo.url, photo.storagePath])

  if (!src) {
    return (
      <div className="aspect-square rounded-md bg-muted flex items-center justify-center">
        <Camera className="size-5 text-muted-foreground/40" />
      </div>
    )
  }
  return (
    <a href={src} target="_blank" rel="noopener noreferrer" className="block">
      <img
        src={src}
        alt={photo.label ?? 'Field photo'}
        className="aspect-square w-full rounded-md object-cover"
      />
    </a>
  )
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

function mapsHref(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

function isTodayInRange(startISO: string, endISO: string): boolean {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = parseISO(startISO)
  start.setHours(0, 0, 0, 0)
  const end = parseISO(endISO)
  end.setHours(0, 0, 0, 0)
  return today >= start && today <= end
}

export function CrewProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { effectiveRole } = usePermissions()
  const isPreview = !isCrewRole(effectiveRole)
  const [detail, setDetail] = useState<CrewProjectDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Prefill plumbing for Materials → comms request flow
  const [prefillText, setPrefillText] = useState<string>('')
  const [prefillToken, setPrefillToken] = useState<number>(0)

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
        console.error('fetchCrewProjectDetail failed:', e)
        setError('Could not load this job. Try again or contact the office.')
      }
      setDetail(null)
    } finally {
      setLoading(false)
    }
  }, [projectId, effectiveRole])

  useEffect(() => {
    void load()
  }, [load])

  const { pullDistance, refreshing: pullRefreshing } = usePullToRefresh(load)

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

  const showStartMeasure =
    !isPreview &&
    isMeasurerSpecialty(detail.specialty) &&
    detail.scheduleEntries.some((entry) => phaseForScheduleItem(entry) === 'measure')

  return (
    <div
      className="space-y-4 pb-10"
      style={{
        transform: `translateY(${pullDistance}px)`,
        transition: pullDistance === 0 ? 'transform 200ms' : 'none',
      }}
    >
      {pullDistance > 0 || pullRefreshing ? (
        <div
          className="pointer-events-none fixed left-0 right-0 top-14 flex justify-center"
          style={{ opacity: Math.min(1, pullDistance / 70) }}
        >
          <div className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground shadow">
            {pullRefreshing
              ? 'Refreshing…'
              : pullDistance >= 70
                ? 'Release to refresh'
                : 'Pull to refresh'}
          </div>
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate('/crew')}>
          <ArrowLeft className="mr-2 size-4" />
          All jobs
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void load()}
          disabled={loading}
          aria-label="Refresh"
        >
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

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
          <a
            href={mapsHref(detail.address)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-2 text-base font-medium text-foreground hover:text-primary"
          >
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            {detail.address}
          </a>
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

      {showStartMeasure ? (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="font-semibold">Field measurement assigned</p>
              <p className="text-sm text-muted-foreground">
                Capture sqft, photos, and notes for office review.
              </p>
            </div>
            <Button
              type="button"
              className="shrink-0"
              onClick={() => navigate(`/crew/projects/${projectId}/measure`)}
            >
              <Ruler className="mr-2 size-4" />
              Start measure
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="size-4" />
            {isPreview || detail.specialty === 'both' ? 'Pay rates' : 'Pay rate'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isPreview && isMeasurerSpecialty(detail.specialty) ? (
            <p className="text-sm text-muted-foreground">
              Field measurer — pay tracked separately
            </p>
          ) : !isPreview && detail.specialty === 'unknown' ? (
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

        const showHangScope =
          isPreview || detail.specialty === 'hanger' || detail.specialty === 'both'

        const hangThickness = showHangScope
          ? [
              scope.hangCeilingThickness ? `Ceiling ${scope.hangCeilingThickness}` : null,
              scope.hangWallThickness ? `Wall ${scope.hangWallThickness}` : null,
            ]
              .filter(Boolean)
              .join(' · ')
          : ''

        const hasAny =
          (showHangScope && (hangThickness || scope.hangExceptions)) ||
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
              {showHangScope ? (
                <>
                  <Row label="Drywall thickness" value={hangThickness || null} />
                  <Row label="Hang exceptions" value={scope.hangExceptions} />
                </>
              ) : null}
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

      {detail.photos.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Camera className="size-4" />
              Field photos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2">
              {detail.photos.map((photo) => (
                <CrewPhotoThumb key={photo.id} photo={photo} />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {detail.materials.length > 0 ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="size-4" />
              Materials
            </CardTitle>
            {!isPreview ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setPrefillText(
                    'Hi office — running short on the following material(s) at this job:\n\n- ',
                  )
                  setPrefillToken((t) => t + 1)
                  // Scroll the comms panel into view so they can type the rest.
                  setTimeout(() => {
                    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
                  }, 50)
                }}
              >
                Request more
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4">
            {(() => {
              const byType = new Map<string, typeof detail.materials>()
              for (const m of detail.materials) {
                const existing = byType.get(m.type) ?? []
                existing.push(m)
                byType.set(m.type, existing)
              }
              return [...byType.entries()].map(([type, rows]) => (
                <div key={type} className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">{type}</p>
                  {rows.map((row) => {
                    const baseName = row.subtype ?? row.type
                    const displayName = row.length ? `${row.length} ${baseName}` : baseName
                    return (
                      <div
                        key={row.id}
                        className="flex items-baseline justify-between gap-3 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">{displayName}</p>
                          {row.threadType ? (
                            <p className="text-xs text-muted-foreground">{row.threadType}</p>
                          ) : null}
                        </div>
                        <p className="shrink-0 tabular-nums font-medium">
                          {row.quantity} {row.unit}
                        </p>
                      </div>
                    )
                  })}
                </div>
              ))
            })()}
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
            {detail.scheduleEntries.map((entry) => {
              const isToday = isTodayInRange(entry.startDate, entry.endDate)
              return (
                <div
                  key={entry.id}
                  className={
                    isToday
                      ? 'rounded-lg border-2 border-primary bg-primary/5 p-3'
                      : 'rounded-lg border p-3'
                  }
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{entry.name}</p>
                    <div className="flex items-center gap-1.5">
                      {isToday ? (
                        <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase text-primary-foreground">
                          Today
                        </span>
                      ) : null}
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
              )
            })}
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

      <CrewCommsPanel
        projectId={projectId}
        readOnly={isPreview}
        prefillText={prefillText}
        prefillToken={prefillToken}
      />
    </div>
  )
}
