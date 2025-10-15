/**
 * Migration Script: Plans from localStorage to Supabase
 * 
 * This script migrates all plans from localStorage to Supabase
 */

import { supabase } from '../lib/supabase';
import { getAllPlans } from '../services/planService';

export async function migratePlansToSupabase(): Promise<{ success: boolean; plansMigrated: number; errors: string[] }> {
  const errors: string[] = [];
  let plansMigrated = 0;

  try {
    console.log('🔄 Starting plans migration to Supabase...');

    // Get all plans from localStorage
    const plans = getAllPlans();
    console.log(`📋 Found ${plans.length} plans in localStorage`);

    if (plans.length === 0) {
      console.log('ℹ️ No plans found in localStorage');
      return { success: true, plansMigrated: 0, errors: [] };
    }

    // Migrate each plan
    for (const plan of plans) {
      try {
        console.log(`📝 Migrating plan: ${plan.name} (${plan.planId})`);

        // Transform plan data for Supabase
        const planData = {
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
          created_at: plan.createdAt.toISOString(),
          updated_at: plan.updatedAt.toISOString(),
          // Store options as JSONB
          options: plan.options ? JSON.stringify(plan.options) : null,
          // Store documents as JSONB
          documents: plan.documents ? JSON.stringify(plan.documents) : null,
        };

        // Insert into Supabase
        const { data, error } = await supabase
          .from('plans')
          .insert(planData)
          .select()
          .single();

        if (error) {
          console.error(`❌ Error migrating plan ${plan.name}:`, error);
          errors.push(`Plan "${plan.name}": ${error.message}`);
        } else {
          console.log(`✅ Successfully migrated plan: ${plan.name}`);
          plansMigrated++;
        }

      } catch (error) {
        console.error(`❌ Error migrating plan ${plan.name}:`, error);
        errors.push(`Plan "${plan.name}": ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    console.log(`🎉 Migration complete! Migrated ${plansMigrated} plans`);
    return {
      success: errors.length === 0,
      plansMigrated,
      errors
    };

  } catch (error) {
    console.error('❌ Migration failed:', error);
    errors.push(error instanceof Error ? error.message : 'Unknown error');
    return {
      success: false,
      plansMigrated,
      errors
    };
  }
}

// Helper function to check if plans exist in Supabase
export async function checkPlansInSupabase(): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('plans')
      .select('id', { count: 'exact' });

    if (error) {
      console.error('Error checking plans in Supabase:', error);
      return 0;
    }

    return data?.length || 0;
  } catch (error) {
    console.error('Error checking plans:', error);
    return 0;
  }
}
