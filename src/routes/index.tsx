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
//                                                    ├── /quotes, /quotes/new, /quotes/:quoteId/edit
//                                                    └── /schedule
//   /library/plans                                 → PlanLibrary
//   /library/plans/new                             → PlanEditor (new mode)
//   /library/plans/:planId                         → PlanEditor (edit mode)
//   /library/estimates                             → ItemLibrary
//   /quickbooks/settings                           → QuickBooks (Connect+Import)
//   /quickbooks/callback                           → QuickBooksCallback (OAuth)
//   /contacts                                      → ContactDirectory
//   /sow                                           → SOWManagement
//   /deals                                         → DealsDashboard
//   /deals/workspace                               → DealWorkspace (no deal, tab nav)
//   /deals/workspace/:dealId                       → DealWorkspace (specific)
//   /tenants                                       → TenantPipeline
//   /schedule                                      → SchedulePortfolio
//   /feedback                                      → MyFeedback
//   /privacy                                       → PrivacyPolicy        (public)
//   /terms                                         → TermsOfUse           (public)
//   /vendor-quote/:token                           → VendorQuotePortal    (public)
//   /quote/:token                                  → VendorQuotePortal    (public)
//

import { useEffect, useState } from 'react'
import { addDays, format, parseISO, startOfWeek } from 'date-fns'
import { toast } from 'sonner'
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
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
import { ResourceCompare } from '@/components/ResourceCompare'
import { SchedulePortfolio } from '@/components/SchedulePortfolio'
import { ProjectQuotesView } from '@/components/quotes/ProjectQuotesView'
import { ClientQuoteBuilder } from '@/components/quotes/ClientQuoteBuilder'
import { ClientQuoteReadOnlyView } from '@/components/quotes/ClientQuoteReadOnlyView'
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
import { HolidaysAdmin } from '@/components/HolidaysAdmin'
import { SubUnavailabilityAdmin } from '@/components/SubUnavailabilityAdmin'
import { DealWorkspace } from '@/components/DealWorkspace'
import { DealsDashboard } from '@/components/DealsDashboard'
import { TenantPipeline } from '@/components/TenantPipeline'
import { MyFeedback } from '@/components/MyFeedback'
import { FeedbackForm } from '@/components/FeedbackForm'
import { emitFeedbackChange } from '@/lib/feedbackEventBus'
import { PrivacyPolicy } from '@/components/PrivacyPolicy'
import { TermsOfUse } from '@/components/TermsOfUse'
import { MeetingPreRead } from '@/components/meeting/MeetingPreRead'
import { MeetingView } from '@/components/meeting/MeetingView'
import { MyActionItems } from '@/components/meeting/MyActionItems'
import { MeetingAdmin } from '@/components/meeting/MeetingAdmin'
import { MeetingsList } from '@/components/meeting/MeetingsList'
import { TeamPage } from '@/components/hr/TeamPage'
import { CrewAccountsPage } from '@/components/hr/crew/CrewAccountsPage'
import { PayrollPage } from '@/components/hr/PayrollPage'
import { TimeClockPage } from '@/components/hr/TimeClockPage'
import { HrWorkspaceShell } from '@/components/hr/HrWorkspaceShell'
import { DrywallProjectsListPage } from '@/components/drywall/DrywallProjectsListPage'
import { DrywallProjectShell } from '@/components/drywall/DrywallProjectShell'
import { CloseoutStagePage } from '@/components/drywall/closeout/CloseoutStagePage'
import { OrderPage } from '@/components/drywall/order/OrderPage'
import { ProductionStagePage } from '@/components/drywall/production/ProductionStagePage'
import { FieldMeasurementPage } from '@/components/drywall/field/FieldMeasurementPage'
import { DrywallScheduleEditor } from '@/components/drywall/schedule/DrywallScheduleEditor'
import { DrywallSchedulePortfolioPage } from '@/components/drywall/schedule/portfolio/DrywallSchedulePortfolioPage'
import { QuoteStageRoute } from '@/components/drywall/quote/QuoteStageRoute'
import { CatalogsPage } from '@/components/drywall/settings/CatalogsPage'
import { ProjectInfoPage } from '@/components/drywall/info/ProjectInfoPage'
import { usePageTitle } from '@/contexts/PageTitleContext'
import { getCurrentWeekOf } from '@/services/meetingService'
import { CrewSignupPage } from '@/routes/CrewSignupPage'
import { CrewShell } from '@/components/crew/CrewShell'
import { CrewProjectListPage } from '@/components/crew/CrewProjectListPage'
import { CrewProjectDetailPage } from '@/components/crew/CrewProjectDetailPage'
import { CrewMeasurePage } from '@/components/crew/CrewMeasurePage'

