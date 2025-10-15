/**
 * Hybrid Plan Service
 * Routes plan operations to either localStorage or Supabase based on online mode
 */

import { Plan, CreatePlanInput, UpdatePlanInput } from '../types/plan';
import { getAllPlans, createPlan, updatePlan, deletePlan, getPlanById } from './planService';
import { isOnlineMode, supabase } from '../lib/supabase';
import { getCurrentUserProfile } from './userService';

/**
 * Transform Supabase plan data to Plan format
 */
function transformPlanFromSupabase(data: any): Plan {
  return {
    id: data.id,
    planId: data.plan_id,
    name: data.name,
    description: data.description || '',
    squareFootage: data.square_footage,
    bedrooms: data.bedrooms,
    bathrooms: data.bathrooms,
    stories: data.stories,
    garageSpaces: data.garage_spaces,
    notes: data.notes || '',
    isActive: data.is_active ?? true,
    estimateTemplateId: data.estimate_template_id,
    options: data.options ? JSON.parse(data.options) : [],
    documents: data.documents ? JSON.parse(data.documents) : [],
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at),
  };
}

/**
 * Transform Plan format to Supabase data
 */
function transformPlanToSupabase(plan: Plan): any {
  return {
    id: plan.id,
    plan_id: plan.planId,
    name: plan.name,
    description: plan.description,
    square_footage: plan.squareFootage,
    bedrooms: plan.bedrooms,
    bathrooms: plan.bathrooms,
    stories: plan.stories,
    garage_spaces: plan.garageSpaces,
    notes: plan.notes,
    is_active: plan.isActive,
    estimate_template_id: plan.estimateTemplateId,
    options: plan.options ? JSON.stringify(plan.options) : null,
    documents: plan.documents ? JSON.stringify(plan.documents) : null,
    created_at: plan.createdAt.toISOString(),
    updated_at: plan.updatedAt.toISOString(),
  };
}

/**
 * Get all plans (hybrid)
 */
export async function getAllPlans_Hybrid(): Promise<Plan[]> {
  if (isOnlineMode()) {
    try {
      const { data, error } = await supabase
        .from('plans')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching plans from Supabase:', error);
        // Fall back to localStorage
        return getAllPlans();
      }

      // Transform Supabase data to Plan format
      return data.map(plan => transformPlanFromSupabase(plan));
    } catch (error) {
      console.error('Error fetching plans from Supabase:', error);
      // Fall back to localStorage
      return getAllPlans();
    }
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
    try {
      const { data, error } = await supabase
        .from('plans')
        .select('*')
        .eq('id', planId)
        .single();

      if (error) {
        console.error('Error fetching plan from Supabase:', error);
        // Fall back to localStorage
        return getPlanById(planId);
      }

      return transformPlanFromSupabase(data);
    } catch (error) {
      console.error('Error fetching plan from Supabase:', error);
      // Fall back to localStorage
      return getPlanById(planId);
    }
  } else {
    return getPlanById(planId);
  }
}

/**
 * Create plan (hybrid)
 */
export async function createPlan_Hybrid(input: CreatePlanInput): Promise<Plan> {
  if (isOnlineMode()) {
    try {
      // Get current user profile
      const userProfile = await getCurrentUserProfile();
      if (!userProfile) {
        throw new Error('No user profile found. Please make sure you are logged in.');
      }

      // Create plan in localStorage first
      const plan = createPlan(input);

      // Transform and save to Supabase
      const planData = transformPlanToSupabase(plan);
      planData.user_id = userProfile.id; // Add user_id

      const { data, error } = await supabase
        .from('plans')
        .insert(planData)
        .select()
        .single();

      if (error) {
        console.error('Error creating plan in Supabase:', error);
        // Return localStorage plan even if Supabase fails
        return plan;
      }

      console.log('Plan created in both localStorage and Supabase');
      return plan;
    } catch (error) {
      console.error('Error creating plan in Supabase:', error);
      // Fall back to localStorage only
      return createPlan(input);
    }
  } else {
    return createPlan(input);
  }
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
