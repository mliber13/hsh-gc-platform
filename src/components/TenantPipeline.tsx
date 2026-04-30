import React, { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePageTitle } from '@/contexts/PageTitleContext'
import { isOnlineMode } from '@/lib/supabase'
import { createDeal } from '@/services/dealService'
import {
  createTenantProspect,
  deleteTenantProspect,
  fetchTenantProspects,
  updateTenantProspect,
  type ProspectCategory,
  type ProspectStage,
  type TenantProspect,
} from '@/services/tenantPipelineService'

const STAGES: ProspectStage[] = [
  'Contacted',
  'Meeting Set',
  'Meeting Complete',
  'Proposal Sent',
  'Negotiating',
  'LOI Signed',
  'Dead',
]

// Stage colors per docs/UI_PORT_PLAYBOOK.md §7 (semantic — repetition is intentional:
// emerald = positive milestone, amber = action-needed, sky = scheduled/calm)
const STAGE_STYLES: Record<
  ProspectStage,
  {
    title: string
    count: string
    dot: string
    rail: string
  }
> = {
  Contacted: {
    title: 'text-sky-700 dark:text-sky-300',
    count: 'bg-sky-500/20 text-sky-700 dark:text-sky-300',
    dot: 'bg-sky-500',
    rail: 'bg-sky-500',
  },
  'Meeting Set': {
    title: 'text-amber-700 dark:text-amber-300',
    count: 'bg-amber-500/20 text-amber-700 dark:text-amber-300',
    dot: 'bg-amber-500',
    rail: 'bg-amber-500',
  },
  'Meeting Complete': {
    title: 'text-emerald-700 dark:text-emerald-300',
    count: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300',
    dot: 'bg-emerald-500',
    rail: 'bg-emerald-500',
  },
  'Proposal Sent': {
    title: 'text-violet-700 dark:text-violet-300',
    count: 'bg-violet-500/20 text-violet-700 dark:text-violet-300',
    dot: 'bg-violet-500',
    rail: 'bg-violet-500',
  },
  Negotiating: {
    title: 'text-amber-700 dark:text-amber-300',
    count: 'bg-amber-500/20 text-amber-700 dark:text-amber-300',
    dot: 'bg-amber-500',
    rail: 'bg-amber-500',
  },
  'LOI Signed': {
    title: 'text-emerald-700 dark:text-emerald-300',
    count: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300',
    dot: 'bg-emerald-500',
    rail: 'bg-emerald-500',
  },
  Dead: {
    title: 'text-rose-700 dark:text-rose-300',
    count: 'bg-rose-500/20 text-rose-700 dark:text-rose-300',
    dot: 'bg-rose-500',
    rail: 'bg-rose-500',
  },
}

// Categories per docs/UI_PORT_PLAYBOOK.md §7 — orthogonal to stages, 8 distinct
// hues for visual identification. Pill recipe: bg-X-500/15 + text-X-700/300 + border-X-500/30
const CATEGORY_STYLES: Record<ProspectCategory, { badge: string; accent: string }> = {
  Grocer: {
    badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30',
    accent: 'bg-emerald-500',
  },
  QSR: {
    badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30',
    accent: 'bg-amber-500',
  },
  'Casual Dining': {
    badge: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border border-violet-500/30',
    accent: 'bg-violet-500',
  },
  Entertainment: {
    badge: 'bg-pink-500/15 text-pink-700 dark:text-pink-300 border border-pink-500/30',
    accent: 'bg-pink-500',
  },
  Retail: {
    badge: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30',
    accent: 'bg-sky-500',
  },
  Fitness: {
    badge: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-500/30',
    accent: 'bg-orange-500',
  },
  Medical: {
    badge: 'bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/30',
    accent: 'bg-teal-500',
  },
  Other: {
    badge: 'bg-muted text-muted-foreground border border-border',
    accent: 'bg-muted-foreground',
  },
}

