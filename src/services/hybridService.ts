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
// NOTE: This is a starter implementation
// We'll expand this to cover all entities (actuals, schedules, change orders, etc.)
// ============================================================================

