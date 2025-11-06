// ============================================================================
// Project Service
// ============================================================================
// 
// Business logic for project operations
//

import { v4 as uuidv4 } from 'uuid'
import {
  Project,
  CreateProjectInput,
  UpdateProjectInput,
  Estimate,
  ProjectActuals,
  ProjectSchedule,
  DEFAULT_VALUES,
} from '@/types'
import {
  projectStorage,
  estimateStorage,
  getCompleteProject,
  getActiveProjects,
  getProjectsByStatus,
  searchProjects,
  getTradesForEstimate,
} from './storage'
import { addTrade } from './estimateService'

// ----------------------------------------------------------------------------
// Project CRUD Operations
// ----------------------------------------------------------------------------

/**
 * Create a new project with initial estimate
 */
export function createProject(input: CreateProjectInput): Project {
  const projectId = uuidv4()
  const estimateId = uuidv4()
  const now = new Date()

  // Create initial estimate
  const estimate: Estimate = {
    id: estimateId,
    projectId,
    version: 1,
    trades: [],
    subtotal: 0,
    overhead: 0,
    profit: 0,
    contingency: 0,
    totalEstimate: 0,
    createdAt: now,
    updatedAt: now,
  }

  // Create client ID if not provided
  const clientId = input.client.name ? uuidv4() : input.client.name

  // Create project
  const project: Project = {
    id: projectId,
    name: input.name,
    projectNumber: input.projectNumber,
    client: {
      id: clientId,
      ...input.client,
    },
    type: input.type,
    status: 'estimating',
    address: input.address,
    estimate,
    startDate: input.startDate,
    estimatedCompletionDate: input.estimatedCompletionDate,
    notes: input.notes,
    specs: input.specs,
    metadata: input.metadata,
    city: input.city,
    state: input.state,
    zipCode: input.zipCode,
    createdAt: now,
    updatedAt: now,
  }

  // Save to storage
  estimateStorage.create(estimate)
  projectStorage.create(project)

  return project
}

/**
 * Update existing project
 */
export function updateProject(id: string, updates: Partial<UpdateProjectInput>): Project | null {
  const project = projectStorage.getById(id)
  if (!project) return null

  // Convert ClientInput to Client if provided
  const updateData: any = {
    ...updates,
    updatedAt: new Date(),
  }

  // If client is being updated, ensure it has an id
  if (updates.client && !('id' in updates.client)) {
    updateData.client = {
      ...updates.client,
      id: project.client.id, // Preserve existing client id
    }
  }

  const updated = projectStorage.update(id, updateData as Partial<Project>)
  return updated
}

/**
 * Delete project and all related data
 */
export function deleteProject(projectId: string): boolean {
  const project = projectStorage.getById(projectId)
  if (!project) return false

  // Delete related estimate
  if (project.estimate?.id) {
    estimateStorage.delete(project.estimate.id)
  }

  // Delete project
  return projectStorage.delete(projectId)
}

/**
 * Get project by ID
 */
export function getProject(projectId: string): Project | null {
  return getCompleteProject(projectId)
}

/**
 * Get all projects
 */
export function getAllProjects(): Project[] {
  return projectStorage.getAll()
}

/**
 * Get active projects
 */
export function getActiveProjectsList(): Project[] {
  return getActiveProjects()
}

/**
 * Get projects by status
 */
export function getProjectsByStatusList(status: Project['status']): Project[] {
  return getProjectsByStatus(status)
}

/**
 * Search projects
 */
export function searchProjectsList(searchTerm: string): Project[] {
  return searchProjects(searchTerm)
}

// ----------------------------------------------------------------------------
// Project Status Management
// ----------------------------------------------------------------------------

/**
 * Change project status
 */
export function changeProjectStatus(
  projectId: string,
  newStatus: Project['status']
): Project | null {
  const project = projectStorage.getById(projectId)
  if (!project) return null

  const updates: Partial<Project> = {
    status: newStatus,
    updatedAt: new Date(),
  }

  // Set dates based on status changes
  if (newStatus === 'in-progress' && !project.startDate) {
    updates.startDate = new Date()
  }

  if (newStatus === 'complete' && !project.actualCompletionDate) {
    updates.actualCompletionDate = new Date()
  }

  // Initialize actuals when project is started
  if (newStatus === 'in-progress' && !project.actuals) {
    updates.actuals = {
      id: uuidv4(),
      projectId,
      laborEntries: [],
      materialEntries: [],
      subcontractorEntries: [],
      totalLaborCost: 0,
      totalMaterialCost: 0,
      totalSubcontractorCost: 0,
      totalActualCost: 0,
      variance: 0,
      variancePercentage: 0,
      dailyLogs: [],
      changeOrders: [],
    }
  }

  return projectStorage.update(projectId, updates)
}