const PROSPECTS: TenantProspect[] = [
  {
    id: 'heinens',
    name: "Heinen's",
    development: 'Columbiana',
    category: 'Grocer',
    contactName: 'Brother',
    contactEmail: '',
    contactPhone: '',
    outreachMethod: 'Warm Intro',
    stage: 'Meeting Set',
    owner: 'Kristen',
    nextAction: 'Confirm meeting time and attendees',
    nextActionDate: '2026-04-25',
    notes: 'Warm intro established with strong initial interest.',
  },
  {
    id: 'kroger',
    name: 'Kroger',
    development: 'Columbiana',
    category: 'Grocer',
    contactName: 'Kristen',
    contactEmail: '',
    contactPhone: '',
    outreachMethod: 'Cold Email',
    stage: 'Contacted',
    owner: 'Kristen',
    nextAction: 'Send follow-up with traffic highlights',
    nextActionDate: '2026-04-24',
    notes: 'Initial outreach sent.',
  },
  {
    id: 'meijer',
    name: 'Meijer',
    development: 'Columbiana',
    category: 'Grocer',
    contactName: 'Kristen',
    contactEmail: '',
    contactPhone: '',
    outreachMethod: 'Cold Email',
    stage: 'Contacted',
    owner: 'Kristen',
    nextAction: 'Follow up with site package',
    nextActionDate: '2026-04-26',
    notes: 'No response yet.',
  },
  {
    id: 'chicken-and-pickle',
    name: 'Chicken & Pickle',
    development: 'Columbiana',
    category: 'Entertainment',
    contactName: 'Kristen',
    contactEmail: '',
    contactPhone: '',
    outreachMethod: 'Cold Email',
    stage: 'Contacted',
    owner: 'Kristen',
    nextAction: 'Identify correct real estate contact',
    nextActionDate: '2026-04-27',
    notes: 'Potential anchor for evening/weekend traffic.',
  },
  {
    id: 'chick-fil-a',
    name: 'Chick-fil-A',
    development: 'Columbiana',
    category: 'QSR',
    contactName: 'Kristen',
    contactEmail: '',
    contactPhone: '',
    outreachMethod: 'Cold Email',
    stage: 'Contacted',
    owner: 'Kristen',
    nextAction: 'Send second outreach with drive-thru details',
    nextActionDate: '2026-04-28',
    notes: 'Potential high-volume QSR pad user.',
  },
]

const CATEGORIES: ProspectCategory[] = [
  'Grocer',
  'QSR',
  'Casual Dining',
  'Entertainment',
  'Retail',
  'Fitness',
  'Medical',
  'Other',
]

const OUTREACH_METHODS = [
  'Warm Intro',
  'Cold Email',
  'Phone Call',
  'Broker',
  'In Person',
  'Other',
] as const

