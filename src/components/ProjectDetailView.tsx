// ============================================================================
// HSH GC Platform - Project Detail View
// ============================================================================
//
// Detail page for a selected project. Renders inside the AppLayout shell.
// Centered title in AppHeader is "Project Overview" — the project name is
// already visible in the ProjectSelector pill on the left of the header, so
// the centered title acts as a page-section label instead of repeating the
// entity name.
//
// Data layer (estimate totals, actual totals, forms count, selection book
// rooms count, available plans for edit mode) preserved 1:1 from the
// pre-shell version. View layer rebuilt to use design tokens and the v0
// project-detail pattern: project info card → financial overview cards →
// quick-action grid → embedded sections (work packages, milestones).
//
// Edit/Duplicate/Delete actions moved from the legacy hero header into a
// top-right "Actions" dropdown.
//

import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  BookMarked,
  BookOpen,
  Building2,
  Calendar,
  ClipboardList,
  Copy,
  DollarSign,
  Edit,
  FolderOpen,
  GitBranch,
  MapPin,
  MoreHorizontal,
  Receipt,
  Trash2,
} from 'lucide-react'
import { Project, ProjectType, ProjectStatus, Plan, PROJECT_TYPES, PROJECT_STATUS } from '@/types'
import { duplicateProject } from '@/services/projectService'
import {
  getTradesForEstimate_Hybrid,
  updateProject_Hybrid,
  deleteProject_Hybrid,
} from '@/services/hybridService'
import { getActivePlans_Hybrid } from '@/services/planHybridService'
import { getProjectActuals_Hybrid } from '@/services/actualsHybridService'
import { getSelectionBookRoomsCount } from '@/services/selectionBookService'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { usePageTitle } from '@/contexts/PageTitleContext'

// ============================================================================
// Types + helpers
// ============================================================================

interface ProjectDetailViewProps {
  project: Project
  onBack: () => void
  onViewEstimate: () => void
  onViewActuals: () => void
  onViewChangeOrders?: () => void
  onViewForms: () => void
  onViewDocuments?: () => void
  onViewPOs?: () => void
  onViewSelectionBook?: () => void
  onViewSelectionSchedules?: () => void
  onViewSchedule?: () => void
  onProjectDuplicated?: (project: Project) => void
}

interface StatusVisual {
  bg: string
  text: string
  border: string
  dot: string
  label: string
}