import { AppLayout } from '@/components/AppLayout'
import { AuthedLayout } from './AuthedLayout'
import { ProjectScope, useProjectContext } from './ProjectScope'
import {
  RequireCanCreateProjects,
  RequireMeetingAdmin,
  RequireQuickBooksAdmin,
  RequireCanRunPayroll,
  RequireHrTeamAccess,
  RequireHrCrewAccountsAccess,
  RequireHrTimeClockAccess,
  RequireDrywallCatalogsAccess,
  RequireWorkspaceAccess,
  RequireCrewWorkspaceAccess,
} from './RequirePermission'

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
      <Route path="/crew-signup" element={<CrewSignupPage />} />

      {/* Authed — wrapped in AuthGate + Provider, then in the sidebar shell */}
      <Route element={<AuthedLayout />}>
        {/* Password recovery: must match resetPasswordForEmail redirectTo + stay out of AppLayout's "*" → "/" */}
        <Route path="/reset-password" element={<PasswordRecoveryRoute />} />
        {/* Authed but full-screen (no sidebar shell): OAuth callback only */}
        <Route path="/quickbooks/callback" element={<QuickBooksCallbackRoute />} />
        <Route path="/qb-callback" element={<QuickBooksCallbackRoute />} />

        <Route
          path="/crew"
          element={
            <RequireCrewWorkspaceAccess>
              <CrewShell />
            </RequireCrewWorkspaceAccess>
          }
        >
          <Route index element={<CrewProjectListPage />} />
          <Route path="projects/:projectId" element={<CrewProjectDetailPage />} />
          <Route path="projects/:projectId/measure" element={<CrewMeasurePage />} />
        </Route>

        {/* All other authed routes render inside the sidebar shell */}
        <Route element={<AppLayout />}>
          <Route
            index
            element={
              <RequireWorkspaceAccess workspace="projects">
                <DashboardRoute />
              </RequireWorkspaceAccess>
            }
          />
          <Route path="/projects" element={<Navigate to="/" replace />} />
          <Route
            path="/projects/new"
            element={
              <RequireCanCreateProjects>
                <CreateProjectRoute />
              </RequireCanCreateProjects>
            }
          />

          <Route
            path="/projects/:projectId"
            element={
              <RequireWorkspaceAccess workspace="projects">
                <ProjectScope />
              </RequireWorkspaceAccess>
            }
          >
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
            <Route path="quotes" element={<ProjectQuotesRoute />} />
            <Route path="quotes/new" element={<ClientQuoteNewRoute />} />
            <Route path="quotes/:quoteId/edit" element={<ClientQuoteEditRoute />} />
            <Route path="quotes/:quoteId" element={<ClientQuoteReadOnlyRoute />} />
          </Route>

          <Route path="/library/plans" element={<PlanLibraryRoute />} />
          <Route path="/library/plans/new" element={<PlanEditorRoute />} />
          <Route path="/library/plans/:planId" element={<PlanEditorRoute />} />
          <Route path="/library/estimates" element={<EstimateLibraryRoute />} />

          <Route
            path="/quickbooks/settings"
            element={
              <RequireQuickBooksAdmin>
                <QuickBooksSettingsRoute />
              </RequireQuickBooksAdmin>
            }
          />

          <Route path="/contacts" element={<ContactDirectoryRoute />} />
          <Route path="/settings/holidays" element={<HolidaysAdminRoute />} />
          <Route path="/settings/unavailability" element={<SubUnavailabilityAdminRoute />} />
          <Route path="/sow" element={<SOWManagementRoute />} />

          <Route
            path="/deals"
            element={
              <RequireWorkspaceAccess workspace="deals">
                <DealsDashboard />
              </RequireWorkspaceAccess>
            }
          />
          <Route
            path="/deals/workspace"
            element={
              <RequireWorkspaceAccess workspace="deals">
                <DealWorkspaceRoute />
              </RequireWorkspaceAccess>
            }
          />
          <Route
            path="/deals/workspace/:dealId"
            element={
              <RequireWorkspaceAccess workspace="deals">
                <DealWorkspaceRoute />
              </RequireWorkspaceAccess>
            }
          />
          <Route path="/deal-pipeline" element={<Navigate to="/deals" replace />} />

          <Route
            path="/tenants"
            element={
              <RequireWorkspaceAccess workspace="tenants">
                <TenantPipelineRoute />
              </RequireWorkspaceAccess>
            }
          />
          <Route path="/tenant-pipeline" element={<Navigate to="/tenants" replace />} />

          <Route
            path="/drywall"
            element={
              <RequireWorkspaceAccess workspace="drywall">
                <DrywallProjectsListPage />
              </RequireWorkspaceAccess>
            }
          />
          <Route
            path="/drywall/schedule"
            element={
              <RequireWorkspaceAccess workspace="drywall">
                <DrywallSchedulePortfolioPage />
              </RequireWorkspaceAccess>
            }
          />
          <Route
            path="/drywall/settings/catalogs"
            element={
              <RequireDrywallCatalogsAccess>
                <CatalogsPage />
              </RequireDrywallCatalogsAccess>
            }
          />
          <Route
            path="/drywall/projects/:projectId"
            element={
              <RequireWorkspaceAccess workspace="drywall">
                <DrywallProjectShell />
              </RequireWorkspaceAccess>
            }
          >
            <Route index element={<DrywallProjectIndexRedirect />} />
            <Route path="info" element={<ProjectInfoPage />} />
            <Route path="quote" element={<QuoteStageRoute />} />
            <Route path="field" element={<FieldMeasurementPage />} />
            <Route path="schedule" element={<DrywallScheduleEditor />} />
            <Route path="order" element={<OrderPage />} />
            <Route path="production" element={<ProductionStagePage />} />
            <Route path="closeout" element={<CloseoutStagePage />} />
          </Route>

          <Route
            path="/hr"
            element={
              <RequireWorkspaceAccess workspace="hr">
                <HrWorkspaceShell />
              </RequireWorkspaceAccess>
            }
          >
            <Route
              index
              element={<Navigate to="/hr/team" replace />}
            />
            <Route
              path="team"
              element={
                <RequireHrTeamAccess>
                  <TeamPage />
                </RequireHrTeamAccess>
              }
            />
            <Route
              path="crew"
              element={
                <RequireHrCrewAccountsAccess>
                  <CrewAccountsPage />
                </RequireHrCrewAccountsAccess>
              }
            />
            <Route
              path="payroll"
              element={
                <RequireCanRunPayroll>
                  <PayrollPage />
                </RequireCanRunPayroll>
              }
            />
            <Route
              path="time-clock"
              element={
                <RequireHrTimeClockAccess>
                  <TimeClockPage />
                </RequireHrTimeClockAccess>
              }
            />
          </Route>

          <Route
            path="/schedule"
            element={
              <RequireWorkspaceAccess workspace="schedule">
                <SchedulePortfolioRoute />
              </RequireWorkspaceAccess>
            }
          />
          <Route
            path="/schedule/resource"
            element={
              <RequireWorkspaceAccess workspace="schedule">
                <ResourceCompareRoute />
              </RequireWorkspaceAccess>
            }
          />

          <Route path="/feedback" element={<MyFeedbackRoute />} />
          <Route
            path="/pre-read"
            element={
              <RequireWorkspaceAccess workspace="meeting">
                <MeetingPreReadRoute />
              </RequireWorkspaceAccess>
            }
          />
          <Route
            path="/action-items"
            element={
              <RequireWorkspaceAccess workspace="meeting">
                <MyActionItemsRoute />
              </RequireWorkspaceAccess>
            }
          />
          <Route
            path="/meetings"
            element={
              <RequireWorkspaceAccess workspace="meeting">
                <MeetingsListRoute />
              </RequireWorkspaceAccess>
            }
          />
          <Route
            path="/admin/meeting-prompts"
            element={
              <RequireMeetingAdmin>
                <MeetingAdminRoute />
              </RequireMeetingAdmin>
            }
          />
          <Route
            path="/meeting"
            element={
              <RequireWorkspaceAccess workspace="meeting">
                <MeetingRedirectRoute />
              </RequireWorkspaceAccess>
            }
          />
          <Route
            path="/meeting/:date"
            element={
              <RequireWorkspaceAccess workspace="meeting">
                <MeetingViewRoute />
              </RequireWorkspaceAccess>
            }
          />

          {/* Catch-all → dashboard */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  )
}

