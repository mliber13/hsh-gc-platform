// ============================================================================
// Deal Service
// ============================================================================
// 
// Handles all operations for deals in the pipeline
//

import { supabase } from '@/lib/supabase'
import type {
  Deal,
  DealNote,
  CreateDealInput,
  UpdateDealInput,
  ConvertDealToProjectsInput,
} from '@/types/deal'
import { createProjectInDB } from './supabaseService'
import type { CreateProjectInput } from '@/types/forms'

// ============================================================================
// DEAL CRUD OPERATIONS
// ============================================================================

/**
 * Get all deals for the current user's organization
 */
export async function fetchDeals(): Promise<Deal[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      console.error('User not authenticated')
      return []
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (!profile?.organization_id) {
      console.error('User profile not found or missing organization_id')
      return []
    }

    const { data: deals, error } = await supabase
      .from('deals')
      .select('*')
      .eq('organization_id', profile.organization_id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching deals:', error)
      return []
    }

    // Load notes for each deal
    const dealsWithNotes = await Promise.all(
      (deals || []).map(async (deal) => {
        const { data: notes } = await supabase
          .from('deal_notes')
          .select('*')
          .eq('deal_id', deal.id)
          .order('created_at', { ascending: false })

        return {
          ...deal,
          notes: notes || [],
        } as Deal
      })
    )

    return dealsWithNotes
  } catch (error) {
    console.error('Error in fetchDeals:', error)
    return []
  }
}

/**
 * Get a single deal by ID
 */
export async function fetchDealById(dealId: string): Promise<Deal | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      console.error('User not authenticated')
      return null
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (!profile?.organization_id) {
      console.error('User profile not found or missing organization_id')
      return null
    }

    const { data: deal, error } = await supabase
      .from('deals')
      .select('*')
      .eq('id', dealId)
      .eq('organization_id', profile.organization_id)
      .single()

    if (error || !deal) {
      console.error('Error fetching deal:', error)
      return null
    }

    // Load notes
    const { data: notes } = await supabase
      .from('deal_notes')
      .select('*')
      .eq('deal_id', deal.id)
      .order('created_at', { ascending: false })

    return {
      ...deal,
      notes: notes || [],
    } as Deal
  } catch (error) {
    console.error('Error in fetchDealById:', error)
    return null
  }
}

/**
 * Create a new deal
 */
export async function createDeal(input: CreateDealInput): Promise<Deal | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      console.error('User not authenticated')
      return null
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (!profile?.organization_id) {
      console.error('User profile not found or missing organization_id')
      return null
    }

    const { data: deal, error } = await supabase
      .from('deals')
      .insert({
        organization_id: profile.organization_id,
        deal_name: input.deal_name,
        location: input.location,
        unit_count: input.unit_count || null,
        type: input.type,
        custom_type: input.custom_type || null,
        projected_cost: input.projected_cost || null,
        estimated_duration_months: input.estimated_duration_months || null,
        expected_start_date: input.expected_start_date === '' || input.expected_start_date === null || input.expected_start_date === undefined ? null : input.expected_start_date,
        status: input.status || 'early-stage',
        custom_status: input.custom_status || null,
        contact: input.contact || null,
        created_by: user.id,
      })
      .select()
      .single()

    if (error || !deal) {
      console.error('Error creating deal:', error)
      return null
    }

    return {
      ...deal,
      notes: [],
    } as Deal
  } catch (error) {
    console.error('Error in createDeal:', error)
    return null
  }
}

/**
 * Update a deal
 */
export async function updateDeal(dealId: string, updates: UpdateDealInput): Promise<Deal | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      console.error('User not authenticated')
      return null
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (!profile?.organization_id) {
      console.error('User profile not found or missing organization_id')
      return null
    }

    const updateData: any = {
      updated_at: new Date().toISOString(),
    }

    if (updates.deal_name !== undefined) updateData.deal_name = updates.deal_name
    if (updates.location !== undefined) updateData.location = updates.location
    if (updates.unit_count !== undefined) updateData.unit_count = updates.unit_count
    if (updates.type !== undefined) updateData.type = updates.type
    if (updates.custom_type !== undefined) updateData.custom_type = updates.custom_type
    if (updates.projected_cost !== undefined) updateData.projected_cost = updates.projected_cost
    if (updates.estimated_duration_months !== undefined) updateData.estimated_duration_months = updates.estimated_duration_months
    if (updates.expected_start_date !== undefined) {
      // Convert empty string to null for timestamp field
      updateData.expected_start_date = updates.expected_start_date === '' || updates.expected_start_date === null ? null : updates.expected_start_date
    }
    if (updates.status !== undefined) updateData.status = updates.status
    if (updates.custom_status !== undefined) updateData.custom_status = updates.custom_status
    if (updates.contact !== undefined) updateData.contact = updates.contact

    const { data: deal, error } = await supabase
      .from('deals')
      .update(updateData)
      .eq('id', dealId)
      .eq('organization_id', profile.organization_id)
      .select()
      .single()

    if (error || !deal) {
      console.error('Error updating deal:', error)
      return null
    }

    // Reload with notes
    return await fetchDealById(dealId)
  } catch (error) {
    console.error('Error in updateDeal:', error)
    return null
  }
}