function statusVisual(status: string): StatusVisual {
  switch (status) {
    case 'estimating':
      return {
        bg: 'bg-violet-500/15',
        text: 'text-violet-500',
        border: 'border-violet-500/30',
        dot: 'bg-violet-500',
        label: 'Estimating',
      }
    case 'bidding':
      return {
        bg: 'bg-amber-500/15',
        text: 'text-amber-500',
        border: 'border-amber-500/30',
        dot: 'bg-amber-500',
        label: 'Bidding',
      }
    case 'awarded':
      return {
        bg: 'bg-sky-500/15',
        text: 'text-sky-500',
        border: 'border-sky-500/30',
        dot: 'bg-sky-500',
        label: 'Awarded',
      }
    case 'in-progress':
      return {
        bg: 'bg-emerald-500/15',
        text: 'text-emerald-500',
        border: 'border-emerald-500/30',
        dot: 'bg-emerald-500',
        label: 'In Progress',
      }
    case 'complete':
      return {
        bg: 'bg-sky-500/15',
        text: 'text-sky-500',
        border: 'border-sky-500/30',
        dot: 'bg-sky-500',
        label: 'Complete',
      }
    default:
      return {
        bg: 'bg-muted',
        text: 'text-muted-foreground',
        border: 'border-border',
        dot: 'bg-muted-foreground',
        label: status,
      }
  }
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

function formatCurrencyCompact(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function addressString(project: Project): string {
  const street =
    typeof project.address === 'string'
      ? project.address
      : project.address?.street || ''
  const city = project.city ?? ''
  const state = project.state ?? ''
  return [street, city && state ? `${city}, ${state}` : city || state]
    .filter(Boolean)
    .join(' · ') || 'No address'
}

// ============================================================================
// Component
// ============================================================================

export function ProjectDetailView({
  project,
  onBack,
  onViewEstimate,
  onViewActuals,
  onViewChangeOrders,
  onViewForms,
  onViewDocuments,
  onViewPOs,
  onViewSelectionBook,
  onViewSelectionSchedules,
  onViewSchedule,
  onProjectDuplicated,
}: ProjectDetailViewProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedProject, setEditedProject] = useState(project)
  const [availablePlans, setAvailablePlans] = useState<Plan[]>([])
  const [estimateTotals, setEstimateTotals] = useState({
    basePriceTotal: 0,
    grossProfitTotal: 0,
    totalEstimated: 0,
    itemCount: 0,
  })
  const [formsCount, setFormsCount] = useState(0)
  const [selectionBookRoomsCount, setSelectionBookRoomsCount] = useState(0)
  const [actualTotals, setActualTotals] = useState({
    laborCost: 0,
    materialCost: 0,
    subcontractorCost: 0,
    totalActual: 0,
  })

  // Centered title in the AppHeader
  usePageTitle('Project Overview')

  // Load plans when entering edit mode
  useEffect(() => {
    if (isEditing) {
      void getActivePlans_Hybrid().then(setAvailablePlans)
    }
  }, [isEditing])

  // Estimate totals
  useEffect(() => {
    const loadTotals = async () => {
      const trades = await getTradesForEstimate_Hybrid(project.estimate.id)
      const basePriceTotal = trades.reduce((sum, t) => sum + t.totalCost, 0)
      const grossProfitTotal = trades.reduce(
        (sum, t) => sum + t.totalCost * ((t.markupPercent || 20) / 100),
        0,
      )
      const contingency = basePriceTotal * 0.1
      const totalEstimated = basePriceTotal + grossProfitTotal + contingency
      setEstimateTotals({
        basePriceTotal,
        grossProfitTotal,
        totalEstimated,
        itemCount: trades.length,
      })
    }
    void loadTotals()
  }, [project])

  // Forms count
  useEffect(() => {
    const loadFormsCount = async () => {
      try {
        const { data } = await supabase
          .from('project_forms')
          .select('id')
          .eq('project_id', project.id)
        setFormsCount(data?.length || 0)
      } catch (error) {
        console.error('Error loading forms count:', error)
      }
    }
    if (project) void loadFormsCount()
  }, [project])

  // Actuals
  useEffect(() => {
    const loadActuals = async () => {
      const actuals = await getProjectActuals_Hybrid(project.id)
      if (actuals) {
        setActualTotals({
          laborCost: actuals.totalLaborCost,
          materialCost: actuals.totalMaterialCost,
          subcontractorCost: actuals.totalSubcontractorCost,
          totalActual: actuals.totalActualCost,
        })
      }
    }
    void loadActuals()
  }, [project.id])

  // Selection book rooms
  useEffect(() => {
    const loadSelectionBookCount = async () => {
      try {
        const count = await getSelectionBookRoomsCount(project.id)
        setSelectionBookRoomsCount(count)
      } catch (error) {
        console.error('Error loading selection book rooms count:', error)
      }
    }
    void loadSelectionBookCount()
  }, [project.id])

  // ----------------------------------------------------------------------------
  // Handlers
  // ----------------------------------------------------------------------------

  const handleSaveEdit = async () => {
    const updated = await updateProject_Hybrid(project.id, {
      id: project.id,
      name: editedProject.name,
      type: editedProject.type,
      status: editedProject.status,
      address: editedProject.address,
      city: editedProject.city,
      state: editedProject.state,
      zipCode: editedProject.zipCode,
      startDate: editedProject.startDate,
      endDate: editedProject.endDate,
      metadata: editedProject.metadata,
      client: editedProject.client,
      specs: editedProject.specs,
    })
    if (updated) {
      setIsEditing(false)
      window.location.reload()
    }
  }

  const handleDelete = async () => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${project.name}"?\n\nThis action cannot be undone. All project data including estimates will be permanently deleted.`,
    )
    if (!confirmed) return
    const success = await deleteProject_Hybrid(project.id)
    if (success) {
      alert('✅ Project deleted successfully!')
      onBack()
    } else {
      alert('❌ Failed to delete project. Please try again.')
    }
  }

  const handleDuplicate = () => {
    const newName = prompt(
      `Enter name for the duplicated project:`,
      `${project.name} (Copy)`,
    )
    if (newName && newName.trim()) {
      const newProject = duplicateProject(project.id, newName.trim())
      if (newProject) {
        alert('✅ Project duplicated successfully!')
        if (onProjectDuplicated) onProjectDuplicated(newProject)
      } else {
        alert('❌ Failed to duplicate project. Please try again.')
      }
    }
  }

  // ----------------------------------------------------------------------------
  // Computed
  // ----------------------------------------------------------------------------

  const status = statusVisual(project.status)
  const completionPercent =
    estimateTotals.totalEstimated > 0
      ? Math.round((actualTotals.totalActual / estimateTotals.totalEstimated) * 100)
      : 0
  const remaining = estimateTotals.totalEstimated - actualTotals.totalActual
  const planDisplay =
    project.metadata?.isCustomPlan || !project.metadata?.planId
      ? 'Custom plan'
      : `Plan: ${project.metadata.planId}`

  // ----------------------------------------------------------------------------
  // Render
  // ----------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Top action strip — back link + actions menu */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to Projects
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <MoreHorizontal className="size-4" />
              Actions
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => setIsEditing(true)}>
              <Edit className="size-4" />
              Edit Project
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleDuplicate}>
              <Copy className="size-4" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="size-4" />
              Delete Project
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Project info card — hero block with status, location, plan, dates, completion */}
      <Card className="overflow-hidden border-border/60 bg-card/50">
        <CardContent className="p-0">
          <div className="flex flex-col lg:flex-row">
            {/* Visual block (left, lg+) */}
            <div className="flex items-center justify-center border-b border-border/50 bg-gradient-to-br from-muted/50 to-muted/20 p-6 lg:w-72 lg:border-b-0 lg:border-r">
              <div className="space-y-3 text-center">
                <div className="mx-auto flex size-16 items-center justify-center rounded-xl bg-primary/10">
                  <Building2 className="size-8 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{project.name}</p>
                  <p className="text-xs text-muted-foreground">{planDisplay}</p>
                </div>
              </div>
            </div>

            {/* Detail grid (right) */}
            <div className="flex-1 p-6">
              <div className="mb-4 flex items-center gap-3">
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
                    status.bg,
                    status.text,
                    status.border,
                  )}
                >
                  <span className={cn('size-1.5 rounded-full', status.dot)} />
                  {status.label}
                </span>
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  {project.type.replace(/-/g, ' ')}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                <InfoCell
                  icon={MapPin}
                  label="Location"
                  primary={
                    typeof project.address === 'string'
                      ? project.address
                      : project.address?.street || 'No address'
                  }
                  secondary={
                    [project.city, project.state].filter(Boolean).join(', ') ||
                    undefined
                  }
                />
                <InfoCell
                  icon={GitBranch}
                  label="Plan"
                  primary={planDisplay.replace('Plan: ', '')}
                  secondary={
                    estimateTotals.itemCount > 0
                      ? `${estimateTotals.itemCount} items`
                      : undefined
                  }
                />
                <InfoCell
                  icon={Calendar}
                  label="Start Date"
                  primary={
                    project.startDate
                      ? new Date(project.startDate).toLocaleDateString()
                      : 'Not set'
                  }
                  secondary={
                    project.endDate
                      ? `End: ${new Date(project.endDate).toLocaleDateString()}`
                      : undefined
                  }
                />
                <div className="space-y-1">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    Completion
                  </p>
                  <p
                    className={cn(
                      'font-medium',
                      completionPercent >= 100 && 'text-emerald-500',
                    )}
                  >
                    {completionPercent}%
                  </p>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${Math.min(completionPercent, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick action grid — seven core sections (Estimate through COs + POs) */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        <ActionCard
          icon={BookOpen}
          iconColor="text-sky-500"
          label="Estimate"
          stat={`${estimateTotals.itemCount} items`}
          onClick={onViewEstimate}
        />
        <ActionCard
          icon={DollarSign}
          iconColor="text-emerald-500"
          label="Actuals"
          stat={
            actualTotals.totalActual > 0
              ? formatCurrencyCompact(actualTotals.totalActual)
              : 'No data'
          }
          onClick={onViewActuals}
        />
        {onViewSchedule && (
          <ActionCard
            icon={Calendar}
            iconColor="text-amber-500"
            label="Schedule"
            stat={`${project.schedule?.items?.length ?? 0} items`}
            onClick={onViewSchedule}
          />
        )}
        {onViewSelectionBook && (
          <ActionCard
            icon={BookMarked}
            iconColor="text-violet-500"
            label="Selection"
            stat={`${selectionBookRoomsCount} rooms`}
            onClick={onViewSelectionBook}
          />
        )}
        {onViewDocuments && (
          <ActionCard
            icon={FolderOpen}
            iconColor="text-indigo-500"
            label="Docs"
            stat="Files"
            onClick={onViewDocuments}
          />
        )}
        {onViewPOs && (
          <ActionCard
            icon={Receipt}
            iconColor="text-teal-500"
            label="POs"
            stat="Subs"
            onClick={onViewPOs}
          />
        )}
        {onViewChangeOrders && (
          <ActionCard
            icon={ClipboardList}
            iconColor="text-rose-500"
            label="COs"
            stat={`${project.actuals?.changeOrders?.length || 0} orders`}
            onClick={onViewChangeOrders}
          />
        )}
      </div>

      {/* Financial overview — three cards (Base / Estimated / Actual) */}
      <div className="grid gap-4 md:grid-cols-3">
        <FinancialCard
          rail="bg-sky-500"
          label="Base Cost"
          value={formatCurrency(estimateTotals.basePriceTotal)}
          valueClass="text-sky-600 dark:text-sky-400"
          hint="Material + Labor + Subs"
        />
        <FinancialCard
          rail="bg-violet-500"
          label="Estimated Total"
          value={formatCurrency(estimateTotals.totalEstimated)}
          valueClass="text-violet-600 dark:text-violet-400"
          hint="With markup & contingency"
        />
        <FinancialCard
          rail="bg-emerald-500"
          label="Actual Spent"
          value={formatCurrency(actualTotals.totalActual)}
          valueClass={
            actualTotals.totalActual > 0
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-muted-foreground'
          }
          hint={
            estimateTotals.totalEstimated > 0
              ? `${formatCurrencyCompact(remaining)} remaining`
              : undefined
          }
        />
      </div>

      {/* Edit modal */}
      {isEditing && (
        <EditProjectModal
          project={editedProject}
          availablePlans={availablePlans}
          onChange={setEditedProject}
          onSave={handleSaveEdit}
          onCancel={() => {
            setIsEditing(false)
            setEditedProject(project)
          }}
        />
      )}
    </div>
  )
}

