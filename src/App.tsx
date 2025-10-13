import { useState } from 'react'
import { Project, Plan } from './types'
import { ProjectsDashboard } from './components/ProjectsDashboard'
import { ProjectDetailView } from './components/ProjectDetailView'
import { EstimateBuilder } from './components/EstimateBuilder'
import { CreateProjectForm, ProjectFormData } from './components/CreateProjectForm'
import { PlanLibrary } from './components/PlanLibrary'
import { PlanEditor } from './components/PlanEditor'
import { createProject } from './services/projectService'

type View = 'dashboard' | 'create-project' | 'project-detail' | 'estimate' | 'actuals' | 'variance' | 'plan-library' | 'plan-editor'

function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard')
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null)

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

  const handleViewVariance = () => {
    setCurrentView('variance')
  }

  const handleOpenPlanLibrary = () => {
    setCurrentView('plan-library')
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
          onViewVariance={handleViewVariance}
        />
      )}

      {currentView === 'estimate' && (
        <EstimateBuilder
          project={selectedProject}
          onBack={selectedProject ? handleBackToProjectDetail : handleBackToDashboard}
        />
      )}

      {currentView === 'actuals' && selectedProject && (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">Project Actuals</h1>
            <p className="text-gray-600 mb-8">Coming Soon - Track real costs and revenue</p>
            <button
              onClick={handleBackToProjectDetail}
              className="px-6 py-3 bg-[#0E79C9] text-white rounded-lg hover:bg-[#0A5A96]"
            >
              Back to Project
            </button>
          </div>
        </div>
      )}

      {currentView === 'variance' && selectedProject && (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">Variance Report</h1>
            <p className="text-gray-600 mb-8">Coming Soon - Compare Estimate vs Actuals</p>
            <button
              onClick={handleBackToProjectDetail}
              className="px-6 py-3 bg-[#34AB8A] text-white rounded-lg hover:bg-[#2a8d6f]"
            >
              Back to Project
            </button>
          </div>
        </div>
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
    </div>
  )
}

export default App