// ============================================================================
// Password recovery (Supabase email link lands here with hash tokens)
// ============================================================================

/** Shell route only — AuthGate renders SetNewPassword when session + recovery mode. */
function PasswordRecoveryRoute() {
  return null
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
            subcontractorRate: templateTrade.subcontractorRate,
            pendingReview: true,
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
  const { project, setProject } = useProjectContext()
  const navigate = useNavigate()
  return (
    <ProjectDetailView
      project={project}
      onBack={() => navigate('/')}
      onViewEstimate={() => navigate(`/projects/${project.id}/estimate`)}
      onViewQuotes={() => navigate(`/projects/${project.id}/quotes`)}
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
      onProjectUpdated={setProject}
    />
  )
}

function ProjectQuotesRoute() {
  const { project } = useProjectContext()
  const navigate = useNavigate()
  return (
    <ProjectQuotesView
      project={project}
      onBack={() => navigate(`/projects/${project.id}`)}
      onNewQuote={() => navigate(`/projects/${project.id}/quotes/new`)}
      onEditDraft={(quoteId) => navigate(`/projects/${project.id}/quotes/${quoteId}/edit`)}
      onViewReadOnly={(quoteId) => navigate(`/projects/${project.id}/quotes/${quoteId}`)}
    />
  )
}

