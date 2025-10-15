/**
 * Hybrid Plan Service
 * Routes plan operations to either localStorage or Supabase based on online mode
 */

import { Plan, CreatePlanInput, UpdatePlanInput } from '../types/plan';
import { getAllPlans, createPlan, updatePlan, deletePlan, getPlanById } from './planService';
import { isOnlineMode } from '../lib/supabase';

/**
 * Get all plans (hybrid)
 */
export async function getAllPlans_Hybrid(): Promise<Plan[]> {
  // Plans are currently only in localStorage - no Supabase table yet
  return getAllPlans();
}

/**
 * Get active plans (hybrid)
 */
export async function getActivePlans_Hybrid(): Promise<Plan[]> {
  const plans = await getAllPlans_Hybrid();
  return plans.filter(plan => plan.isActive);
}

/**
 * Get plan by ID (hybrid)
 */
export async function getPlanById_Hybrid(planId: string): Promise<Plan | null> {
  // Plans are currently only in localStorage - no Supabase table yet
  return getPlanById(planId);
}

/**
 * Create plan (hybrid)
 */
export async function createPlan_Hybrid(input: CreatePlanInput): Promise<Plan> {
  // Plans are currently only in localStorage - no Supabase table yet
  return createPlan(input);
}

/**
 * Update plan (hybrid)
 */
export async function updatePlan_Hybrid(planId: string, updates: UpdatePlanInput): Promise<Plan | null> {
  // Plans are currently only in localStorage - no Supabase table yet
  return updatePlan(planId, updates);
}

/**
 * Delete plan (hybrid)
 */
export async function deletePlan_Hybrid(planId: string): Promise<boolean> {
  // Plans are currently only in localStorage - no Supabase table yet
  return deletePlan(planId);
}