// ============================================================================
// Pieces
// ============================================================================

function InfoCell({
  icon: Icon,
  label,
  primary,
  secondary,
}: {
  icon: typeof Building2
  label: string
  primary: string
  secondary?: string
}) {
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </p>
      <p className="font-medium capitalize">{primary}</p>
      {secondary && <p className="text-xs text-muted-foreground">{secondary}</p>}
    </div>
  )
}

function FinancialCard({
  rail,
  label,
  value,
  valueClass,
  hint,
}: {
  rail: string
  label: string
  value: string
  valueClass?: string
  hint?: string
}) {
  return (
    <Card className="relative overflow-hidden border-border/60 bg-card/50">
      <div className={cn('absolute inset-y-0 left-0 w-1', rail)} aria-hidden />
      <CardHeader className="pb-2 pl-5">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="pl-5">
        <p
          className={cn(
            'text-2xl font-semibold tabular-nums',
            valueClass ?? 'text-foreground',
          )}
        >
          {value}
        </p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  )
}

function ActionCard({
  icon: Icon,
  iconColor,
  label,
  stat,
  onClick,
}: {
  icon: typeof BookOpen
  iconColor: string
  label: string
  stat: string
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} className="text-left">
      <Card className="h-full border-border/60 bg-card/50 transition-all hover:border-border hover:bg-card">
        <CardContent className="flex flex-col items-center justify-center gap-2 p-6 text-center">
          <Icon className={cn('size-6', iconColor)} />
          <div className="space-y-0.5">
            <p className="text-sm font-medium">{label}</p>
            <p className="text-xs text-muted-foreground">{stat}</p>
          </div>
        </CardContent>
      </Card>
    </button>
  )
}