function formatDate(input: string): string {
  const date = new Date(input)
  if (Number.isNaN(date.getTime())) return input
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

interface TenantPipelineProps {
  onBack: () => void
  onOpenDealWorkspace?: (dealId: string) => void
}

interface ProspectFormState {
  id?: string
  name: string
  development: string
  category: ProspectCategory
  contactName: string
  contactEmail: string
  contactPhone: string
  outreachMethod: string
  stage: ProspectStage
  owner: string
  nextAction: string
  nextActionDate: string
  notes: string
}

function getSupabaseFriendlyError(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') return fallback
  const maybe = error as { code?: string; message?: string; details?: string }

  if (maybe.code === '42501') {
    return 'You do not have permission to edit tenant prospects. Ask an admin to update your role.'
  }
  if (maybe.code === 'PGRST116') {
    return 'This prospect could not be found. Please refresh and try again.'
  }
  if (maybe.message) {
    return `${fallback} (${maybe.message})`
  }
  return fallback
}

function toFormState(prospect: TenantProspect): ProspectFormState {
  return {
    id: prospect.id,
    name: prospect.name,
    development: prospect.development,
    category: prospect.category,
    contactName: prospect.contactName,
    contactEmail: prospect.contactEmail,
    contactPhone: prospect.contactPhone,
    outreachMethod: prospect.outreachMethod,
    stage: prospect.stage,
    owner: prospect.owner,
    nextAction: prospect.nextAction,
    nextActionDate: prospect.nextActionDate,
    notes: prospect.notes,
  }
}

function emptyForm(defaultDevelopment = 'Columbiana'): ProspectFormState {
  return {
    name: '',
    development: defaultDevelopment,
    category: 'Grocer',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    outreachMethod: 'Cold Email',
    stage: 'Contacted',
    owner: '',
    nextAction: '',
    nextActionDate: '',
    notes: '',
  }
}

export function TenantPipeline({ onBack, onOpenDealWorkspace }: TenantPipelineProps) {
  const [developmentFilter, setDevelopmentFilter] = useState<string>('all')
  const [prospects, setProspects] = useState<TenantProspect[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [form, setForm] = useState<ProspectFormState>(emptyForm())
  const [isEditing, setIsEditing] = useState(false)
  const [activeMobileStage, setActiveMobileStage] = useState<ProspectStage>('Contacted')
  const [isLoading, setIsLoading] = useState(true)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncSuccess, setSyncSuccess] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [draggedProspectId, setDraggedProspectId] = useState<string | null>(null)
  const [dragOverStage, setDragOverStage] = useState<ProspectStage | null>(null)

  // Centered title in the AppHeader
  usePageTitle('Tenant Pipeline')

  const developmentOptions = useMemo(
    () => Array.from(new Set(prospects.map((p) => p.development))).sort(),
    [prospects],
  )

  const filteredProspects = useMemo(() => {
    if (developmentFilter === 'all') return prospects
    return prospects.filter((prospect) => prospect.development === developmentFilter)
  }, [developmentFilter, prospects])

  const stageCounts = useMemo(() => {
    return STAGES.reduce(
      (acc, stage) => {
        acc[stage] = filteredProspects.filter((prospect) => prospect.stage === stage).length
        return acc
      },
      {} as Record<ProspectStage, number>,
    )
  }, [filteredProspects])

  const mobileStageProspects = useMemo(
    () => filteredProspects.filter((prospect) => prospect.stage === activeMobileStage),
    [activeMobileStage, filteredProspects],
  )

  const loadProspects = async () => {
    setIsLoading(true)
    setSyncError(null)

    try {
      if (isOnlineMode()) {
        const fetched = await fetchTenantProspects()
        setProspects(fetched)
      } else {
        setProspects(PROSPECTS)
      }
    } catch (error) {
      console.error('Failed to load tenant pipeline from Supabase:', error)
      setProspects([])
      setSyncError('Unable to load tenant prospects from Supabase.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadProspects()
  }, [])

  useEffect(() => {
    if (!syncSuccess) return
    const timer = window.setTimeout(() => setSyncSuccess(null), 2500)
    return () => window.clearTimeout(timer)
  }, [syncSuccess])

  const openAddModal = () => {
    setIsEditing(false)
    setForm(emptyForm(developmentOptions[0] ?? 'Columbiana'))
    setFormError(null)
    setIsModalOpen(true)
  }

  const openEditModal = (prospect: TenantProspect) => {
    setIsEditing(true)
    setForm(toFormState(prospect))
    setFormError(null)
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setFormError(null)
    setIsModalOpen(false)
  }

  const handleFormChange = <K extends keyof ProspectFormState>(
    key: K,
    value: ProspectFormState[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSaveProspect = async () => {
    if (!form.name.trim()) {
      setFormError('Prospect name is required.')
      return
    }
    if (!form.development.trim()) {
      setFormError('Development is required.')
      return
    }
    if (form.contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail.trim())) {
      setFormError('Please enter a valid contact email.')
      return
    }
    if ((form.nextAction.trim() && !form.nextActionDate.trim()) || (!form.nextAction.trim() && form.nextActionDate.trim())) {
      setFormError('Next Action and Next Action Date should be provided together.')
      return
    }
    setFormError(null)

    const payload = {
      name: form.name.trim(),
      development: form.development.trim(),
      category: form.category,
      contactName: form.contactName.trim(),
      contactEmail: form.contactEmail.trim(),
      contactPhone: form.contactPhone.trim(),
      outreachMethod: form.outreachMethod.trim(),
      stage: form.stage,
      owner: form.owner.trim(),
      nextAction: form.nextAction.trim(),
      nextActionDate: form.nextActionDate.trim(),
      notes: form.notes.trim(),
    }

    try {
      if (isOnlineMode()) {
        if (isEditing && form.id) {
          const updated = await updateTenantProspect(form.id, payload)
          setProspects((prev) =>
            prev.map((prospect) => (prospect.id === updated.id ? updated : prospect)),
          )
        } else {
          const created = await createTenantProspect(payload)
          setProspects((prev) => [created, ...prev])
        }
      } else {
        const localPayload: TenantProspect = {
          id: form.id ?? `prospect-${Date.now()}`,
          ...payload,
        }
        setProspects((prev) => {
          if (!isEditing) return [localPayload, ...prev]
          return prev.map((prospect) =>
            prospect.id === localPayload.id ? localPayload : prospect,
          )
        })
      }

      setSyncError(null)
      setSyncSuccess(isEditing ? 'Prospect updated.' : 'Prospect added.')
      setIsModalOpen(false)
    } catch (error) {
      console.error('Failed to save tenant prospect:', error)
      setSyncError(getSupabaseFriendlyError(error, 'Unable to save changes to Supabase.'))
    }
  }

  const handlePushToDealWorkspace = async (prospect: TenantProspect) => {
    if (!isOnlineMode()) {
      setSyncError('Deal Workspace push requires online mode.')
      return
    }

    try {
      const created = await createDeal({
        deal_name: prospect.name,
        location: prospect.development,
        type: 'commercial',
        status: 'active-pipeline',
        contact: {
          name: prospect.contactName || undefined,
          email: prospect.contactEmail || undefined,
          phone: prospect.contactPhone || undefined,
          notes: prospect.notes || undefined,
        },
      })

      if (!created?.id) {
        setSyncError('Unable to create deal from this prospect.')
        return
      }

      setSyncError(null)
      setSyncSuccess('Deal created. Opening workspace...')
      onOpenDealWorkspace?.(created.id)
    } catch (error) {
      console.error('Failed to push prospect to deal workspace:', error)
      setSyncError(getSupabaseFriendlyError(error, 'Failed to push this prospect to Deal Workspace.'))
    }
  }

  const handleDeleteProspect = async (prospectId: string) => {
    const confirmed = window.confirm('Delete this prospect from the tenant pipeline?')
    if (!confirmed) return

    try {
      if (isOnlineMode()) {
        await deleteTenantProspect(prospectId)
      }
      setProspects((prev) => prev.filter((prospect) => prospect.id !== prospectId))
      setSyncError(null)
      setSyncSuccess('Prospect deleted.')
    } catch (error) {
      console.error('Failed to delete tenant prospect:', error)
      setSyncError(getSupabaseFriendlyError(error, 'Unable to delete this prospect from Supabase.'))
    }
  }

  const handleStageDrop = async (targetStage: ProspectStage) => {
    if (!draggedProspectId) return

    const original = prospects.find((prospect) => prospect.id === draggedProspectId)
    setDragOverStage(null)
    setDraggedProspectId(null)
    if (!original || original.stage === targetStage) return

    setProspects((prev) =>
      prev.map((prospect) =>
        prospect.id === original.id ? { ...prospect, stage: targetStage } : prospect,
      ),
    )

    if (!isOnlineMode()) return

    try {
      await updateTenantProspect(original.id, {
        name: original.name,
        development: original.development,
        category: original.category,
        contactName: original.contactName,
        contactEmail: original.contactEmail,
        contactPhone: original.contactPhone,
        outreachMethod: original.outreachMethod,
        stage: targetStage,
        owner: original.owner,
        nextAction: original.nextAction,
        nextActionDate: original.nextActionDate,
        notes: original.notes,
      })
      setSyncError(null)
      setSyncSuccess(`Moved to ${targetStage}.`)
    } catch (error) {
      console.error('Failed to update prospect stage:', error)
      setProspects((prev) =>
        prev.map((prospect) =>
          prospect.id === original.id ? { ...prospect, stage: original.stage } : prospect,
        ),
      )
      setSyncError(getSupabaseFriendlyError(error, 'Unable to update stage in Supabase. Reverted move.'))
    }
  }

  const renderProspectCard = (prospect: TenantProspect, isDraggable = false) => (
    <article
      key={prospect.id}
      draggable={isDraggable}
      onDragStart={
        isDraggable
          ? () => {
              setDraggedProspectId(prospect.id)
            }
          : undefined
      }
      onDragEnd={
        isDraggable
          ? () => {
              setDraggedProspectId(null)
              setDragOverStage(null)
            }
          : undefined
      }
      className={`relative rounded-md border border-border/60 bg-card p-3 shadow-sm transition-shadow hover:shadow-md ${
        isDraggable ? 'cursor-grab active:cursor-grabbing' : ''
      } ${draggedProspectId === prospect.id ? 'opacity-60' : ''}`}
    >
      <span
        className={`absolute left-0 top-0 h-full w-1 rounded-l-md ${CATEGORY_STYLES[prospect.category].accent}`}
        aria-hidden
      />
      <h3 className="pl-1 pr-24 text-sm font-semibold text-foreground">{prospect.name}</h3>
      <button
        type="button"
        onClick={() => openEditModal(prospect)}
        className="absolute right-2 top-2 rounded border border-border/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted/40"
      >
        Edit
      </button>
      <button
        type="button"
        onClick={() => handleDeleteProspect(prospect.id)}
        className="absolute right-2 top-9 rounded border border-rose-500/30 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
      >
        Delete
      </button>

      <div className="mt-1 pl-1">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${CATEGORY_STYLES[prospect.category].badge}`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {prospect.category}
        </span>
      </div>

      <dl className="mt-2 space-y-1 pl-1 text-xs text-muted-foreground">
        <div><dt className="inline font-semibold text-foreground">Development:</dt> <dd className="inline"> {prospect.development}</dd></div>
        <div><dt className="inline font-semibold text-foreground">Contact:</dt> <dd className="inline"> {prospect.contactName}</dd></div>
        {prospect.contactEmail && (
          <div><dt className="inline font-semibold text-foreground">Email:</dt> <dd className="inline"> {prospect.contactEmail}</dd></div>
        )}
        {prospect.contactPhone && (
          <div><dt className="inline font-semibold text-foreground">Phone:</dt> <dd className="inline"> {prospect.contactPhone}</dd></div>
        )}
        <div><dt className="inline font-semibold text-foreground">Outreach:</dt> <dd className="inline"> {prospect.outreachMethod}</dd></div>
        <div><dt className="inline font-semibold text-foreground">Stage:</dt> <dd className="inline"> {prospect.stage}</dd></div>
        <div><dt className="inline font-semibold text-foreground">Owner:</dt> <dd className="inline"> {prospect.owner}</dd></div>
      </dl>

      <div className="mt-2 rounded-sm border-l-2 border-emerald-600 bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground">
        <span className="font-semibold text-foreground">Next:</span> {prospect.nextAction}
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">
        Due: <span className="font-medium">{formatDate(prospect.nextActionDate)}</span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{prospect.notes}</p>

      {prospect.stage === 'LOI Signed' && (
        <Button
          size="sm"
          onClick={() => handlePushToDealWorkspace(prospect)}
          className="mt-3 w-full bg-emerald-700 text-white hover:bg-emerald-600"
        >
          Push to Deal Workspace
        </Button>
      )}
    </article>
  )

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Top action strip — back link + Development filter + Add Prospect */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to Dashboard
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="development-filter" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Development
          </label>
          <select
            id="development-filter"
            value={developmentFilter}
            onChange={(e) => setDevelopmentFilter(e.target.value)}
            className="h-9 rounded-md border border-border/60 bg-card px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">All Developments</option>
            {developmentOptions.map((development) => (
              <option key={development} value={development}>
                {development}
              </option>
            ))}
          </select>
          <Button onClick={openAddModal} size="sm">
            + Prospect
          </Button>
        </div>
      </div>

      {/* Stage indicator strip — quick visual count of all stages */}
      <div className="hidden flex-wrap items-center gap-4 rounded-lg border border-border/60 bg-card/50 px-3 py-2 md:flex">
        {STAGES.map((stage) => (
          <div key={stage} className="flex shrink-0 items-center gap-2">
            <span className={`size-2 rounded-full ${STAGE_STYLES[stage].dot}`} />
            <span className="text-xs font-medium text-muted-foreground">{stage}</span>
            <span className="text-xs font-semibold tabular-nums text-foreground">{stageCounts[stage]}</span>
          </div>
        ))}
        <div className="ml-auto shrink-0 text-xs font-semibold tabular-nums">
          Total: {filteredProspects.length}
        </div>
      </div>

      {syncError && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          <span>{syncError}</span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[11px]"
            onClick={loadProspects}
          >
            Retry
          </Button>
        </div>
      )}

      {syncSuccess && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
          {syncSuccess}
        </div>
      )}

      {isLoading && (
        <div className="py-6 text-sm text-muted-foreground">
          Loading tenant pipeline…
        </div>
      )}

      {/* Mobile stage picker + list */}
      {!isLoading && (
      <section className="md:hidden">
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {STAGES.map((stage) => (
            <button
              key={stage}
              type="button"
              onClick={() => setActiveMobileStage(stage)}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                activeMobileStage === stage
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border/60 bg-card text-foreground hover:bg-accent',
              )}
            >
              {stage} ({stageCounts[stage]})
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {mobileStageProspects.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/60 bg-card/50 p-5 text-center text-sm italic text-muted-foreground">
              No prospects in {activeMobileStage}
            </div>
          ) : (
            mobileStageProspects.map((prospect) => renderProspectCard(prospect))
          )}
        </div>
      </section>
      )}

      {/* Desktop kanban — horizontal scroll, each column min-w-64 */}
      {!isLoading && (
      <div className="hidden overflow-x-auto md:block">
        <div className="flex items-start gap-3 pb-4">
          {STAGES.map((stage) => {
            const stageProspects = filteredProspects.filter((p) => p.stage === stage)
            const stageStyle = STAGE_STYLES[stage]

            return (
              <section
                key={stage}
                className="flex w-64 shrink-0 flex-col overflow-hidden rounded-lg border border-border/60 bg-card/50"
              >
                <div className="flex items-center justify-between border-b border-border/60 bg-card px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className={cn('size-2 rounded-full', stageStyle.dot)} />
                    <h2 className={cn('text-xs font-semibold uppercase tracking-wide', stageStyle.title)}>
                      {stage}
                    </h2>
                  </div>
                  <span className={cn('flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums', stageStyle.count)}>
                    {stageProspects.length}
                  </span>
                </div>
                <div
                  onDragOver={(event) => {
                    event.preventDefault()
                    setDragOverStage(stage)
                  }}
                  onDragLeave={() => {
                    if (dragOverStage === stage) setDragOverStage(null)
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    handleStageDrop(stage)
                  }}
                  className={cn(
                    'min-h-[420px] flex-1 space-y-2 p-2 transition-colors',
                    dragOverStage === stage && 'ring-2 ring-primary ring-inset',
                  )}
                >
                  {stageProspects.length === 0 ? (
                    <div className="rounded-md border border-dashed border-border/60 p-4 text-center text-xs italic text-muted-foreground">
                      No prospects
                    </div>
                  ) : (
                    stageProspects.map((prospect) => renderProspectCard(prospect, true))
                  )}
                </div>
              </section>
            )
          })}
        </div>
      </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center">
          <div className="my-4 w-full max-w-2xl rounded-xl border border-border/60 bg-card shadow-2xl sm:max-h-[90vh] sm:overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
              <h2 className="text-lg font-semibold text-foreground">
                {isEditing ? 'Edit Prospect' : 'Add Prospect'}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="rounded p-1 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="mx-5 mt-4 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 px-5 py-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Prospect Name
                </label>
                <input
                  value={form.name}
                  onChange={(e) => handleFormChange('name', e.target.value)}
                  className="h-10 w-full rounded-md border border-border/60 px-3 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Development
                </label>
                <input
                  value={form.development}
                  onChange={(e) => handleFormChange('development', e.target.value)}
                  list="development-options"
                  className="h-10 w-full rounded-md border border-border/60 px-3 text-sm"
                />
                <datalist id="development-options">
                  {developmentOptions.map((development) => (
                    <option key={development} value={development} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Category
                </label>
                <select
                  value={form.category}
                  onChange={(e) => handleFormChange('category', e.target.value as ProspectCategory)}
                  className="h-10 w-full rounded-md border border-border/60 px-3 text-sm"
                >
                  {CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Stage
                </label>
                <select
                  value={form.stage}
                  onChange={(e) => handleFormChange('stage', e.target.value as ProspectStage)}
                  className="h-10 w-full rounded-md border border-border/60 px-3 text-sm"
                >
                  {STAGES.map((stage) => (
                    <option key={stage} value={stage}>
                      {stage}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Owner
                </label>
                <input
                  value={form.owner}
                  onChange={(e) => handleFormChange('owner', e.target.value)}
                  className="h-10 w-full rounded-md border border-border/60 px-3 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Contact Name
                </label>
                <input
                  value={form.contactName}
                  onChange={(e) => handleFormChange('contactName', e.target.value)}
                  className="h-10 w-full rounded-md border border-border/60 px-3 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Contact Email
                </label>
                <input
                  type="email"
                  value={form.contactEmail}
                  onChange={(e) => handleFormChange('contactEmail', e.target.value)}
                  className="h-10 w-full rounded-md border border-border/60 px-3 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Contact Phone
                </label>
                <input
                  value={form.contactPhone}
                  onChange={(e) => handleFormChange('contactPhone', e.target.value)}
                  className="h-10 w-full rounded-md border border-border/60 px-3 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Outreach Method
                </label>
                <select
                  value={form.outreachMethod}
                  onChange={(e) => handleFormChange('outreachMethod', e.target.value)}
                  className="h-10 w-full rounded-md border border-border/60 px-3 text-sm"
                >
                  {OUTREACH_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {method}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Next Action Date
                </label>
                <input
                  type="date"
                  value={form.nextActionDate}
                  onChange={(e) => handleFormChange('nextActionDate', e.target.value)}
                  className="h-10 w-full rounded-md border border-border/60 px-3 text-sm"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Next Action
                </label>
                <input
                  value={form.nextAction}
                  onChange={(e) => handleFormChange('nextAction', e.target.value)}
                  className="h-10 w-full rounded-md border border-border/60 px-3 text-sm"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Notes
                </label>
                <textarea
                  value={form.notes}
                  onChange={(e) => handleFormChange('notes', e.target.value)}
                  className="min-h-24 w-full rounded-md border border-border/60 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-border/60 px-5 py-4">
              <Button variant="outline" onClick={closeModal}>
                Cancel
              </Button>
              <Button onClick={handleSaveProspect}>
                Save Prospect
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
