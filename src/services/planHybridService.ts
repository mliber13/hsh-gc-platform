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
  if (isOnlineMode()) {
    // TODO: Implement Supabase plan fetching when plan table is added
    // For now, fall back to localStorage
    console.log('Plan Supabase integration not yet implemented, using localStorage');
    return getAllPlans();
  } else {
    return getAllPlans();
  }
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
  if (isOnlineMode()) {
    // TODO: Implement Supabase plan fetching when plan table is added
    // For now, fall back to localStorage
    console.log('Plan Supabase integration not yet implemented, using localStorage');
    return getPlanById(planId);
  } else {
    return getPlanById(planId);
  }
}

/**
 * Create plan (hybrid)
 */
export async function createPlan_Hybrid(input: CreatePlanInput): Promise<Plan> {
  if (isOnlineMode()) {
    // TODO: Implement Supabase plan creation when plan table is added
    // For now, fall back to localStorage
    console.log('Plan Supabase integration not yet implemented, using localStorage');
    return createPlan(input);
  } else {
    return createPlan(input);
  }
}

/**
 * Update plan (hybrid)
 */
export async function updatePlan_Hybrid(planId: string, updates: UpdatePlanInput): Promise<Plan | null> {
  if (isOnlineMode()) {
    // TODO: Implement Supabase plan updating when plan table is added
    // For now, fall back to localStorage
    console.log('Plan Supabase integration not yet implemented, using localStorage');
    return updatePlan(planId, updates);
  } else {
    return updatePlan(planId, updates);
  }
}

/**
 * Delete plan (hybrid)
 */
export async function deletePlan_Hybrid(planId: string): Promise<boolean> {
  if (isOnlineMode()) {
    // TODO: Implement Supabase plan deletion when plan table is added
    // For now, fall back to localStorage
    console.log('Plan Supabase integration not yet implemented, using localStorage');
    return deletePlan(planId);
  } else {
    return deletePlan(planId);
  }
}
