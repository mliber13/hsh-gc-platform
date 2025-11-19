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
  deleteProject as deleteProjectLS
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

// ============================================================================
// PROJECT OPERATIONS
// ============================================================================

export async function getProjects_Hybrid(): Promise<Project[]> {
  if (isOnlineMode()) {
    return await supabaseService.fetchProjects()
  } else {
    return getAllProjects()
  }
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
    return await supabaseService.updateProjectInDB(projectId, updates)
  } else {
    return updateProjectLS(projectId, updates)
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

