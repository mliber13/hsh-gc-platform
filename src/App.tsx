import React, { useState, useEffect } from 'react'
import { Project, Plan } from './types'
import { ProjectsDashboard } from './components/ProjectsDashboard'
import { ProjectDetailView } from './components/ProjectDetailView'
import { EstimateBuilder } from './components/EstimateBuilder'
import { ProjectActuals } from './components/ProjectActuals'

import { ChangeOrders } from './components/ChangeOrders'
import { ProjectForms } from './components/ProjectForms'
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
import { QuickBooksCallback } from './components/QuickBooksCallback'
import { VendorQuotePortal } from './components/VendorQuotePortal'
import { QuoteReviewDashboard } from './components/QuoteReviewDashboard'
import { Button } from './components/ui/button'
import { LogOut, User, Crown, Pencil, Eye, Database, Download, Link2, Building2, FileText } from 'lucide-react'
import { backupAllData } from './services/backupService'
import { PartnerDirectory } from './components/PartnerDirectory'
import { SOWManagement } from './components/SOWManagement'

type View =
  | 'dashboard'
  | 'create-project'
  | 'project-detail'
  | 'estimate'
  | 'actuals'
  | 'change-orders'
  | 'forms'
  | 'plan-library'
  | 'plan-editor'
  | 'item-library'
  | 'data-migration'
  | 'qb-settings'
  | 'qb-callback'
  | 'quote-review'
  | 'partner-directory'
  | 'sow-management'

function App() {
  const { user, signOut, isOnline } = useAuth()
  const [currentView, setCurrentView] = useState<View>('dashboard')
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [isBackingUp, setIsBackingUp] = useState(false)

  // Load user profile when authenticated
  useEffect(() => {
    if (isOnline && user) {
      getCurrentUserProfile().then(profile => {
        setUserProfile(profile)
      })
    }
  }, [isOnline, user])

  // Check for special routes (vendor quote portal, QB callback)
  useEffect(() => {
    const pathname = window.location.pathname
    const isVendorPortalRoute = pathname.startsWith('/vendor-quote/') || pathname.startsWith('/quote/')
    
    // Check for vendor quote portal route
    if (isVendorPortalRoute) {
      // This will be handled by early return, no need to set view
      return
    }
    
    // Check for QB callback route
    const params = new URLSearchParams(window.location.search)
    const hasQBCode = params.get('code') && params.get('realmId')
    
    if (hasQBCode || pathname === '/qb-callback') {
      console.log('Detected QB callback, switching to qb-callback view')
      setCurrentView('qb-callback')
    }
  }, [])

  // Refresh project data when viewing project-related screens
  useEffect(() => {
    if (selectedProject && (currentView === 'project-detail' || currentView === 'actuals' || currentView === 'estimate' || currentView === 'change-orders' || currentView === 'forms' || currentView === 'quote-review')) {
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
      const templateTrades = applyTemplateToEstimate(formData.estimateTemplateId, newProject.estimate.id)
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

  const handleViewForms = () => {
    setCurrentView('forms')
  }

  const handleViewQuotes = () => {
    setCurrentView('quote-review')
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
      alert('✅ Backup successful! Your data has been downloaded.')
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
                            setCurrentView('partner-directory');
                            setShowUserMenu(false);
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded text-sm flex items-center gap-2"
                        >
                          <Building2 className="w-4 h-4" />
                          Partner Directory
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
          onViewQuotes={handleViewQuotes}
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

      {currentView === 'partner-directory' && (
        <PartnerDirectory
          onBack={handleBackToDashboard}
        />
      )}

      {currentView === 'sow-management' && (
        <SOWManagement
          onBack={handleBackToDashboard}
        />
      )}

      {currentView === 'data-migration' && (
        <DataMigration />
      )}

      {currentView === 'qb-settings' && (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-8">
          <div className="max-w-2xl mx-auto">
            <Button
              onClick={handleBackToDashboard}
              variant="outline"
              className="mb-6"
            >
              ← Back to Dashboard
            </Button>
            <QuickBooksConnect />
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

      </div>
    </AuthGate>
  )
}

export default App