/**
 * Start project (move to in-progress)
 */
export function beginProject(projectId: string): Project | null {
  return changeProjectStatus(projectId, 'in-progress')
}

/**
 * Complete project
 */
export function completeProject(projectId: string): Project | null {
  return changeProjectStatus(projectId, 'complete')
}

// ----------------------------------------------------------------------------
// Project Summary & Analytics
// ----------------------------------------------------------------------------

/**
 * Get project summary statistics
 */
export function getProjectSummary(projectId: string) {
  const project = getProject(projectId)
  if (!project) return null

  const estimatedCost = project.estimate.totalEstimate
  const actualCost = project.actuals?.totalActualCost || 0
  const variance = actualCost - estimatedCost
  const variancePercentage = estimatedCost > 0 ? (variance / estimatedCost) * 100 : 0

  return {
    projectId,
    estimatedCost,
    actualCost,
    variance,
    variancePercentage,
    percentComplete: project.schedule?.percentComplete || 0,
    isOnSchedule: project.schedule?.isOnSchedule || true,
    daysRemaining: project.schedule?.daysRemaining || 0,
    openIssuesCount: project.actuals?.dailyLogs.flatMap(log => log.issues || [])
      .filter(issue => issue.status !== 'resolved').length || 0,
    criticalIssuesCount: project.actuals?.dailyLogs.flatMap(log => log.issues || [])
      .filter(issue => issue.severity === 'critical' && issue.status !== 'resolved').length || 0,
  }
}

/**
 * Get dashboard statistics
 */
export function getDashboardStats() {
  const allProjects = projectStorage.getAll()
  
  const activeProjects = allProjects.filter(p => p.status === 'in-progress')
  const totalValue = allProjects
    .filter(p => p.status === 'in-progress')
    .reduce((sum, p) => sum + p.estimate.totalEstimate, 0)

  const projectsByStatus = allProjects.reduce((acc, project) => {
    acc[project.status] = (acc[project.status] || 0) + 1
    return acc
  }, {} as Record<Project['status'], number>)

  return {
    totalProjects: allProjects.length,
    activeProjects: activeProjects.length,
    totalValue,
    projectsByStatus,
    estimatingCount: projectsByStatus.estimating || 0,
    inProgressCount: projectsByStatus['in-progress'] || 0,
    completeCount: projectsByStatus.complete || 0,
  }
}

/**
 * Get projects summary list
 */
export function getProjectsSummaryList() {
  const projects = projectStorage.getAll()
  
  return projects.map(project => ({
    id: project.id,
    name: project.name,
    projectNumber: project.projectNumber,
    client: project.client.name,
    type: project.type,
    status: project.status,
    estimatedCost: project.estimate.totalEstimate,
    actualCost: project.actuals?.totalActualCost || 0,
    variance: (project.actuals?.totalActualCost || 0) - project.estimate.totalEstimate,
    startDate: project.startDate,
    estimatedCompletionDate: project.estimatedCompletionDate,
    percentComplete: project.schedule?.percentComplete || 0,
  }))
}

// ----------------------------------------------------------------------------
// Duplicate & Template Operations
// ----------------------------------------------------------------------------

/**
 * Duplicate a project (for similar estimates)
 */
export function duplicateProject(
  sourceProjectId: string,
  newName: string
): Project | null {
  const source = getProject(sourceProjectId)
  if (!source) return null

  // Create new project with same structure
  const input: CreateProjectInput = {
    name: newName,
    projectNumber: undefined, // Let user set this
    client: source.client,
    type: source.type,
    address: source.address,
    city: source.city,
    state: source.state,
    zipCode: source.zipCode,
    metadata: source.metadata,
  }

  const newProject = createProject(input)

  // Copy all trades from source estimate
  const sourceTrades = getTradesForEstimate(source.estimate.id)
  
  sourceTrades.forEach((trade) => {
    addTrade(newProject.estimate.id, {
      category: trade.category,
      name: trade.name,
      description: trade.description,
      quantity: trade.quantity,
      unit: trade.unit,
      laborCost: trade.laborCost,
      laborRate: trade.laborRate,
      laborHours: trade.laborHours,
      materialCost: trade.materialCost,
      materialRate: trade.materialRate,
      subcontractorCost: trade.subcontractorCost,
      isSubcontracted: trade.isSubcontracted,
      wasteFactor: trade.wasteFactor,
      markupPercent: trade.markupPercent,
      notes: trade.notes,
    })
  })

  // Get the updated project with all trades
  const updatedProject = projectStorage.getById(newProject.id)
  
  // Reset to estimating status (no actuals)
  projectStorage.update(newProject.id, {
    status: 'estimating',
    actuals: undefined,
    schedule: undefined,
  })

  return projectStorage.getById(newProject.id)
}


