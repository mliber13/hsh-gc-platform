// ============================================================================
// Hybrid Service Layer
// ============================================================================
//
// This service automatically routes to localStorage OR Supabase based on mode
// Provides seamless switching between offline and online modes
//

import { isOnlineMode } from '@/lib/supabase'
import { 
  getAllProjects,
  getProject as getProjectLS,
  createProject as createProjectLS,
  updateProject as updateProjectLS,
  deleteProject as deleteProjectLS,
  beginProject as beginProjectLS,
} from './projectService'
import {
  addTrade as addTradeLS,
  updateTrade as updateTradeLS,
  deleteTrade as deleteTradeLS
} from './estimateService'
import { getTradesForEstimate as getTradesLS } from './storage'
import * as supabaseService from './supabaseService'
import { Project, CreateProjectInput, UpdateProjectInput, Trade, TradeInput, getCategoryGroup } from '@/types'
import * as quoteService from './quoteService'
import { 
  QuoteRequest, 
  SubmittedQuote, 
  CreateQuoteRequestInput, 
  SubmitQuoteInput, 
  UpdateQuoteStatusInput 
} from '@/types/quote'
import type { WorkPackage, CreateWorkPackageInput, UpdateWorkPackageInput } from '@/types/workPackage'
import type {
  ProjectMilestone,
  MilestoneSourceApp,
  CreateMilestoneInput,
  UpdateMilestoneInput,
} from '@/types/projectMilestone'

// ============================================================================
// PROJECT OPERATIONS
// ============================================================================

/** When true, project list includes Drywall-only projects (for admin). Default false so GC users do not see them. */
const INCLUDE_DRYWALL_ONLY_PROJECTS = import.meta.env.VITE_INCLUDE_DRYWALL_ONLY_PROJECTS === 'true'

/**
 * Drywall-only: exclude from GC list when metadata.visibility.gc === false OR metadata.app_scope === 'DRYWALL_ONLY'.
 * Used to hide legacy drywall-only jobs from GC dashboard/list by default.
 */
function isDrywallOnlyProject(project: Project): boolean {
  const m = project.metadata as Record<string, unknown> | undefined
  if (!m) return false
  const visibility = m.visibility as Record<string, unknown> | undefined
  if (visibility && visibility.gc === false) return true
  if (m.app_scope === 'DRYWALL_ONLY') return true
  return false
}

function filterProjectsForGC(projects: Project[]): Project[] {
  if (INCLUDE_DRYWALL_ONLY_PROJECTS) return projects
  return projects.filter((p) => !isDrywallOnlyProject(p))
}

export async function getProjects_Hybrid(): Promise<Project[]> {
  const raw = isOnlineMode()
    ? await supabaseService.fetchProjects()
    : getAllProjects()
  return filterProjectsForGC(Array.isArray(raw) ? raw : [])
}

export async function getProject_Hybrid(projectId: string): Promise<Project | null> {
  if (isOnlineMode()) {
    return await supabaseService.fetchProjectById(projectId)
  } else {
    return getProjectLS(projectId)
  }
}

export async function createProject_Hybrid(input: CreateProjectInput): Promise<Project> {
  if (isOnlineMode()) {
    const project = await supabaseService.createProjectInDB(input)
    if (!project) throw new Error('Failed to create project')
    
    // Also create the estimate
    const estimate = await supabaseService.createEstimateInDB(project.id)
    if (estimate) {
      return { ...project, estimate }
    }
    return project
  } else {
    return createProjectLS(input)
  }
}

export async function updateProject_Hybrid(projectId: string, updates: UpdateProjectInput): Promise<Project | null> {
  if (isOnlineMode()) {
    if (updates.status === 'in-progress') {
      const activated = await supabaseService.activateProjectInDB(projectId, {})
      if (!activated) return null
      const { status, id: _id, ...rest } = updates
      if (Object.keys(rest).length > 0) {
        return await supabaseService.updateProjectInDB(projectId, rest)
      }
      return activated
    }
    return await supabaseService.updateProjectInDB(projectId, updates)
  } else {
    return updateProjectLS(projectId, updates)
  }
}

export type ActivateProjectOptions = { reason?: string; notes?: string }

export async function activateProject_Hybrid(
  projectId: string,
  options: ActivateProjectOptions = {}
): Promise<Project | null> {
  if (isOnlineMode()) {
    return await supabaseService.activateProjectInDB(projectId, options)
  } else {
    const updated = beginProjectLS(projectId)
    return updated ? getProjectLS(projectId) : null
  }
}

export async function deleteProject_Hybrid(projectId: string): Promise<boolean> {
  if (isOnlineMode()) {
    return await supabaseService.deleteProjectFromDB(projectId)
  } else {
    return deleteProjectLS(projectId)
  }
}

// ============================================================================
// WORK PACKAGES
// ============================================================================

export async function fetchWorkPackages_Hybrid(projectId: string): Promise<WorkPackage[]> {
  if (isOnlineMode()) {
    return await supabaseService.fetchWorkPackages(projectId)
  }
  return []
}

export async function createWorkPackage_Hybrid(
  projectId: string,
  input: CreateWorkPackageInput
): Promise<WorkPackage | null> {
  if (isOnlineMode()) {
    return await supabaseService.createWorkPackage(projectId, input)
  }
  return null
}

export async function updateWorkPackage_Hybrid(
  id: string,
  updates: UpdateWorkPackageInput
): Promise<WorkPackage | null> {
  if (isOnlineMode()) {
    return await supabaseService.updateWorkPackage(id, updates)
  }
  return null
}

