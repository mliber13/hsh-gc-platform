import React, { useState, useEffect } from 'react'
import { Project, Plan } from './types'
import { ProjectsDashboard } from './components/ProjectsDashboard'
import { ProjectDetailView } from './components/ProjectDetailView'
import { EstimateBuilder } from './components/EstimateBuilder'
import { ProjectActuals } from './components/ProjectActuals'

import { ChangeOrders } from './components/ChangeOrders'
import { ProjectForms } from './components/ProjectForms'
import { ProjectDocuments } from './components/ProjectDocuments'
import { SelectionBook } from './components/SelectionBook'
import { CreateProjectForm, ProjectFormData } from './components/CreateProjectForm'
import { PlanLibrary } from './components/PlanLibrary'
import { PlanEditor } from './components/PlanEditor'
import { ItemLibrary } from './components/ItemLibrary'
import { AuthGate } from './components/auth/AuthGate'
import { useAuth } from './contexts/AuthContext'
import { createProject, getProject } from './services/projectService'
import {
  createProject_Hybrid,
  getProject_Hybrid,
  updateProject_Hybrid,
  deleteProject_Hybrid,
  addTrade_Hybrid,
} from './services/hybridService'
import { applyTemplateToEstimate } from './services/estimateTemplateService'
import { getCurrentUserProfile, UserProfile } from './services/userService'
import { DataMigration } from './components/DataMigration'
import { QuickBooksConnect } from './components/QuickBooksConnect'
import { QuickBooksImport } from './components/QuickBooksImport'
import { QuickBooksCallback } from './components/QuickBooksCallback'
import { VendorQuotePortal } from './components/VendorQuotePortal'
import { QuoteReviewDashboard } from './components/QuoteReviewDashboard'
import { Button } from './components/ui/button'
import { LogOut, User, Crown, Pencil, Eye, Database, Download, Link2, Building2, FileText, MessageSquare } from 'lucide-react'
import { backupAllData } from './services/backupService'
import { ContactDirectory } from './components/ContactDirectory'
import { SOWManagement } from './components/SOWManagement'
import { EstimateTemplateManagement } from './components/EstimateTemplateManagement'
import { DealPipeline } from './components/DealPipeline'
import { FeedbackForm } from './components/FeedbackForm'
import { MyFeedback } from './components/MyFeedback'
import { PrivacyPolicy } from './components/PrivacyPolicy'
import { TermsOfUse } from './components/TermsOfUse'

type View =
  | 'dashboard'
  | 'create-project'
  | 'project-detail'
  | 'estimate'
  | 'actuals'
  | 'change-orders'
  | 'forms'
  | 'documents'
  | 'selection-book'
  | 'plan-library'
  | 'plan-editor'
  | 'item-library'
  | 'data-migration'
  | 'qb-settings'
  | 'qb-callback'
  | 'quote-review'
  | 'contact-directory'
  | 'sow-management'
  | 'estimate-template-management'
  | 'deal-pipeline'
  | 'my-feedback'
  | 'privacy'
  | 'terms'

