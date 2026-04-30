// ============================================================================
// AppRoutes — top-level routes table
// ============================================================================
//
// Replaces the previous currentView state machine in App.tsx with URL-driven
// navigation. Each route wrapper bridges between react-router (useParams,
// useNavigate) and the existing page components (which still take their
// props as before — keeps blast radius small).
//
// Route hierarchy:
//   /                                              → Dashboard (Projects)
//   /projects/new                                  → CreateProjectForm
//   /projects/:projectId                           → ProjectScope ── (Outlet) ──
//                                                    ├── (index) → ProjectDetailView
//                                                    ├── /estimate
//                                                    ├── /actuals
//                                                    ├── /change-orders
//                                                    ├── /forms
//                                                    ├── /documents
//                                                    ├── /purchase-orders
//                                                    ├── /selection-book
//                                                    ├── /selection-schedules
//                                                    └── /schedule
//   /library/plans                                 → PlanLibrary
//   /library/plans/new                             → PlanEditor (new mode)
//   /library/plans/:planId                         → PlanEditor (edit mode)
//   /library/estimates                             → ItemLibrary
//   /quickbooks/settings                           → QuickBooks (Connect+Import)
//   /quickbooks/callback                           → QuickBooksCallback (OAuth)
//   /contacts                                      → ContactDirectory
//   /sow                                           → SOWManagement
//   /deals                                         → DealWorkspace (no deal)
//   /deals/workspace/:dealId                       → DealWorkspace (specific)
//   /tenants                                       → TenantPipeline
//   /feedback                                      → MyFeedback
//   /privacy                                       → PrivacyPolicy        (public)
//   /terms                                         → TermsOfUse           (public)
//   /vendor-quote/:token                           → VendorQuotePortal    (public)
//   /quote/:token                                  → VendorQuotePortal    (public)
//

import { useEffect, useState } from 'react'
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom'
import { Project, Plan } from '@/types'
import {
  createProject_Hybrid,
  getProject_Hybrid,
  addTrade_Hybrid,
} from '@/services/hybridService'
import { applyTemplateToEstimate } from '@/services/estimateTemplateService'
import { createSubItemInDB } from '@/services/supabaseService'
import { isOnlineMode } from '@/lib/supabase'
import { getCurrentUserProfile, UserProfile } from '@/services/userService'
import { useAuth } from '@/contexts/AuthContext'

// Pages
import { ProjectsDashboard } from '@/components/ProjectsDashboard'
import { ProjectDetailView } from '@/components/ProjectDetailView'
import { EstimateBuilder } from '@/components/EstimateBuilder'
import { ProjectActuals } from '@/components/ProjectActuals'
import { ChangeOrders } from '@/components/ChangeOrders'
import { ProjectForms } from '@/components/ProjectForms'
import { ProjectDocuments } from '@/components/ProjectDocuments'
import { SelectionBook } from '@/components/SelectionBook'
import { SelectionSchedules } from '@/components/SelectionSchedules'
import { ScheduleBuilder } from '@/components/ScheduleBuilder'
import { CreateProjectForm, ProjectFormData } from '@/components/CreateProjectForm'
import { PlanLibrary } from '@/components/PlanLibrary'
import { PlanEditor } from '@/components/PlanEditor'
import { ItemLibrary } from '@/components/ItemLibrary'
import { QuickBooksConnect } from '@/components/QuickBooksConnect'
import { QuickBooksImport } from '@/components/QuickBooksImport'
import { QuickBooksCallback } from '@/components/QuickBooksCallback'
import { VendorQuotePortal } from '@/components/VendorQuotePortal'
import { PurchaseOrdersView } from '@/components/PurchaseOrdersView'
import { ContactDirectory } from '@/components/ContactDirectory'
import { SOWManagement } from '@/components/SOWManagement'
import { DealWorkspace } from '@/components/DealWorkspace'
import { TenantPipeline } from '@/components/TenantPipeline'
import { MyFeedback } from '@/components/MyFeedback'
import { FeedbackForm } from '@/components/FeedbackForm'
import { PrivacyPolicy } from '@/components/PrivacyPolicy'
import { TermsOfUse } from '@/components/TermsOfUse'
import { Button } from '@/components/ui/button'

import { AuthedLayout } from './AuthedLayout'
import { ProjectScope, useProjectContext } from './ProjectScope'

// ============================================================================
// Top-level routes table
// ============================================================================