// ============================================================================
// Edit Modal — preserved 1:1 from pre-shell version, visual chrome swept
// ============================================================================

interface EditProjectModalProps {
  project: Project
  availablePlans: Plan[]
  onChange: (project: Project) => void
  onSave: () => void
  onCancel: () => void
}

function EditProjectModal({
  project: editedProject,
  availablePlans,
  onChange: setEditedProject,
  onSave: handleSaveEdit,
  onCancel,
}: EditProjectModalProps) {
  // Helper: update a spec field while preserving the rest. ProjectSpecs has
  // livingSquareFootage as required, so we must always include it.
  const updateSpec = <K extends keyof NonNullable<Project['specs']>>(
    key: K,
    value: NonNullable<Project['specs']>[K],
  ) => {
    setEditedProject({
      ...editedProject,
      specs: {
        ...editedProject.specs,
        livingSquareFootage: editedProject.specs?.livingSquareFootage ?? 0,
        [key]: value,
      } as NonNullable<Project['specs']>,
    })
  }

  const isRenovation =
    editedProject.type === 'residential-renovation' ||
    editedProject.type === 'commercial-renovation'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto border-border bg-card">
        <CardHeader>
          <CardTitle>Edit Project Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label htmlFor="projectName">Project Name</Label>
              <Input
                id="projectName"
                value={editedProject.name}
                onChange={(e) =>
                  setEditedProject({ ...editedProject, name: e.target.value })
                }
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="planId">Plan ID</Label>
                <Select
                  value={
                    editedProject.metadata?.isCustomPlan
                      ? 'custom'
                      : editedProject.metadata?.planId || '__none__'
                  }
                  onValueChange={(value) =>
                    setEditedProject({
                      ...editedProject,
                      metadata: {
                        ...editedProject.metadata,
                        planId:
                          value === '__none__'
                            ? undefined
                            : value === 'custom'
                              ? undefined
                              : value,
                        isCustomPlan: value === 'custom',
                      },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a plan…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    <SelectItem value="custom">Custom Plan</SelectItem>
                    {availablePlans.map((plan) => (
                      <SelectItem key={plan.id} value={plan.planId}>
                        {plan.name} - {plan.planId}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="projectType">Project Type</Label>
                <Select
                  value={editedProject.type}
                  onValueChange={(value) =>
                    setEditedProject({
                      ...editedProject,
                      type: value as ProjectType,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PROJECT_TYPES).map(([key, value]) => (
                      <SelectItem key={key} value={key}>
                        {value.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="projectStatus">Status</Label>
                <Select
                  value={editedProject.status}
                  onValueChange={(value) =>
                    setEditedProject({
                      ...editedProject,
                      status: value as ProjectStatus,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PROJECT_STATUS).map(([key, value]) => (
                      <SelectItem key={key} value={key}>
                        {value.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="address">Street Address</Label>
              <Input
                id="address"
                value={editedProject.address?.street || ''}
                onChange={(e) =>
                  setEditedProject({
                    ...editedProject,
                    address: {
                      ...editedProject.address!,
                      street: e.target.value,
                    },
                  })
                }
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={editedProject.city || ''}
                  onChange={(e) =>
                    setEditedProject({
                      ...editedProject,
                      city: e.target.value,
                      address: {
                        ...editedProject.address!,
                        city: e.target.value,
                      },
                    })
                  }
                />
              </div>
              <div>
                <Label htmlFor="state">State</Label>
                <Input
                  id="state"
                  value={editedProject.state || ''}
                  onChange={(e) =>
                    setEditedProject({
                      ...editedProject,
                      state: e.target.value,
                      address: {
                        ...editedProject.address!,
                        state: e.target.value,
                      },
                    })
                  }
                />
              </div>
              <div>
                <Label htmlFor="zipCode">ZIP Code</Label>
                <Input
                  id="zipCode"
                  value={editedProject.zipCode || ''}
                  onChange={(e) =>
                    setEditedProject({
                      ...editedProject,
                      zipCode: e.target.value,
                      address: {
                        ...editedProject.address!,
                        zip: e.target.value,
                      },
                    })
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={
                    editedProject.startDate
                      ? new Date(editedProject.startDate)
                          .toISOString()
                          .split('T')[0]
                      : ''
                  }
                  onChange={(e) =>
                    setEditedProject({
                      ...editedProject,
                      startDate: e.target.value
                        ? new Date(e.target.value)
                        : undefined,
                    })
                  }
                />
              </div>
              <div>
                <Label htmlFor="endDate">End Date</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={
                    editedProject.endDate
                      ? new Date(editedProject.endDate)
                          .toISOString()
                          .split('T')[0]
                      : ''
                  }
                  onChange={(e) =>
                    setEditedProject({
                      ...editedProject,
                      endDate: e.target.value
                        ? new Date(e.target.value)
                        : undefined,
                    })
                  }
                />
              </div>
            </div>

            {/* Project Specifications */}
            <div className="space-y-4 border-t border-border pt-6">
              <div>
                <h3 className="text-lg font-semibold">Project Specifications</h3>
                <p className="text-sm text-muted-foreground">
                  Add or update project specifications to help inform budget
                  estimates.
                </p>
              </div>

              {/* Square footage — different fields for renovation */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {isRenovation && (
                  <>
                    <div>
                      <Label htmlFor="existingSquareFootage">
                        Existing Square Footage
                      </Label>
                      <Input
                        id="existingSquareFootage"
                        type="number"
                        value={editedProject.specs?.existingSquareFootage || ''}
                        onChange={(e) => {
                          const existing = e.target.value
                            ? parseFloat(e.target.value)
                            : undefined
                          const newSqft = editedProject.specs?.newSquareFootage || 0
                          setEditedProject({
                            ...editedProject,
                            specs: {
                              ...editedProject.specs,
                              livingSquareFootage:
                                (existing || 0) + newSqft,
                              existingSquareFootage: existing,
                            } as NonNullable<Project['specs']>,
                          })
                        }}
                        placeholder="e.g., 2000"
                      />
                    </div>
                    <div>
                      <Label htmlFor="newSquareFootage">
                        New Square Footage Being Added
                      </Label>
                      <Input
                        id="newSquareFootage"
                        type="number"
                        value={editedProject.specs?.newSquareFootage || ''}
                        onChange={(e) => {
                          const newSqft = e.target.value
                            ? parseFloat(e.target.value)
                            : undefined
                          const existing =
                            editedProject.specs?.existingSquareFootage || 0
                          setEditedProject({
                            ...editedProject,
                            specs: {
                              ...editedProject.specs,
                              livingSquareFootage: existing + (newSqft || 0),
                              newSquareFootage: newSqft,
                            } as NonNullable<Project['specs']>,
                          })
                        }}
                        placeholder="e.g., 500"
                      />
                    </div>
                  </>
                )}

                <div className={isRenovation ? 'md:col-span-2' : ''}>
                  <Label htmlFor="livingSquareFootage">Living Square Footage</Label>
                  <Input
                    id="livingSquareFootage"
                    type="number"
                    value={editedProject.specs?.livingSquareFootage || ''}
                    onChange={(e) =>
                      updateSpec(
                        'livingSquareFootage',
                        e.target.value ? parseFloat(e.target.value) : 0,
                      )
                    }
                    placeholder="e.g., 2500"
                  />
                </div>

                <div>
                  <Label htmlFor="totalSquareFootage">
                    Total Square Footage (Optional)
                  </Label>
                  <Input
                    id="totalSquareFootage"
                    type="number"
                    value={editedProject.specs?.totalSquareFootage || ''}
                    onChange={(e) =>
                      updateSpec(
                        'totalSquareFootage',
                        e.target.value ? parseFloat(e.target.value) : undefined,
                      )
                    }
                    placeholder="e.g., 3000"
                  />
                </div>
              </div>

              {/* Basic specs */}
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <div>
                  <Label htmlFor="bedrooms">Bedrooms</Label>
                  <Input
                    id="bedrooms"
                    type="number"
                    value={editedProject.specs?.bedrooms || ''}
                    onChange={(e) =>
                      updateSpec(
                        'bedrooms',
                        e.target.value ? parseInt(e.target.value) : undefined,
                      )
                    }
                    placeholder="e.g., 3"
                  />
                </div>
                <div>
                  <Label htmlFor="bathrooms">Bathrooms</Label>
                  <Input
                    id="bathrooms"
                    type="number"
                    step="0.5"
                    value={editedProject.specs?.bathrooms || ''}
                    onChange={(e) =>
                      updateSpec(
                        'bathrooms',
                        e.target.value ? parseFloat(e.target.value) : undefined,
                      )
                    }
                    placeholder="e.g., 2.5"
                  />
                </div>
                <div>
                  <Label htmlFor="stories">Stories/Levels</Label>
                  <Input
                    id="stories"
                    type="number"
                    value={editedProject.specs?.stories || ''}
                    onChange={(e) =>
                      updateSpec(
                        'stories',
                        e.target.value ? parseInt(e.target.value) : undefined,
                      )
                    }
                    placeholder="e.g., 2"
                  />
                </div>
                <div>
                  <Label htmlFor="garageSpaces">Garage Spaces</Label>
                  <Input
                    id="garageSpaces"
                    type="number"
                    value={editedProject.specs?.garageSpaces || ''}
                    onChange={(e) =>
                      updateSpec(
                        'garageSpaces',
                        e.target.value ? parseInt(e.target.value) : undefined,
                      )
                    }
                    placeholder="e.g., 2"
                  />
                </div>
              </div>

              {/* Foundation / Roof / Basement / Lot */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="foundationType">Foundation Type</Label>
                  <Select
                    value={editedProject.specs?.foundationType || ''}
                    onValueChange={(value) =>
                      updateSpec('foundationType', value as never)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select foundation type…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="slab">Slab</SelectItem>
                      <SelectItem value="crawl-space">Crawl Space</SelectItem>
                      <SelectItem value="full-basement">Full Basement</SelectItem>
                      <SelectItem value="partial-basement">Partial Basement</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="roofType">Roof Type</Label>
                  <Select
                    value={editedProject.specs?.roofType || ''}
                    onValueChange={(value) =>
                      updateSpec('roofType', value as never)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select roof type…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gable">Gable (Standard)</SelectItem>
                      <SelectItem value="hip">Hip</SelectItem>
                      <SelectItem value="mansard">Mansard</SelectItem>
                      <SelectItem value="flat">Flat</SelectItem>
                      <SelectItem value="shed">Shed</SelectItem>
                      <SelectItem value="gambrel">Gambrel</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="basement">Basement</Label>
                  <Select
                    value={editedProject.specs?.basement || ''}
                    onValueChange={(value) =>
                      updateSpec('basement', value as never)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select basement type…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="unfinished">Unfinished</SelectItem>
                      <SelectItem value="finished">Finished</SelectItem>
                      <SelectItem value="partial">Partial</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="lotSize">Lot Size (Square Feet)</Label>
                  <Input
                    id="lotSize"
                    type="number"
                    value={editedProject.specs?.lotSize || ''}
                    onChange={(e) =>
                      updateSpec(
                        'lotSize',
                        e.target.value ? parseFloat(e.target.value) : undefined,
                      )
                    }
                    placeholder="e.g., 10000"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <Button onClick={handleSaveEdit} className="flex-1">
                Save Changes
              </Button>
              <Button onClick={onCancel} variant="outline" className="flex-1">
                Cancel
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
