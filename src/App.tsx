import { useState, useEffect } from 'react'
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
import { createProject, getProject } from './services/projectService'

type View = 'dashboard' | 'create-project' | 'project-detail' | 'estimate' | 'actuals' | 'schedule' | 'change-orders' | 'plan-library' | 'plan-editor' | 'item-library'

function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard')
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null)

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

  const handleProjectCreated = (formData: ProjectFormData) => {
    // Create the project with the form data
    // For spec homes, we'll create a placeholder client
    // Use customPlanId if it's a custom plan, otherwise use the selected planId
    const finalPlanId = formData.planId === 'custom' ? formData.customPlanId : formData.planId
    
    const newProject = createProject({
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

  return (
    <div className="min-h-screen bg-background">
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
    </div>
  )
}

export default App