function App() {
  const { user, signOut, isOnline } = useAuth()
  const [currentView, setCurrentView] = useState<View>('dashboard')
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [isBackingUp, setIsBackingUp] = useState(false)
  const [showFeedbackForm, setShowFeedbackForm] = useState(false)

  // Load user profile when authenticated
  useEffect(() => {
    if (isOnline && user) {
      getCurrentUserProfile().then(profile => {
        setUserProfile(profile)
      })
    }
  }, [isOnline, user])

  // Check for special routes (vendor quote portal, QB callback, deep link to project actuals)
  useEffect(() => {
    const pathname = window.location.pathname
    const isVendorPortalRoute = pathname.startsWith('/vendor-quote/') || pathname.startsWith('/quote/')
    
    // Check for vendor quote portal route
    if (isVendorPortalRoute) {
      // This will be handled by early return, no need to set view
      return
    }
    
    const params = new URLSearchParams(window.location.search)
    const projectId = params.get('project')
    const viewParam = params.get('view')

    // Deep link: ?project=ID&view=actuals (e.g. from Reconcile "Open project" in new tab)
    if (projectId && viewParam === 'actuals') {
      getProject_Hybrid(projectId).then((proj) => {
        if (proj) {
          setSelectedProject(proj)
          setCurrentView('actuals')
          window.history.replaceState({}, '', pathname || '/')
        }
      })
      return
    }

    const hasQBCode = params.get('code') && params.get('realmId')
    if (hasQBCode || pathname === '/qb-callback') {
      console.log('Detected QB callback, switching to qb-callback view')
      setCurrentView('qb-callback')
    }
    if (pathname === '/privacy') setCurrentView('privacy')
    if (pathname === '/terms') setCurrentView('terms')
  }, [])

  // Refresh project data when viewing project-related screens
  useEffect(() => {
    if (selectedProject && (currentView === 'project-detail' || currentView === 'actuals' || currentView === 'estimate' || currentView === 'change-orders' || currentView === 'forms' || currentView === 'documents' || currentView === 'quote-review' || currentView === 'selection-book')) {
      getProject_Hybrid(selectedProject.id).then(refreshedProject => {
        if (refreshedProject) {
          setSelectedProject(refreshedProject)
        }
      })
    }
  }, [currentView])

  const handleCreateProject = () => {
    setCurrentView('create-project')
  }

  const handleProjectCreated = async (formData: ProjectFormData) => {
    // Create the project with the form data
    // For spec homes, we'll create a placeholder client
    // If custom plan is selected, leave planId blank/null
    const finalPlanId =
      formData.planId === 'custom'
        ? (formData.planDisplayId || undefined)
        : (formData.planDisplayId || formData.planId)
    
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

    // Apply estimate template if one was selected via the plan
    let projectToSet: Project | null = newProject

    if (formData.estimateTemplateId && newProject.estimate) {
      const templateTrades = await applyTemplateToEstimate(formData.estimateTemplateId, newProject.estimate.id)
      if (templateTrades.length > 0) {
        for (const templateTrade of templateTrades) {
          await addTrade_Hybrid(newProject.estimate.id, {
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
        }

        const refreshed = await getProject_Hybrid(newProject.id)
        if (refreshed) {
          projectToSet = refreshed
        }
      }
    }

    setSelectedProject(projectToSet)
    setCurrentView('estimate')
  }

  const handleSelectProject = (project: Project) => {
    setSelectedProject(project)
    setCurrentView('project-detail')
  }

  const handleBackToDashboard = () => {
    setSelectedProject(null)
    setCurrentView('dashboard')
  }

  const handleBackToProjectDetail = () => {
    setCurrentView('project-detail')
  }

  const handleViewEstimate = () => {
    setCurrentView('estimate')
  }

  const handleViewActuals = () => {
    setCurrentView('actuals')
  }



  const handleViewChangeOrders = () => {
    setCurrentView('change-orders')
  }

  const handleViewDocuments = () => {
    if (selectedProject) {
      setCurrentView('documents')
    }
  }

  const handleViewForms = () => {
    setCurrentView('forms')
  }

  const handleViewSelectionBook = () => {
    if (selectedProject) {
      setCurrentView('selection-book')
    }
  }

  const handleViewQuotes = () => {
    setCurrentView('quote-review')
  }

  const handleViewDealPipeline = () => {
    setCurrentView('deal-pipeline')
  }


  const handleOpenFeedbackForm = () => {
    setShowFeedbackForm(true)
  }

  const handleOpenPlanLibrary = () => {
    setCurrentView('plan-library')
  }

  const handleOpenItemLibrary = () => {
    setCurrentView('item-library')
  }

  const handleCreatePlan = () => {
    setSelectedPlan(null)
    setCurrentView('plan-editor')
  }

  const handleEditPlan = (plan: Plan) => {
    setSelectedPlan(plan)
    setCurrentView('plan-editor')
  }

  const handlePlanSaved = (plan: Plan) => {
    setSelectedPlan(plan)
    // Stay on editor or go back to library
  }

  const handleBackToPlanLibrary = () => {
    setSelectedPlan(null)
    setCurrentView('plan-library')
  }

  const handleSignOut = async () => {
    await signOut()
    setCurrentView('dashboard')
    setSelectedProject(null)
    setShowUserMenu(false)
    setUserProfile(null)
  }


  const handleBackupData = async () => {
    if (!isOnline) {
      alert('You must be online to backup data from Supabase')
      return
    }

    setIsBackingUp(true)
    try {
      await backupAllData()
      alert('✅ Backup successful! Your data has been downloaded.\n\nCheck the browser console (F12) for verification results.')
      setShowUserMenu(false)
    } catch (error) {
      console.error('Backup failed:', error)
      alert(`❌ Backup failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsBackingUp(false)
    }
  }

  const roleIcons = {
    admin: <Crown className="w-3 h-3" />,
    editor: <Pencil className="w-3 h-3" />,
    viewer: <Eye className="w-3 h-3" />,
  }

  const roleColors = {
    admin: 'bg-purple-100 text-purple-800 border-purple-200',
    editor: 'bg-blue-100 text-blue-800 border-blue-200',
    viewer: 'bg-gray-100 text-gray-800 border-gray-200',
  }

  const roleLabels = {
    admin: 'Admin',
    editor: 'Editor',
    viewer: 'Viewer',
  }

  // Check for vendor quote portal route - bypass auth
  const pathname = window.location.pathname
  const isVendorPortalRoute = pathname.startsWith('/vendor-quote/') || pathname.startsWith('/quote/')
  if (isVendorPortalRoute) {
    return <VendorQuotePortal />
  }

  // Public legal pages (no login required) – for Intuit compliance and user access
  if (pathname === '/privacy') {
    return (
      <PrivacyPolicy
        onBack={() => { window.location.href = '/' }}
        showBackButton={true}
      />
    )
  }
  if (pathname === '/terms') {
    return (
      <TermsOfUse
        onBack={() => { window.location.href = '/' }}
        showBackButton={true}
      />
    )
  }

  return (
    <AuthGate>
      <div className="min-h-screen bg-background">
        {/* User Menu - Only show if online and authenticated */}
        {isOnline && user && (
          <div className="fixed top-4 right-4 z-50">
            <div className="relative">
              <Button
                onClick={() => setShowUserMenu(!showUserMenu)}
                variant="outline"
                size="sm"
                className="bg-white shadow-lg"
              >
                <User className="w-4 h-4 mr-2" />
                {user.email}
              </Button>
              
              {showUserMenu && (
                <div className="absolute right-0 top-full mt-2 bg-white border border-gray-300 rounded-lg shadow-lg min-w-[200px]">
                  <div className="p-2">
                    <div className="px-3 py-2 border-b border-gray-200">
                      <p className="text-xs text-gray-600">Signed in as</p>
                      <p className="text-sm font-semibold truncate">{user.email}</p>
                      {userProfile && (
                        <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium mt-1 ${roleColors[userProfile.role]}`}>
                          {roleIcons[userProfile.role]}
                          {roleLabels[userProfile.role]}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setCurrentView('qb-settings');
                        setShowUserMenu(false);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded text-sm flex items-center gap-2"
                    >
                      <Link2 className="w-4 h-4" />
                      QuickBooks
                    </button>
                    {userProfile && ['admin', 'editor'].includes(userProfile.role) && (
                      <>
                        <button
                          onClick={() => {
                            setCurrentView('contact-directory');
                            setShowUserMenu(false);
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded text-sm flex items-center gap-2"
                        >
                          <User className="w-4 h-4" />
                          Contact Directory
                        </button>
                        <button
                          onClick={() => {
                            setCurrentView('sow-management');
                            setShowUserMenu(false);
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded text-sm flex items-center gap-2"
                        >
                          <FileText className="w-4 h-4" />
                          SOW Templates
                        </button>
                        <button
                          onClick={() => {
                            setCurrentView('estimate-template-management');
                            setShowUserMenu(false);
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded text-sm flex items-center gap-2"
                        >
                          <FileText className="w-4 h-4" />
                          Estimate Templates
                        </button>
                      </>
                    )}
                    {userProfile?.role === 'admin' && (
                      <button
                        onClick={() => {
                          setCurrentView('data-migration');
                          setShowUserMenu(false);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded text-sm flex items-center gap-2"
                      >
                        <Database className="w-4 h-4" />
                        Migrate Data
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setCurrentView('my-feedback')
                        setShowUserMenu(false)
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded text-sm flex items-center gap-2"
                    >
                      <MessageSquare className="w-4 h-4" />
                      Feedback & Requests
                    </button>
                    <a
                      href="/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full text-left px-3 py-2 hover:bg-gray-100 rounded text-sm flex items-center gap-2 text-gray-700"
                    >
                      <FileText className="w-4 h-4" />
                      Privacy Policy
                    </a>
                    <a
                      href="/terms"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full text-left px-3 py-2 hover:bg-gray-100 rounded text-sm flex items-center gap-2 text-gray-700"
                    >
                      <FileText className="w-4 h-4" />
                      Terms of Use (EULA)
                    </a>
                    <button
                      onClick={handleBackupData}
                      disabled={isBackingUp}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Download className="w-4 h-4" />
                      {isBackingUp ? 'Backing up...' : 'Backup Data'}
                    </button>
                    <button
                      onClick={handleSignOut}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded text-sm flex items-center gap-2 text-red-600"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {currentView === 'dashboard' && (
          <ProjectsDashboard
            onCreateProject={handleCreateProject}
            onSelectProject={handleSelectProject}
            onOpenPlanLibrary={handleOpenPlanLibrary}
            onOpenItemLibrary={handleOpenItemLibrary}
            onOpenDealPipeline={handleViewDealPipeline}
            onOpenQBSettings={() => setCurrentView('qb-settings')}
          />
        )}

      {currentView === 'create-project' && (
        <CreateProjectForm
          onBack={handleBackToDashboard}
          onCreate={handleProjectCreated}
        />
      )}

      {currentView === 'project-detail' && selectedProject && (
        <ProjectDetailView
          project={selectedProject}
          onBack={handleBackToDashboard}
          onViewEstimate={handleViewEstimate}
          onViewActuals={handleViewActuals}
          onViewChangeOrders={handleViewChangeOrders}
          onViewForms={handleViewForms}
          onViewDocuments={handleViewDocuments}
          onViewQuotes={handleViewQuotes}
          onViewSelectionBook={handleViewSelectionBook}
          onProjectDuplicated={(newProject) => {
            setSelectedProject(newProject)
            // Stay on project detail view to see the new project
          }}
        />
      )}

      {currentView === 'estimate' && (
        <EstimateBuilder
          project={selectedProject}
          onBack={selectedProject ? handleBackToProjectDetail : handleBackToDashboard}
        />
      )}

      {currentView === 'actuals' && selectedProject && (
        <ProjectActuals
          project={selectedProject}
          onBack={handleBackToProjectDetail}
        />
      )}



      {currentView === 'change-orders' && selectedProject && (
        <ChangeOrders
          project={selectedProject}
          onBack={handleBackToProjectDetail}
        />
      )}

      {currentView === 'forms' && selectedProject && (
        <ProjectForms
          projectId={selectedProject.id}
          project={selectedProject}
          onBack={handleBackToProjectDetail}
        />
      )}

      {currentView === 'selection-book' && selectedProject && (
        <SelectionBook
          projectId={selectedProject.id}
          project={selectedProject}
          onBack={handleBackToProjectDetail}
        />
      )}

      {currentView === 'documents' && selectedProject && (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 pb-20 sm:pb-0">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
            <Button
              onClick={handleBackToProjectDetail}
              variant="outline"
              className="mb-6"
            >
              ← Back to Project
            </Button>
            <ProjectDocuments projectId={selectedProject.id} />
          </div>
        </div>
      )}

      {currentView === 'quote-review' && selectedProject && (
        <QuoteReviewDashboard
          project={selectedProject}
          onBack={handleBackToProjectDetail}
        />
      )}

      {currentView === 'plan-library' && (
        <PlanLibrary
          onBack={handleBackToDashboard}
          onCreatePlan={handleCreatePlan}
          onEditPlan={handleEditPlan}
        />
      )}

      {currentView === 'plan-editor' && (
        <PlanEditor
          plan={selectedPlan}
          onBack={handleBackToPlanLibrary}
          onSave={handlePlanSaved}
        />
      )}

      {currentView === 'item-library' && (
        <ItemLibrary
          onBack={handleBackToDashboard}
        />
      )}

      {currentView === 'contact-directory' && (
        <ContactDirectory onBack={handleBackToDashboard} userProfile={userProfile} />
      )}

      {currentView === 'sow-management' && (
        <SOWManagement
          onBack={handleBackToDashboard}
        />
      )}

      {currentView === 'estimate-template-management' && (
        <EstimateTemplateManagement
          onBack={handleBackToDashboard}
        />
      )}

      {currentView === 'deal-pipeline' && (
        <div className="container mx-auto py-6 px-4">
          <DealPipeline 
            onBack={handleBackToDashboard}
            onViewProjects={handleBackToDashboard}
          />
        </div>
      )}

      {currentView === 'my-feedback' && (
        <div className="container mx-auto py-6 px-4">
          <MyFeedback
            onBack={handleBackToDashboard}
            onNewFeedback={handleOpenFeedbackForm}
          />
        </div>
      )}

      {showFeedbackForm && (
        <FeedbackForm
          onClose={() => setShowFeedbackForm(false)}
          onSuccess={() => {
            setShowFeedbackForm(false)
            // If on my-feedback view, refresh the list
            if (currentView === 'my-feedback') {
              // Trigger refresh if function exists
              if ((window as any).refreshMyFeedback) {
                (window as any).refreshMyFeedback()
              }
              alert('✅ Thank you for your feedback! We\'ll review it soon.')
            } else {
              alert('✅ Thank you for your feedback! We\'ll review it soon.')
            }
          }}
        />
      )}

      {currentView === 'data-migration' && (
        <DataMigration />
      )}

      {currentView === 'qb-settings' && (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-8">
          <div className="max-w-2xl mx-auto space-y-6">
            <Button
              onClick={handleBackToDashboard}
              variant="outline"
              className="mb-6"
            >
              ← Back to Dashboard
            </Button>
            <QuickBooksConnect />
            <QuickBooksImport />
          </div>
        </div>
      )}

      {currentView === 'qb-callback' && (
        <QuickBooksCallback 
          onComplete={() => {
            // Clear URL params and go to QB settings
            window.history.replaceState({}, '', '/')
            setCurrentView('qb-settings')
          }}
        />
      )}

      {currentView === 'privacy' && (
        <PrivacyPolicy
          onBack={() => {
            window.history.replaceState({}, '', '/')
            setCurrentView('dashboard')
          }}
          showBackButton={true}
        />
      )}

      {currentView === 'terms' && (
        <TermsOfUse
          onBack={() => {
            window.history.replaceState({}, '', '/')
            setCurrentView('dashboard')
          }}
          showBackButton={true}
        />
      )}

      </div>
    </AuthGate>
  )
}

export default App

