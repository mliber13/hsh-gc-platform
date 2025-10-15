/**
 * Data Migration Script: localStorage → Supabase
 * 
 * This script imports your exported JSON data into Supabase
 */

import { supabase } from '../lib/supabase';

interface MigrationData {
  projects: any[];
  estimates: any[];
  trades: any[];
  actuals: any[];
  laborEntries: any[];
  materialEntries: any[];
  subcontractorEntries: any[];
  schedules: any[];
  changeOrders: any[];
  plans: any[];
  itemTemplates: any[];
  estimateTemplates: any[];
}

async function migrateData(jsonData: MigrationData) {
  console.log('🚀 Starting migration to Supabase...\n');

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.error('❌ Not authenticated. Please log in first.');
    return;
  }

  // Get user's organization
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single();

  if (!profile) {
    console.error('❌ Profile not found. Please create your profile first.');
    return;
  }

  const orgId = profile.organization_id;
  console.log(`✅ Found organization: ${orgId}\n`);

  try {
    // 1. Migrate Plans
    if (jsonData.plans && jsonData.plans.length > 0) {
      console.log(`📋 Migrating ${jsonData.plans.length} plans...`);
      for (const plan of jsonData.plans) {
        const { error } = await supabase
          .from('plans')
          .insert({
            id: plan.id,
            name: plan.name,
            description: plan.description,
            plan_type: plan.planType,
            square_footage: plan.squareFootage,
            bedrooms: plan.bedrooms,
            bathrooms: plan.bathrooms,
            stories: plan.stories,
            base_price: plan.basePrice,
            thumbnail_url: plan.thumbnailUrl,
            items: plan.items,
            organization_id: orgId,
            created_at: plan.createdAt,
            updated_at: plan.updatedAt,
          });
        
        if (error) console.error(`  ❌ Plan ${plan.name}: ${error.message}`);
        else console.log(`  ✅ Plan ${plan.name}`);
      }
    }

    // 2. Migrate Item Templates
    if (jsonData.itemTemplates && jsonData.itemTemplates.length > 0) {
      console.log(`\n🔧 Migrating ${jsonData.itemTemplates.length} item templates...`);
      for (const template of jsonData.itemTemplates) {
        const { error } = await supabase
          .from('item_templates')
          .insert({
            id: template.id,
            name: template.name,
            category: template.category,
            type: template.type,
            unit: template.unit,
            cost_per_unit: template.costPerUnit,
            description: template.description,
            organization_id: orgId,
            created_at: template.createdAt,
            updated_at: template.updatedAt,
          });
        
        if (error) console.error(`  ❌ Template ${template.name}: ${error.message}`);
        else console.log(`  ✅ Template ${template.name}`);
      }
    }

    // 3. Migrate Estimate Templates
    if (jsonData.estimateTemplates && jsonData.estimateTemplates.length > 0) {
      console.log(`\n📊 Migrating ${jsonData.estimateTemplates.length} estimate templates...`);
      for (const template of jsonData.estimateTemplates) {
        const { error } = await supabase
          .from('estimate_templates')
          .insert({
            id: template.id,
            name: template.name,
            description: template.description,
            trades: template.trades,
            usage_count: template.usageCount || 0,
            linked_plan_ids: template.linkedPlanIds || [],
            organization_id: orgId,
            created_at: template.createdAt,
            updated_at: template.updatedAt,
          });
        
        if (error) console.error(`  ❌ Template ${template.name}: ${error.message}`);
        else console.log(`  ✅ Template ${template.name}`);
      }
    }

    // 4. Migrate Projects
    if (jsonData.projects && jsonData.projects.length > 0) {
      console.log(`\n🏗️ Migrating ${jsonData.projects.length} projects...`);
      for (const project of jsonData.projects) {
        const { error } = await supabase
          .from('projects')
          .insert({
            id: project.id,
            name: project.name,
            type: project.type,
            status: project.status,
            client_name: project.client?.name,
            client_email: project.client?.email,
            client_phone: project.client?.phone,
            address_street: project.address?.street,
            address_city: project.address?.city || project.city,
            address_state: project.address?.state || project.state,
            address_zip: project.address?.zip || project.zipCode,
            start_date: project.startDate,
            end_date: project.endDate,
            metadata: project.metadata,
            organization_id: orgId,
            created_by: user.id,
            created_at: project.createdAt,
            updated_at: project.updatedAt,
          });
        
        if (error) console.error(`  ❌ Project ${project.name}: ${error.message}`);
        else console.log(`  ✅ Project ${project.name}`);
      }
    }

    // 5. Migrate Estimates
    if (jsonData.estimates && jsonData.estimates.length > 0) {
      console.log(`\n💰 Migrating ${jsonData.estimates.length} estimates...`);
      for (const estimate of jsonData.estimates) {
        const { error } = await supabase
          .from('estimates')
          .insert({
            id: estimate.id,
            project_id: estimate.projectId,
            total_cost: estimate.totalCost || 0,
            organization_id: orgId,
            created_at: estimate.createdAt,
            updated_at: estimate.updatedAt,
          });
        
        if (error) console.error(`  ❌ Estimate for ${estimate.projectId}: ${error.message}`);
        else console.log(`  ✅ Estimate for ${estimate.projectId}`);
      }
    }

    // 6. Migrate Trades
    if (jsonData.trades && jsonData.trades.length > 0) {
      console.log(`\n🔨 Migrating ${jsonData.trades.length} trades...`);
      for (const trade of jsonData.trades) {
        const { error } = await supabase
          .from('trades')
          .insert({
            id: trade.id,
            estimate_id: trade.estimateId,
            category: trade.category,
            name: trade.name,
            quantity: trade.quantity,
            unit: trade.unit,
            unit_cost: trade.unitCost,
            total_cost: trade.totalCost,
            markup_percent: trade.markupPercent,
            notes: trade.notes,
            organization_id: orgId,
            created_at: trade.createdAt,
            updated_at: trade.updatedAt,
          });
        
        if (error && !error.message.includes('duplicate key')) {
          console.error(`  ❌ Trade ${trade.name}: ${error.message}`);
        } else if (!error) {
          console.log(`  ✅ Trade ${trade.name}`);
        }
      }
    }

    // 7. Migrate Project Actuals
    if (jsonData.actuals && jsonData.actuals.length > 0) {
      console.log(`\n📈 Migrating ${jsonData.actuals.length} project actuals...`);
      for (const actual of jsonData.actuals) {
        const { error } = await supabase
          .from('project_actuals')
          .insert({
            id: actual.id,
            project_id: actual.projectId,
            organization_id: orgId,
            created_at: actual.createdAt,
            updated_at: actual.updatedAt,
          });
        
        if (error) console.error(`  ❌ Actual for ${actual.projectId}: ${error.message}`);
        else console.log(`  ✅ Actual for ${actual.projectId}`);
      }
    }

    // 8. Migrate Labor Entries
    if (jsonData.laborEntries && jsonData.laborEntries.length > 0) {
      console.log(`\n👷 Migrating ${jsonData.laborEntries.length} labor entries...`);
      for (const entry of jsonData.laborEntries) {
        const { error } = await supabase
          .from('labor_entries')
          .insert({
            id: entry.id,
            actual_id: entry.actualId,
            trade_id: entry.tradeId,
            worker_name: entry.workerName,
            hours: entry.hours,
            hourly_rate: entry.hourlyRate,
            total_cost: entry.totalCost,
            date: entry.date,
            notes: entry.notes,
            organization_id: orgId,
            entered_by: user.id,
            created_at: entry.createdAt,
            updated_at: entry.updatedAt,
          });
        
        if (error) console.error(`  ❌ Labor entry: ${error.message}`);
      }
      console.log(`  ✅ ${jsonData.laborEntries.length} labor entries`);
    }

    // 9. Migrate Material Entries
    if (jsonData.materialEntries && jsonData.materialEntries.length > 0) {
      console.log(`\n🧱 Migrating ${jsonData.materialEntries.length} material entries...`);
      for (const entry of jsonData.materialEntries) {
        const { error } = await supabase
          .from('material_entries')
          .insert({
            id: entry.id,
            actual_id: entry.actualId,
            trade_id: entry.tradeId,
            material_name: entry.materialName,
            quantity: entry.quantity,
            unit: entry.unit,
            unit_cost: entry.unitCost,
            total_cost: entry.totalCost,
            vendor: entry.vendor,
            date: entry.date,
            notes: entry.notes,
            organization_id: orgId,
            entered_by: user.id,
            created_at: entry.createdAt,
            updated_at: entry.updatedAt,
          });
        
        if (error) console.error(`  ❌ Material entry: ${error.message}`);
      }
      console.log(`  ✅ ${jsonData.materialEntries.length} material entries`);
    }

    // 10. Migrate Subcontractor Entries
    if (jsonData.subcontractorEntries && jsonData.subcontractorEntries.length > 0) {
      console.log(`\n🏢 Migrating ${jsonData.subcontractorEntries.length} subcontractor entries...`);
      for (const entry of jsonData.subcontractorEntries) {
        const { error } = await supabase
          .from('subcontractor_entries')
          .insert({
            id: entry.id,
            actual_id: entry.actualId,
            trade_id: entry.tradeId,
            company_name: entry.companyName,
            contact_name: entry.contactName,
            amount: entry.amount,
            description: entry.description,
            date: entry.date,
            notes: entry.notes,
            organization_id: orgId,
            entered_by: user.id,
            created_at: entry.createdAt,
            updated_at: entry.updatedAt,
          });
        
        if (error) console.error(`  ❌ Subcontractor entry: ${error.message}`);
      }
      console.log(`  ✅ ${jsonData.subcontractorEntries.length} subcontractor entries`);
    }

    // 11. Migrate Schedules
    if (jsonData.schedules && jsonData.schedules.length > 0) {
      console.log(`\n📅 Migrating ${jsonData.schedules.length} schedules...`);
      for (const schedule of jsonData.schedules) {
        const { error } = await supabase
          .from('schedules')
          .insert({
            id: schedule.id,
            project_id: schedule.projectId,
            items: schedule.items,
            organization_id: orgId,
            created_at: schedule.createdAt,
            updated_at: schedule.updatedAt,
          });
        
        if (error) console.error(`  ❌ Schedule: ${error.message}`);
        else console.log(`  ✅ Schedule for project`);
      }
    }

    // 12. Migrate Change Orders
    if (jsonData.changeOrders && jsonData.changeOrders.length > 0) {
      console.log(`\n📝 Migrating ${jsonData.changeOrders.length} change orders...`);
      for (const co of jsonData.changeOrders) {
        const { error } = await supabase
          .from('change_orders')
          .insert({
            id: co.id,
            project_id: co.projectId,
            number: co.number,
            title: co.title,
            description: co.description,
            status: co.status,
            cost_impact: co.costImpact,
            time_impact_days: co.timeImpactDays,
            requested_date: co.requestedDate,
            approved_date: co.approvedDate,
            affected_trades: co.affectedTrades,
            organization_id: orgId,
            created_by: user.id,
            created_at: co.createdAt,
            updated_at: co.updatedAt,
          });
        
        if (error) console.error(`  ❌ Change Order ${co.number}: ${error.message}`);
        else console.log(`  ✅ Change Order ${co.number}`);
      }
    }

    console.log('\n✅ Migration completed successfully! 🎉');
    console.log('\n🔄 Refresh your app to see all your data!');
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
  }
}

// Export for use
export { migrateData };

// For direct script execution
if (typeof window !== 'undefined') {
  (window as any).migrateData = migrateData;
}

