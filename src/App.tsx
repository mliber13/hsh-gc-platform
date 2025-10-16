import React, { useState, useEffect } from 'react'
import { Project, Plan } from './types'
import { ProjectsDashboard } from './components/ProjectsDashboard'
import { ProjectDetailView } from './components/ProjectDetailView'
import { EstimateBuilder } from './components/EstimateBuilder'
import { ProjectActuals } from './components/ProjectActuals'
import { ScheduleBuilder } from './components/ScheduleBuilder'
import { ChangeOrders } from './components/ChangeOrders'
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
} from './services/hybridService'
import { applyTemplateToEstimate } from './services/estimateTemplateService'
import { getCurrentUserProfile, UserProfile } from './services/userService'
import { UserManagement } from './components/UserManagement'
import { DataMigration } from './components/DataMigration'
import { Button } from './components/ui/button'
import { LogOut, User, Users, Crown, Pencil, Eye, Database, Download } from 'lucide-react'
import { backupAllData } from './services/backupService'

type View = 'dashboard' | 'create-project' | 'project-detail' | 'estimate' | 'actuals' | 'schedule' | 'change-orders' | 'plan-library' | 'plan-editor' | 'item-library' | 'user-management' | 'data-migration'

function App() {
  const { user, signOut, isOnline } = useAuth()
  const [currentView, setCurrentView] = useState<View>('dashboard')
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showUserManagement, setShowUserManagement] = useState(false)
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

  // Refresh project data when viewing project-related screens
  useEffect(() => {
    if (selectedProject && (currentView === 'project-detail' || currentView === 'actuals' || currentView === 'estimate' || currentView === 'schedule' || currentView === 'change-orders')) {
      const refreshedProject = getProject(selectedProject.id)
      if (refreshedProject) {
        setSelectedProject(refreshedProject)
      }
    }
  }, [currentView])

  const handleCreateProject = () => {
    setCurrentView('create-project')
  }

  const handleProjectCreated = async (formData: ProjectFormData) => {
    // Create the project with the form data
    // For spec homes, we'll create a placeholder client
    // Use customPlanId if it's a custom plan, otherwise use the selected planId
    const finalPlanId = formData.planId === 'custom' ? formData.customPlanId : formData.planId
    
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
    })

    // Apply estimate template if one was selected via the plan
    if (formData.estimateTemplateId && newProject.estimate) {
      const trades = applyTemplateToEstimate(formData.estimateTemplateId, newProject.estimate.id)
      console.log(`Applied estimate template: ${trades.length} trades added to project`)
    }

    setSelectedProject(newProject)
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

  const handleViewSchedule = () => {
    setCurrentView('schedule')
  }

  const handleViewChangeOrders = () => {
    setCurrentView('change-orders')
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

  const handleOpenUserManagement = () => {
    setShowUserManagement(true)
    setShowUserMenu(false)
  }

  const handleCloseUserManagement = () => {
    setShowUserManagement(false)
    // Refresh user profile in case role changed
    if (isOnline && user) {
      getCurrentUserProfile().then(profile => {
        setUserProfile(profile)
      })
    }
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
                    {userProfile?.role === 'admin' && (
                      <>
                        <button
                          onClick={handleOpenUserManagement}
                          className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded text-sm flex items-center gap-2"
                        >
                          <Users className="w-4 h-4" />
                          Manage Users
                        </button>
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
                      </>
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
          onViewSchedule={handleViewSchedule}
          onViewChangeOrders={handleViewChangeOrders}
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

      {currentView === 'schedule' && selectedProject && (
        <ScheduleBuilder
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

      {currentView === 'data-migration' && (
        <DataMigration />
      )}

      {/* User Management Modal */}
      {showUserManagement && (
        <UserManagement onClose={handleCloseUserManagement} />
      )}
      </div>
    </AuthGate>
  )
}

export default App