export async function deleteWorkPackage_Hybrid(id: string): Promise<boolean> {
  if (isOnlineMode()) {
    return await supabaseService.deleteWorkPackage(id)
  }
  return false
}

// ============================================================================
// PROJECT MILESTONES
// ============================================================================

export async function fetchMilestones_Hybrid(projectId: string): Promise<ProjectMilestone[]> {
  if (isOnlineMode()) {
    return await supabaseService.fetchMilestones(projectId)
  }
  return []
}

export async function upsertMilestone_Hybrid(
  projectId: string,
  sourceApp: MilestoneSourceApp,
  input: CreateMilestoneInput
): Promise<ProjectMilestone | null> {
  if (isOnlineMode()) {
    return await supabaseService.upsertMilestone(projectId, sourceApp, input)
  }
  return null
}

export async function updateMilestone_Hybrid(
  id: string,
  updates: UpdateMilestoneInput
): Promise<ProjectMilestone | null> {
  if (isOnlineMode()) {
    return await supabaseService.updateMilestone(id, updates)
  }
  return null
}

export async function deleteMilestone_Hybrid(id: string): Promise<boolean> {
  if (isOnlineMode()) {
    return await supabaseService.deleteMilestone(id)
  }
  return false
}

// ============================================================================
// TRADE OPERATIONS
// ============================================================================

export async function getTradesForEstimate_Hybrid(estimateId: string): Promise<Trade[]> {
  if (isOnlineMode()) {
    return await supabaseService.fetchTradesForEstimate(estimateId)
  } else {
    return getTradesLS(estimateId)
  }
}

export async function addTrade_Hybrid(estimateId: string, input: TradeInput): Promise<Trade> {
  // Auto-populate group field based on category
  const inputWithGroup = {
    ...input,
    group: getCategoryGroup(input.category)
  }

  if (isOnlineMode()) {
    const trade = await supabaseService.createTradeInDB(estimateId, inputWithGroup)
    if (!trade) throw new Error('Failed to create trade')
    return trade
  } else {
    return addTradeLS(estimateId, inputWithGroup)
  }
}

export async function updateTrade_Hybrid(tradeId: string, updates: Partial<TradeInput>): Promise<Trade | null> {
  // Auto-populate group field if category is being updated
  const updatesWithGroup = {
    ...updates,
    ...(updates.category && { group: getCategoryGroup(updates.category) })
  }

  if (isOnlineMode()) {
    return await supabaseService.updateTradeInDB(tradeId, updatesWithGroup)
  } else {
    return updateTradeLS(tradeId, updatesWithGroup)
  }
}

export async function deleteTrade_Hybrid(tradeId: string): Promise<boolean> {
  if (isOnlineMode()) {
    return await supabaseService.deleteTradeFromDB(tradeId)
  } else {
    return deleteTradeLS(tradeId)
  }
}

export async function deleteAllTrades_Hybrid(estimateId: string): Promise<boolean> {
  if (isOnlineMode()) {
    return await supabaseService.deleteAllTradesForEstimate(estimateId)
  } else {
    const { deleteAllTrades } = await import('./estimateService')
    return deleteAllTrades(estimateId)
  }
}

// ============================================================================
// QUOTE OPERATIONS (Online-only - requires email links and vendor access)
// ============================================================================

export async function createQuoteRequest_Hybrid(input: CreateQuoteRequestInput): Promise<QuoteRequest[]> {
  // Quotes are online-only feature
  if (!isOnlineMode()) {
    throw new Error('Quote requests require online mode')
  }
  return await quoteService.createQuoteRequestInDB(input)
}

export async function fetchQuoteRequestByToken_Hybrid(token: string): Promise<QuoteRequest | null> {
  if (!isOnlineMode()) {
    return null
  }
  return await quoteService.fetchQuoteRequestByToken(token)
}

export async function fetchQuoteRequestsForProject_Hybrid(projectId: string): Promise<QuoteRequest[]> {
  if (!isOnlineMode()) {
    return []
  }
  return await quoteService.fetchQuoteRequestsForProject(projectId)
}

export async function submitQuote_Hybrid(input: SubmitQuoteInput): Promise<SubmittedQuote | null> {
  if (!isOnlineMode()) {
    return null
  }
  return await quoteService.submitQuote(input)
}

export async function fetchSubmittedQuotesForRequest_Hybrid(quoteRequestId: string): Promise<SubmittedQuote[]> {
  if (!isOnlineMode()) {
    return []
  }
  return await quoteService.fetchSubmittedQuotesForRequest(quoteRequestId)
}

export async function updateQuoteStatus_Hybrid(input: UpdateQuoteStatusInput): Promise<SubmittedQuote | null> {
  if (!isOnlineMode()) {
    return null
  }
  return await quoteService.updateQuoteStatus(input)
}

export async function deleteQuoteRequest_Hybrid(quoteRequestId: string): Promise<boolean> {
  if (!isOnlineMode()) {
    return false
  }
  return await quoteService.deleteQuoteRequest(quoteRequestId)
}

export async function resendQuoteRequestEmail_Hybrid(quoteRequest: QuoteRequest, projectName: string, tradeName?: string): Promise<boolean> {
  if (!isOnlineMode()) {
    return false
  }
  return await quoteService.resendQuoteRequestEmail(quoteRequest, projectName, tradeName)
}

// ============================================================================
// NOTE: This is a starter implementation
// We'll expand this to cover all entities (actuals, schedules, change orders, etc.)
// ============================================================================