export function AppRoutes() {
  return (
    <Routes>
      {/* Public — no AuthGate */}
      <Route path="/vendor-quote/:token" element={<VendorQuotePortal />} />
      <Route path="/quote/:token" element={<VendorQuotePortal />} />
      <Route path="/privacy" element={<PublicPrivacy />} />
      <Route path="/terms" element={<PublicTerms />} />

      {/* Authed — wrapped in AuthGate + Provider + legacy user-menu */}
      <Route element={<AuthedLayout />}>
        <Route index element={<DashboardRoute />} />
        <Route path="/projects" element={<Navigate to="/" replace />} />
        <Route path="/projects/new" element={<CreateProjectRoute />} />

        <Route path="/projects/:projectId" element={<ProjectScope />}>
          <Route index element={<ProjectDetailRoute />} />
          <Route path="estimate" element={<EstimateRoute />} />
          <Route path="actuals" element={<ActualsRoute />} />
          <Route path="change-orders" element={<ChangeOrdersRoute />} />
          <Route path="forms" element={<FormsRoute />} />
          <Route path="documents" element={<DocumentsRoute />} />
          <Route path="purchase-orders" element={<PurchaseOrdersRoute />} />
          <Route path="selection-book" element={<SelectionBookRoute />} />
          <Route path="selection-schedules" element={<SelectionSchedulesRoute />} />
          <Route path="schedule" element={<ScheduleRoute />} />
        </Route>

        <Route path="/library/plans" element={<PlanLibraryRoute />} />
        <Route path="/library/plans/new" element={<PlanEditorRoute />} />
        <Route path="/library/plans/:planId" element={<PlanEditorRoute />} />
        <Route path="/library/estimates" element={<EstimateLibraryRoute />} />

        <Route path="/quickbooks/settings" element={<QuickBooksSettingsRoute />} />
        <Route path="/quickbooks/callback" element={<QuickBooksCallbackRoute />} />
        <Route path="/qb-callback" element={<QuickBooksCallbackRoute />} />

        <Route path="/contacts" element={<ContactDirectoryRoute />} />
        <Route path="/sow" element={<SOWManagementRoute />} />

        <Route path="/deals" element={<DealWorkspaceRoute />} />
        <Route path="/deals/workspace/:dealId" element={<DealWorkspaceRoute />} />
        <Route path="/deal-pipeline" element={<Navigate to="/deals" replace />} />

        <Route path="/tenants" element={<TenantPipelineRoute />} />
        <Route path="/tenant-pipeline" element={<Navigate to="/tenants" replace />} />

        <Route path="/feedback" element={<MyFeedbackRoute />} />

        {/* Catch-all → dashboard */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

// ============================================================================
// Public routes
// ============================================================================

function PublicPrivacy() {
  return (
    <PrivacyPolicy
      onBack={() => {
        window.location.href = '/'
      }}
      showBackButton
    />
  )
}

function PublicTerms() {
  return (
    <TermsOfUse
      onBack={() => {
        window.location.href = '/'
      }}
      showBackButton
    />
  )
}

// ============================================================================
// Dashboard + project creation
// ============================================================================

function DashboardRoute() {
  const navigate = useNavigate()
  const location = useLocation()

  // Legacy deep link: ?project=ID&view=actuals → /projects/ID/actuals
  // (Generated by older versions of QuickBooksImport's "Open project" button.)
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const projectId = params.get('project')
    const view = params.get('view')
    if (projectId && view === 'actuals') {
      navigate(`/projects/${projectId}/actuals`, { replace: true })
    }
  }, [location.search, navigate])

  // Suppress dashboard render during the redirect frame to avoid a flash
  const params = new URLSearchParams(location.search)
  if (params.get('project') && params.get('view') === 'actuals') return null

  return (
    <ProjectsDashboard
      onCreateProject={() => navigate('/projects/new')}
      onSelectProject={(project) => navigate(`/projects/${project.id}`)}
      onOpenProjectSection={(project, section) =>
        navigate(`/projects/${project.id}/${section}`)
      }
      onOpenDealWorkspace={() => navigate('/deals')}
      onOpenTenantPipeline={() => navigate('/tenants')}
      onOpenQBSettings={() => navigate('/quickbooks/settings')}
    />
  )
}

function CreateProjectRoute() {
  const navigate = useNavigate()

  const handleProjectCreated = async (formData: ProjectFormData) => {
    const finalPlanId =
      formData.planId === 'custom'
        ? formData.planDisplayId || undefined
        : formData.planDisplayId || formData.planId

    const newProject = await createProject_Hybrid({
      name: formData.name,
      type: formData.type,
      address: {
        street: formData.address,
        city: formData.city,
        state: formData.state,
        zip: formData.zipCode,
      },
      city: formData.city,
      state: formData.state,
      zipCode: formData.zipCode,
      client: {
        name: 'To Be Determined',
        email: '',
        phone: '',
      },
      startDate: formData.startDate,
      endDate: formData.endDate,
      metadata: {
        planId: finalPlanId,
        planOptions: formData.planOptions,
        isCustomPlan: formData.planId === 'custom',
      },
      specs: formData.specs,
    })

    let projectToNavigateTo: Project = newProject

    if (formData.estimateTemplateId && newProject.estimate) {
      const templateTrades = await applyTemplateToEstimate(
        formData.estimateTemplateId,
        newProject.estimate.id,
      )
      if (templateTrades.length > 0) {
        for (const templateTrade of templateTrades) {
          const created = await addTrade_Hybrid(newProject.estimate!.id, {
            category: templateTrade.category,
            name: templateTrade.name,
            description: templateTrade.description,
            quantity: templateTrade.quantity,
            unit: templateTrade.unit,
            laborCost: templateTrade.laborCost,
            laborRate: templateTrade.laborRate,
            laborHours: templateTrade.laborHours,
            materialCost: templateTrade.materialCost,
            materialRate: templateTrade.materialRate,
            subcontractorCost: templateTrade.subcontractorCost,
            isSubcontracted: templateTrade.isSubcontracted,
            wasteFactor: templateTrade.wasteFactor,
            markupPercent: templateTrade.markupPercent,
            notes: templateTrade.notes,
          })
          if (created && isOnlineMode() && templateTrade.subItems?.length) {
            for (let i = 0; i < templateTrade.subItems.length; i++) {
              const sub = templateTrade.subItems[i]
              await createSubItemInDB(created.id, newProject.estimate!.id, {
                name: sub.name ?? '',
                description: sub.description,
                quantity: sub.quantity ?? 0,
                unit: sub.unit ?? 'each',
                laborCost: sub.laborCost ?? 0,
                laborRate: sub.laborRate,
                laborHours: sub.laborHours,
                materialCost: sub.materialCost ?? 0,
                materialRate: sub.materialRate,
                subcontractorCost: sub.subcontractorCost ?? 0,
                subcontractorRate: sub.subcontractorRate,
                isSubcontracted: sub.isSubcontracted ?? false,
                wasteFactor: sub.wasteFactor ?? 10,
                markupPercent: sub.markupPercent,
                sortOrder: sub.sortOrder ?? i,
                selectionOnly: sub.selectionOnly,
                selection: sub.selection,
              })
            }
          }
        }

        const refreshed = await getProject_Hybrid(newProject.id)
        if (refreshed) projectToNavigateTo = refreshed
      }
    }

    navigate(`/projects/${projectToNavigateTo.id}/estimate`)
  }

  return (
    <CreateProjectForm
      onBack={() => navigate('/')}
      onCreate={handleProjectCreated}
    />
  )
}

// ============================================================================
// Project-scoped routes (children of ProjectScope)
// ============================================================================

function ProjectDetailRoute() {
  const { project } = useProjectContext()
  const navigate = useNavigate()
  return (
    <ProjectDetailView
      project={project}
      onBack={() => navigate('/')}
      onViewEstimate={() => navigate(`/projects/${project.id}/estimate`)}
      onViewActuals={() => navigate(`/projects/${project.id}/actuals`)}
      onViewChangeOrders={() => navigate(`/projects/${project.id}/change-orders`)}
      onViewForms={() => navigate(`/projects/${project.id}/forms`)}
      onViewDocuments={() => navigate(`/projects/${project.id}/documents`)}
      onViewPOs={() => navigate(`/projects/${project.id}/purchase-orders`)}
      onViewSelectionBook={() => navigate(`/projects/${project.id}/selection-book`)}
      onViewSelectionSchedules={() =>
        navigate(`/projects/${project.id}/selection-schedules`)
      }
      onViewSchedule={() => navigate(`/projects/${project.id}/schedule`)}
      onProjectDuplicated={(newProject) => navigate(`/projects/${newProject.id}`)}
    />
  )
}

function EstimateRoute() {
  const { project } = useProjectContext()
  const navigate = useNavigate()
  return (
    <EstimateBuilder
      project={project}
      onBack={() => navigate(`/projects/${project.id}`)}
    />
  )
}

function ActualsRoute() {
  const { project } = useProjectContext()
  const navigate = useNavigate()
  return (
    <ProjectActuals
      project={project}
      onBack={() => navigate(`/projects/${project.id}`)}
    />
  )
}

function ChangeOrdersRoute() {
  const { project } = useProjectContext()
  const navigate = useNavigate()
  return (
    <ChangeOrders
      project={project}
      onBack={() => navigate(`/projects/${project.id}`)}
    />
  )
}

function FormsRoute() {
  const { project } = useProjectContext()
  const navigate = useNavigate()
  return (
    <ProjectForms
      projectId={project.id}
      project={project}
      onBack={() => navigate(`/projects/${project.id}`)}
    />
  )
}

function DocumentsRoute() {
  const { project } = useProjectContext()
  const navigate = useNavigate()
  return (
    <ProjectDocuments
      projectId={project.id}
      onBack={() => navigate(`/projects/${project.id}`)}
      projectName={project.name}
    />
  )
}

function PurchaseOrdersRoute() {
  const { project } = useProjectContext()
  const navigate = useNavigate()
  return (
    <PurchaseOrdersView
      projectId={project.id}
      projectName={project.name}
      onBack={() => navigate(`/projects/${project.id}`)}
    />
  )
}

function SelectionBookRoute() {
  const { project } = useProjectContext()
  const navigate = useNavigate()
  return (
    <SelectionBook
      projectId={project.id}
      project={project}
      onBack={() => navigate(`/projects/${project.id}`)}
    />
  )
}

function SelectionSchedulesRoute() {
  const { project } = useProjectContext()
  const navigate = useNavigate()
  return (
    <SelectionSchedules
      project={project}
      onBack={() => navigate(`/projects/${project.id}`)}
    />
  )
}

function ScheduleRoute() {
  const { project } = useProjectContext()
  const navigate = useNavigate()
  return (
    <ScheduleBuilder
      project={project}
      onBack={() => navigate(`/projects/${project.id}`)}
    />
  )
}

// ============================================================================
// Library routes
// ============================================================================

function PlanLibraryRoute() {
  const navigate = useNavigate()
  return (
    <PlanLibrary
      onBack={() => navigate('/')}
      onCreatePlan={() => navigate('/library/plans/new')}
      onEditPlan={(plan) =>
        navigate(`/library/plans/${plan.id}`, { state: { plan } })
      }
    />
  )
}

function PlanEditorRoute() {
  const navigate = useNavigate()
  const location = useLocation()
  const plan = (location.state as { plan?: Plan } | null)?.plan ?? null

  return (
    <PlanEditor
      plan={plan}
      onBack={() => navigate('/library/plans')}
      onSave={() => {
        // Stay on editor; PlanEditor handles its own internal save state
      }}
    />
  )
}

function EstimateLibraryRoute() {
  const navigate = useNavigate()
  return <ItemLibrary onBack={() => navigate('/')} />
}

// ============================================================================
// QuickBooks routes
// ============================================================================

function QuickBooksSettingsRoute() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <Button onClick={() => navigate('/')} variant="outline" className="mb-6">
          ← Back to Dashboard
        </Button>
        <QuickBooksConnect />
        <QuickBooksImport />
      </div>
    </div>
  )
}

