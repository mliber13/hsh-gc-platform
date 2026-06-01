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
import { isVisibleInGcApp } from './projectVisibility'
import { Project, CreateProjectInput, UpdateProjectInput, Trade, TradeInput } from '@/types'
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

function filterProjectsForGC(
  projects: Project[],
  gcTradeCountByProjectId?: Map<string, number>,
): Project[] {
  if (INCLUDE_DRYWALL_ONLY_PROJECTS) return projects
  return projects.filter((p) => {
    const metadata = p.metadata as Record<string, unknown> | undefined
    const gcTradeCount = gcTradeCountByProjectId?.get(p.id)
    return isVisibleInGcApp(
      metadata,
      gcTradeCount !== undefined ? { gcTradeCount } : undefined,
    )
  })
}

export async function getProjects_Hybrid(): Promise<Project[]> {
  const raw = isOnlineMode()
    ? await supabaseService.fetchProjectsForList()
    : getAllProjects()
  let projects = Array.isArray(raw) ? raw : []

  if (INCLUDE_DRYWALL_ONLY_PROJECTS || !isOnlineMode()) {
    return filterProjectsForGC(projects)
  }

  // First pass: metadata-only (DRYWALL_ONLY, visibility.gc false)
  projects = filterProjectsForGC(projects)
  if (projects.length === 0) return projects

  const stats = await supabaseService.fetchEstimateStatsForProjects(
    projects.map((p) => p.id),
  )
  const tradeCounts = new Map(
    Object.entries(stats).map(([id, s]) => [id, s.tradeCount]),
  )
  return filterProjectsForGC(projects, tradeCounts)
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

export type ProjectStats = {
  basePriceTotal: number
  estimatedValue: number
  tradeCount: number
}

function computeProjectStatsOffline(project: Project): ProjectStats {
  const trades = project.estimate?.id ? getTradesLS(project.estimate.id) : []
  const tradeCount = trades.length
  const baseFromTrades = trades.reduce((sum, trade) => sum + trade.totalCost, 0)
  const basePriceTotal =
    project.estimate?.totals?.basePriceTotal ??
    (project.estimate?.subtotal != null && project.estimate.subtotal > 0
      ? project.estimate.subtotal
      : null) ??
    baseFromTrades
  const grossProfitTotal = trades.reduce((sum, trade) => {
    const markup = trade.markupPercent || 20
    return sum + trade.totalCost * (markup / 100)
  }, 0)
  const contingency =
    project.estimate?.totals?.contingency != null
      ? project.estimate.totals.contingency
      : basePriceTotal * 0.1
  const calculatedTotal = basePriceTotal + grossProfitTotal + contingency
  const fromBook =
    project.estimate?.totals?.totalEstimated ??
    project.estimate?.totalEstimate
  const estimatedValue =
    typeof fromBook === 'number' && fromBook > 0
      ? fromBook
      : calculatedTotal
  return { basePriceTotal, estimatedValue, tradeCount }
}

export async function getEstimateStatsForProjects_Hybrid(
  projectIds: string[],
): Promise<Map<string, ProjectStats>> {
  const map = new Map<string, ProjectStats>()
  const uniqueIds = Array.from(new Set(projectIds.filter(Boolean)))
  const empty: ProjectStats = { basePriceTotal: 0, estimatedValue: 0, tradeCount: 0 }

  if (isOnlineMode()) {
    const stats = await supabaseService.fetchEstimateStatsForProjects(uniqueIds)
    for (const projectId of uniqueIds) {
      map.set(projectId, stats[projectId] ?? empty)
    }
    return map
  }

  const byId = new Map(getAllProjects().map((p) => [p.id, p]))
  for (const projectId of uniqueIds) {
    const project = byId.get(projectId)
    map.set(projectId, project ? computeProjectStatsOffline(project) : empty)
  }
  return map
}

export async function addTrade_Hybrid(estimateId: string, input: TradeInput): Promise<Trade> {
  if (isOnlineMode()) {
    const trade = await supabaseService.createTradeInDB(estimateId, input)
    if (!trade) throw new Error('Failed to create trade')
    return trade
  } else {
    return addTradeLS(estimateId, input)
  }
}

export async function updateTrade_Hybrid(tradeId: string, updates: Partial<TradeInput>): Promise<Trade | null> {
  if (isOnlineMode()) {
    return await supabaseService.updateTradeInDB(tradeId, updates)
  } else {
    return updateTradeLS(tradeId, updates)
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