function ClientQuoteNewRoute() {
  const { project } = useProjectContext()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const prefilledFromEstimate = searchParams.get('from') === 'estimate'
  return (
    <ClientQuoteBuilder
      project={project}
      mode="new"
      prefilledFromEstimate={prefilledFromEstimate}
      onCancel={() => navigate(`/projects/${project.id}/quotes`)}
      onSaved={() => navigate(`/projects/${project.id}/quotes`)}
    />
  )
}

function ClientQuoteReadOnlyRoute() {
  const { project } = useProjectContext()
  const { quoteId } = useParams<{ quoteId: string }>()
  const navigate = useNavigate()
  if (!quoteId) return null
  return (
    <ClientQuoteReadOnlyView
      project={project}
      quoteId={quoteId}
      onBack={() => navigate(`/projects/${project.id}/quotes`)}
    />
  )
}

function ClientQuoteEditRoute() {
  const { project } = useProjectContext()
  const { quoteId } = useParams<{ quoteId: string }>()
  const navigate = useNavigate()
  if (!quoteId) return null
  return (
    <ClientQuoteBuilder
      project={project}
      mode="edit"
      quoteId={quoteId}
      onCancel={() => navigate(`/projects/${project.id}/quotes`)}
      onSaved={() => navigate(`/projects/${project.id}/quotes`)}
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
  usePageTitle('QuickBooks')
  return (
    <div className="flex flex-col gap-6 p-6">
      <QuickBooksConnect />
      <QuickBooksImport />
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

function HolidaysAdminRoute() {
  const navigate = useNavigate()
  // navigate(-1) returns to wherever the user came from (their workspace's
  // page), not always Projects Dashboard. Falls through gracefully if there's
  // no history (direct URL load — rare for a Settings route).
  return <HolidaysAdmin onBack={() => navigate(-1)} />
}

function SubUnavailabilityAdminRoute() {
  const navigate = useNavigate()
  return <SubUnavailabilityAdmin onBack={() => navigate(-1)} />
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

function SchedulePortfolioRoute() {
  usePageTitle('Schedule')
  return <SchedulePortfolio />
}

function ResourceCompareRoute() {
  usePageTitle('Resource compare')
  return <ResourceCompare />
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
            emitFeedbackChange()
            toast.success("Thank you for your feedback! We'll review it soon.")
          }}
        />
      )}
    </div>
  )
}

function MeetingPreReadRoute() {
  return <MeetingPreRead />
}

function MyActionItemsRoute() {
  return <MyActionItems />
}

function MeetingsListRoute() {
  return <MeetingsList />
}

function MeetingAdminRoute() {
  return <MeetingAdmin />
}

function DrywallProjectIndexRedirect() {
  const { projectId } = useParams<{ projectId: string }>()
  if (!projectId) return <Navigate to="/drywall" replace />
  return <Navigate to={`/drywall/projects/${projectId}/info`} replace />
}

function MeetingRedirectRoute() {
  const [targetDate, setTargetDate] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const resolveTarget = async () => {
      try {
        const weekOf = await getCurrentWeekOf()
        const tuesday = addDays(parseISO(weekOf), 1)
        if (!cancelled) setTargetDate(format(tuesday, 'yyyy-MM-dd'))
      } catch (error) {
        console.error('Failed resolving meeting redirect date', error)
        toast.error('Could not resolve meeting date.')
      }
    }

    void resolveTarget()
    return () => {
      cancelled = true
    }
  }, [])

  if (!targetDate) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div className="mx-auto inline-block size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    )
  }

  return <Navigate to={`/meeting/${targetDate}`} replace />
}

function MeetingViewRoute() {
  const { date } = useParams<{ date: string }>()
  if (!date) return <Navigate to="/meeting" replace />

  const parsedDate = parseISO(date)
  if (Number.isNaN(parsedDate.getTime())) {
    return <Navigate to="/meeting" replace />
  }

  const weekStart = startOfWeek(parsedDate, { weekStartsOn: 1 })
  const weekOf = format(weekStart, 'yyyy-MM-dd')

  return <MeetingView meetingDate={date} weekOf={weekOf} />
}