/**
 * Delete a deal
 */
export async function deleteDeal(dealId: string): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      console.error('User not authenticated')
      return false
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (!profile?.organization_id) {
      console.error('User profile not found or missing organization_id')
      return false
    }

    const { error } = await supabase
      .from('deals')
      .delete()
      .eq('id', dealId)
      .eq('organization_id', profile.organization_id)

    if (error) {
      console.error('Error deleting deal:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Error in deleteDeal:', error)
    return false
  }
}

// ============================================================================
// DEAL NOTES OPERATIONS
// ============================================================================

/**
 * Add a note to a deal
 */
export async function addDealNote(dealId: string, noteText: string): Promise<DealNote | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      console.error('User not authenticated')
      return null
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (!profile?.organization_id) {
      console.error('User profile not found or missing organization_id')
      return null
    }

    const { data: note, error } = await supabase
      .from('deal_notes')
      .insert({
        deal_id: dealId,
        organization_id: profile.organization_id,
        note_text: noteText,
        created_by: user.id,
      })
      .select()
      .single()

    if (error || !note) {
      console.error('Error adding deal note:', error)
      return null
    }

    return note as DealNote
  } catch (error) {
    console.error('Error in addDealNote:', error)
    return null
  }
}

/**
 * Delete a deal note
 */
export async function deleteDealNote(noteId: string): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      console.error('User not authenticated')
      return false
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (!profile?.organization_id) {
      console.error('User profile not found or missing organization_id')
      return false
    }

    const { error } = await supabase
      .from('deal_notes')
      .delete()
      .eq('id', noteId)
      .eq('organization_id', profile.organization_id)

    if (error) {
      console.error('Error deleting deal note:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Error in deleteDealNote:', error)
    return false
  }
}

// ============================================================================
// CONVERT DEAL TO PROJECT(S)
// ============================================================================

/**
 * Convert a deal to one or more projects
 */
export async function convertDealToProjects(
  input: ConvertDealToProjectsInput
): Promise<{ success: boolean; projectIds: string[]; error?: string }> {
  try {
    const deal = await fetchDealById(input.dealId)
    if (!deal) {
      return { success: false, projectIds: [], error: 'Deal not found' }
    }

    if (deal.converted_to_projects) {
      return { success: false, projectIds: [], error: 'Deal has already been converted to projects' }
    }

    const projectIds: string[] = []
    const projectCount = input.projectCount || 1

    // Determine project type from deal type
    let projectType: 'residential-new-build' | 'residential-renovation' | 'commercial-new-build' | 'commercial-renovation' = 'residential-new-build'
    
    if (deal.type === 'commercial') {
      projectType = 'commercial-new-build'
    } else if (deal.type === 'residential') {
      projectType = 'residential-new-build'
    } else if (deal.type === 'new-single-family' || deal.type === 'multifamily' || deal.type === 'mixed-residential') {
      projectType = 'residential-new-build'
    }

    // Create projects
    for (let i = 0; i < projectCount; i++) {
      // Generate project name
      let projectName = deal.deal_name
      if (projectCount > 1) {
        const pattern = input.namingPattern || '{Deal Name} - Unit {#}'
        projectName = pattern
          .replace('{Deal Name}', deal.deal_name)
          .replace('{#}', String(i + 1))
          .replace('{Unit}', String(i + 1))
          .replace('{Lot}', String(i + 1))
      }

      // Calculate start date with offset
      let startDate: string | undefined = deal.expected_start_date
      if (startDate && input.startDateOffset) {
        const date = new Date(startDate)
        date.setDate(date.getDate() + (input.startDateOffset * i))
        startDate = date.toISOString()
      }

      // Create project input
      const projectInput: CreateProjectInput = {
        name: projectName,
        type: projectType,
        address: {
          street: deal.location,
          city: '',
          state: '',
          zip: '',
        },
        client: deal.contact ? {
          name: deal.contact.name || 'Unknown',
          email: deal.contact.email,
          phone: deal.contact.phone,
          company: deal.contact.company,
        } : {
          name: 'Unknown',
        },
        startDate: startDate ? new Date(startDate) : undefined,
        metadata: {
          dealId: deal.id,
          dealName: deal.deal_name,
          unitNumber: projectCount > 1 ? i + 1 : undefined,
        },
      }

      const project = await createProjectInDB(projectInput)
      if (project) {
        projectIds.push(project.id)
      }
    }

    // Mark deal as converted
    if (projectIds.length > 0) {
      // Update converted status directly
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('organization_id')
          .eq('id', user.id)
          .single()

        if (profile?.organization_id) {
          await supabase
            .from('deals')
            .update({
              converted_to_projects: true,
              converted_at: new Date().toISOString(),
            })
            .eq('id', input.dealId)
            .eq('organization_id', profile.organization_id)
        }
      }
    }

    return {
      success: projectIds.length > 0,
      projectIds,
      error: projectIds.length === 0 ? 'Failed to create projects' : undefined,
    }
  } catch (error) {
    console.error('Error converting deal to projects:', error)
    return {
      success: false,
      projectIds: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

