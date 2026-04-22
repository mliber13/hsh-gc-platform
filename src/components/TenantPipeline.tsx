import React, { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import hshLogo from '/HSH Contractor Logo - Color.png'
import { ChevronDown } from 'lucide-react'
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

const STAGE_STYLES: Record<
  ProspectStage,
  {
    columnHeader: string
    title: string
    count: string
    dot: string
  }
> = {
  Contacted: {
    columnHeader: 'bg-blue-100',
    title: 'text-blue-800',
    count: 'bg-blue-800 text-white',
    dot: 'bg-blue-500',
  },
  'Meeting Set': {
    columnHeader: 'bg-yellow-100',
    title: 'text-yellow-800',
    count: 'bg-yellow-800 text-white',
    dot: 'bg-yellow-500',
  },
  'Meeting Complete': {
    columnHeader: 'bg-green-100',
    title: 'text-green-800',
    count: 'bg-green-800 text-white',
    dot: 'bg-green-500',
  },
  'Proposal Sent': {
    columnHeader: 'bg-purple-100',
    title: 'text-purple-800',
    count: 'bg-purple-800 text-white',
    dot: 'bg-purple-500',
  },
  Negotiating: {
    columnHeader: 'bg-orange-100',
    title: 'text-orange-800',
    count: 'bg-orange-800 text-white',
    dot: 'bg-orange-500',
  },
  'LOI Signed': {
    columnHeader: 'bg-emerald-100',
    title: 'text-emerald-800',
    count: 'bg-emerald-800 text-white',
    dot: 'bg-emerald-500',
  },
  Dead: {
    columnHeader: 'bg-red-100',
    title: 'text-red-800',
    count: 'bg-red-800 text-white',
    dot: 'bg-red-500',
  },
}

const CATEGORY_STYLES: Record<ProspectCategory, { badge: string; accent: string }> = {
  Grocer: {
    badge: 'bg-emerald-100 text-emerald-800',
    accent: 'bg-emerald-500',
  },
  QSR: {
    badge: 'bg-amber-100 text-amber-800',
    accent: 'bg-amber-500',
  },
  'Casual Dining': {
    badge: 'bg-violet-100 text-violet-800',
    accent: 'bg-violet-500',
  },
  Entertainment: {
    badge: 'bg-pink-100 text-pink-800',
    accent: 'bg-pink-500',
  },
  Retail: {
    badge: 'bg-blue-100 text-blue-800',
    accent: 'bg-blue-500',
  },
  Fitness: {
    badge: 'bg-orange-100 text-orange-800',
    accent: 'bg-orange-500',
  },
  Medical: {
    badge: 'bg-teal-100 text-teal-800',
    accent: 'bg-teal-500',
  },
  Other: {
    badge: 'bg-slate-100 text-slate-700',
    accent: 'bg-slate-400',
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
  const [showMobileActions, setShowMobileActions] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncSuccess, setSyncSuccess] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [draggedProspectId, setDraggedProspectId] = useState<string | null>(null)
  const [dragOverStage, setDragOverStage] = useState<ProspectStage | null>(null)

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
      className={`relative rounded-md border border-[#d4cfc5] bg-white p-3 shadow-sm transition-shadow hover:shadow-md ${
        isDraggable ? 'cursor-grab active:cursor-grabbing' : ''
      } ${draggedProspectId === prospect.id ? 'opacity-60' : ''}`}
    >
      <span
        className={`absolute left-0 top-0 h-full w-1 rounded-l-md ${CATEGORY_STYLES[prospect.category].accent}`}
        aria-hidden
      />
      <h3 className="pl-1 pr-24 text-sm font-semibold text-[#1a1a18]">{prospect.name}</h3>
      <button
        type="button"
        onClick={() => openEditModal(prospect)}
        className="absolute right-2 top-2 rounded border border-gray-300 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-600 hover:bg-gray-100"
      >
        Edit
      </button>
      <button
        type="button"
        onClick={() => handleDeleteProspect(prospect.id)}
        className="absolute right-2 top-9 rounded border border-red-200 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-red-700 hover:bg-red-50"
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

      <dl className="mt-2 space-y-1 pl-1 text-xs text-[#5e5e5a]">
        <div><dt className="inline font-semibold text-[#444]">Development:</dt> <dd className="inline"> {prospect.development}</dd></div>
        <div><dt className="inline font-semibold text-[#444]">Contact:</dt> <dd className="inline"> {prospect.contactName}</dd></div>
        {prospect.contactEmail && (
          <div><dt className="inline font-semibold text-[#444]">Email:</dt> <dd className="inline"> {prospect.contactEmail}</dd></div>
        )}
        {prospect.contactPhone && (
          <div><dt className="inline font-semibold text-[#444]">Phone:</dt> <dd className="inline"> {prospect.contactPhone}</dd></div>
        )}
        <div><dt className="inline font-semibold text-[#444]">Outreach:</dt> <dd className="inline"> {prospect.outreachMethod}</dd></div>
        <div><dt className="inline font-semibold text-[#444]">Stage:</dt> <dd className="inline"> {prospect.stage}</dd></div>
        <div><dt className="inline font-semibold text-[#444]">Owner:</dt> <dd className="inline"> {prospect.owner}</dd></div>
      </dl>

      <div className="mt-2 rounded-sm border-l-2 border-emerald-600 bg-[#f5f2eb] px-2 py-1 text-[11px] text-[#555]">
        <span className="font-semibold text-[#444]">Next:</span> {prospect.nextAction}
      </div>
      <div className="mt-1 text-[11px] text-[#666]">
        Due: <span className="font-medium">{formatDate(prospect.nextActionDate)}</span>
      </div>
      <p className="mt-1 text-[11px] text-[#666]">{prospect.notes}</p>

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
    <div className="min-h-screen bg-[#f5f2eb]">
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white shadow-md">
        <div className="mx-auto flex max-w-[1700px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <img
              src={hshLogo}
              alt="HSH"
              className="h-12 w-auto shrink-0 sm:h-16"
            />
            <div>
              <h1 className="text-xl font-semibold text-gray-900 sm:text-2xl">Tenant Pipeline</h1>
              <p className="text-xs text-gray-500 sm:text-sm">Prospect tracking by leasing stage</p>
            </div>
          </div>
          <div className="hidden flex-wrap items-center gap-2 md:flex">
            <label htmlFor="development-filter" className="text-xs font-semibold uppercase tracking-wide text-gray-600">
              Development
            </label>
            <select
              id="development-filter"
              value={developmentFilter}
              onChange={(e) => setDevelopmentFilter(e.target.value)}
              className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-700 outline-none"
            >
              <option value="all">All Developments</option>
              {developmentOptions.map((development) => (
                <option key={development} value={development}>
                  {development}
                </option>
              ))}
            </select>
            <Button onClick={openAddModal} size="sm" className="bg-[#0E79C9] text-white hover:bg-[#0A5A96]">
              + Prospect
            </Button>
            <Button onClick={onBack} size="sm" variant="outline">
              Back to Dashboard
            </Button>
          </div>
        </div>
      </header>

      <div className="hidden border-b border-[#d4cfc5] bg-[#ede9df] px-4 py-2 sm:px-6 md:block lg:px-8">
        <div className="mx-auto flex max-w-[1700px] items-center gap-4 overflow-x-auto">
          {STAGES.map((stage) => (
            <div key={stage} className="flex shrink-0 items-center gap-2 rounded-md px-2 py-1">
              <span className={`h-2 w-2 rounded-full ${STAGE_STYLES[stage].dot}`} />
              <span className="text-xs font-medium text-[#555]">{stage}</span>
              <span className="text-xs font-bold text-[#1a1a18]">{stageCounts[stage]}</span>
            </div>
          ))}
          <div className="ml-auto shrink-0 text-xs font-semibold text-[#1a1a18]">
            Total: {filteredProspects.length}
          </div>
        </div>
      </div>

      {syncError && (
        <div className="mx-auto mt-3 max-w-[1700px] px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <span>{syncError}</span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 border-amber-300 bg-amber-100 px-2 text-[11px] text-amber-900 hover:bg-amber-200"
              onClick={loadProspects}
            >
              Retry
            </Button>
          </div>
        </div>
      )}

      {syncSuccess && (
        <div className="mx-auto mt-3 max-w-[1700px] px-4 sm:px-6 lg:px-8">
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            {syncSuccess}
          </div>
        </div>
      )}

      {isLoading && (
        <div className="mx-auto max-w-[1700px] px-4 py-6 text-sm text-gray-600 sm:px-6 lg:px-8">
          Loading tenant pipeline...
        </div>
      )}

      {/* Mobile stage picker + list */}
      {!isLoading && (
      <section className="mx-auto max-w-[1700px] px-4 py-4 pb-24 sm:px-6 md:hidden">
        <div className="mb-3">
          <label
            htmlFor="development-filter-mobile-top"
            className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600"
          >
            Development
          </label>
          <select
            id="development-filter-mobile-top"
            value={developmentFilter}
            onChange={(e) => setDevelopmentFilter(e.target.value)}
            className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-700 outline-none"
          >
            <option value="all">All Developments</option>
            {developmentOptions.map((development) => (
              <option key={development} value={development}>
                {development}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {STAGES.map((stage) => (
            <button
              key={stage}
              type="button"
              onClick={() => setActiveMobileStage(stage)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                activeMobileStage === stage
                  ? 'border-[#1c3d2e] bg-[#1c3d2e] text-white'
                  : 'border-[#d4cfc5] bg-white text-[#444]'
              }`}
            >
              {stage} ({stageCounts[stage]})
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {mobileStageProspects.length === 0 ? (
            <div className="rounded-md border border-dashed border-[#d4cfc5] bg-[#ede9df] p-5 text-center text-sm italic text-[#777]">
              No prospects in {activeMobileStage}
            </div>
          ) : (
            mobileStageProspects.map((prospect) => renderProspectCard(prospect))
          )}
        </div>
      </section>
      )}

      {/* Desktop board */}
      {!isLoading && (
      <main className="mx-auto hidden max-w-[1700px] px-4 py-6 sm:px-6 md:block lg:px-8">
        <div className="grid grid-cols-7 items-start gap-3">
          {STAGES.map((stage) => {
            const stageProspects = filteredProspects.filter((p) => p.stage === stage)
            const stageStyle = STAGE_STYLES[stage]

            return (
              <section key={stage} className="min-w-0 overflow-hidden rounded-lg">
                <div className={`flex items-center justify-between px-3 py-2 ${stageStyle.columnHeader}`}>
                  <h2 className={`text-[11px] font-bold uppercase tracking-wide ${stageStyle.title}`}>
                    {stage}
                  </h2>
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${stageStyle.count}`}>
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
                  className={`min-h-[420px] space-y-2 border border-[#d4cfc5] border-t-0 bg-[#ede9df] p-2 ${
                    dragOverStage === stage ? 'ring-2 ring-emerald-400 ring-inset' : ''
                  }`}
                >
                  {stageProspects.length === 0 ? (
                    <div className="rounded-md border border-dashed border-[#d4cfc5] p-4 text-center text-xs italic text-[#999]">
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
      </main>
      )}

      {/* Mobile bottom actions - mirrors dashboard pattern */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white md:hidden">
        {showMobileActions && (
          <div className="max-h-72 overflow-y-auto border-b border-gray-100 bg-gray-50 px-3 py-2">
            <button
              onClick={() => {
                openAddModal()
                setShowMobileActions(false)
              }}
              className="mb-1 w-full rounded-lg border border-[#0E79C9]/20 bg-[#0E79C9]/5 px-3 py-2.5 text-left text-sm font-medium text-gray-800 hover:bg-white"
            >
              + Add Prospect
            </button>
            <button
              onClick={() => {
                onBack()
                setShowMobileActions(false)
              }}
              className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-gray-700 hover:bg-white"
            >
              Back to Dashboard
            </button>
          </div>
        )}

        <div className="p-2">
          <Button
            onClick={() => setShowMobileActions(!showMobileActions)}
            variant="outline"
            className="h-11 w-full border-gray-200 bg-white hover:bg-gray-50"
          >
            <span className="flex items-center justify-center gap-2 text-gray-700">
              Actions
              <ChevronDown
                className={`h-4 w-4 transition-transform ${showMobileActions ? 'rotate-180' : ''}`}
              />
            </span>
          </Button>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center">
          <div className="my-4 w-full max-w-2xl rounded-xl border border-gray-200 bg-white shadow-2xl sm:max-h-[90vh] sm:overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                {isEditing ? 'Edit Prospect' : 'Add Prospect'}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="mx-5 mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 px-5 py-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Prospect Name
                </label>
                <input
                  value={form.name}
                  onChange={(e) => handleFormChange('name', e.target.value)}
                  className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Development
                </label>
                <input
                  value={form.development}
                  onChange={(e) => handleFormChange('development', e.target.value)}
                  list="development-options"
                  className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm"
                />
                <datalist id="development-options">
                  {developmentOptions.map((development) => (
                    <option key={development} value={development} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Category
                </label>
                <select
                  value={form.category}
                  onChange={(e) => handleFormChange('category', e.target.value as ProspectCategory)}
                  className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm"
                >
                  {CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Stage
                </label>
                <select
                  value={form.stage}
                  onChange={(e) => handleFormChange('stage', e.target.value as ProspectStage)}
                  className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm"
                >
                  {STAGES.map((stage) => (
                    <option key={stage} value={stage}>
                      {stage}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Owner
                </label>
                <input
                  value={form.owner}
                  onChange={(e) => handleFormChange('owner', e.target.value)}
                  className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Contact Name
                </label>
                <input
                  value={form.contactName}
                  onChange={(e) => handleFormChange('contactName', e.target.value)}
                  className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Contact Email
                </label>
                <input
                  type="email"
                  value={form.contactEmail}
                  onChange={(e) => handleFormChange('contactEmail', e.target.value)}
                  className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Contact Phone
                </label>
                <input
                  value={form.contactPhone}
                  onChange={(e) => handleFormChange('contactPhone', e.target.value)}
                  className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Outreach Method
                </label>
                <select
                  value={form.outreachMethod}
                  onChange={(e) => handleFormChange('outreachMethod', e.target.value)}
                  className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm"
                >
                  {OUTREACH_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {method}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Next Action Date
                </label>
                <input
                  type="date"
                  value={form.nextActionDate}
                  onChange={(e) => handleFormChange('nextActionDate', e.target.value)}
                  className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Next Action
                </label>
                <input
                  value={form.nextAction}
                  onChange={(e) => handleFormChange('nextAction', e.target.value)}
                  className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Notes
                </label>
                <textarea
                  value={form.notes}
                  onChange={(e) => handleFormChange('notes', e.target.value)}
                  className="min-h-24 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-4">
              <Button variant="outline" onClick={closeModal}>
                Cancel
              </Button>
              <Button onClick={handleSaveProspect} className="bg-[#1c3d2e] text-white hover:bg-[#2d6147]">
                Save Prospect
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