function QuickBooksCallbackRoute() {
  const navigate = useNavigate()
  return (
    <QuickBooksCallback
      onComplete={() => {
        navigate('/quickbooks/settings', { replace: true })
      }}
    />
  )
}

// ============================================================================
// Admin / settings routes
// ============================================================================

function ContactDirectoryRoute() {
  const navigate = useNavigate()
  const { user, isOnline } = useAuth()
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)

  useEffect(() => {
    if (isOnline && user) {
      getCurrentUserProfile().then(setUserProfile)
    }
  }, [isOnline, user])

  return <ContactDirectory onBack={() => navigate('/')} userProfile={userProfile} />
}

function SOWManagementRoute() {
  const navigate = useNavigate()
  return <SOWManagement onBack={() => navigate('/')} />
}

// ============================================================================
// Deals + Tenants
// ============================================================================

function DealWorkspaceRoute() {
  const navigate = useNavigate()
  const { dealId } = useParams<{ dealId: string }>()
  return (
    <DealWorkspace
      dealId={dealId}
      onBack={() => navigate('/')}
    />
  )
}

function TenantPipelineRoute() {
  const navigate = useNavigate()
  return (
    <TenantPipeline
      onBack={() => navigate('/')}
      onOpenDealWorkspace={(dealId) => navigate(`/deals/workspace/${dealId}`)}
    />
  )
}

// ============================================================================
// Feedback
// ============================================================================

function MyFeedbackRoute() {
  const navigate = useNavigate()
  const [showFeedbackForm, setShowFeedbackForm] = useState(false)

  return (
    <div className="container mx-auto py-6 px-4">
      <MyFeedback
        onBack={() => navigate('/')}
        onNewFeedback={() => setShowFeedbackForm(true)}
      />
      {showFeedbackForm && (
        <FeedbackForm
          onClose={() => setShowFeedbackForm(false)}
          onSuccess={() => {
            setShowFeedbackForm(false)
            if ((window as any).refreshMyFeedback) {
              ;(window as any).refreshMyFeedback()
            }
            alert("✅ Thank you for your feedback! We'll review it soon.")
          }}
        />
      )}
    </div>
  )
}

