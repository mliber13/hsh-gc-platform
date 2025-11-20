// ============================================================================
// SOW Service
// ============================================================================
//
// Service for managing Statement of Work (SOW) templates
//

import { supabase, isOnlineMode } from '@/lib/supabase'
import {
  SOWTemplate,
  CreateSOWTemplateInput,
  UpdateSOWTemplateInput,
  SOWTask,
  SOWMaterial,
  SOWSpecification,
} from '@/types/sow'

// ============================================================================
// SOW TEMPLATE OPERATIONS
// ============================================================================

/**
 * Fetch all SOW templates for the current user/organization
 */
export async function fetchSOWTemplates(tradeCategory?: string): Promise<SOWTemplate[]> {
  if (!isOnlineMode()) return []

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  // Get user's organization
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  // Validate organization_id is a valid UUID
  const organizationId = profile?.organization_id && 
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(profile.organization_id)
    ? profile.organization_id
    : null

  // Include user templates, organization templates, and system templates (user_id IS NULL)
  let query = supabase
    .from('sow_templates')
    .select('*')
    .or(`user_id.eq.${user.id}${organizationId ? `,organization_id.eq.${organizationId}` : ''},user_id.is.null`)
    .order('name', { ascending: true })

  if (tradeCategory) {
    query = query.eq('trade_category', tradeCategory)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching SOW templates:', error)
    return []
  }

  return data.map(row => ({
    id: row.id,
    userId: row.user_id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description || undefined,
    tradeCategory: row.trade_category || undefined,
    tasks: (row.tasks || []) as SOWTask[],
    materialsIncluded: (row.materials_included || []) as SOWMaterial[],
    materialsExcluded: (row.materials_excluded || []) as SOWMaterial[],
    specifications: (row.specifications || []) as SOWSpecification[],
    useCount: row.use_count || 0,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }))
}

/**
 * Fetch a single SOW template by ID
 */
export async function fetchSOWTemplateById(templateId: string): Promise<SOWTemplate | null> {
  if (!isOnlineMode()) return null

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('sow_templates')
    .select('*')
    .eq('id', templateId)
    .single()

  if (error || !data) {
    console.error('Error fetching SOW template:', error)
    return null
  }

  // Check access
  if (data.user_id !== user.id) {
    // Check if user has organization access
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (profile?.organization_id !== data.organization_id) {
      return null
    }
  }

  return {
    id: data.id,
    userId: data.user_id,
    organizationId: data.organization_id,
    name: data.name,
    description: data.description || undefined,
    tradeCategory: data.trade_category || undefined,
    tasks: (data.tasks || []) as SOWTask[],
    materialsIncluded: (data.materials_included || []) as SOWMaterial[],
    materialsExcluded: (data.materials_excluded || []) as SOWMaterial[],
    specifications: (data.specifications || []) as SOWSpecification[],
    useCount: data.use_count || 0,
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at),
  }
}

/**
 * Create a new SOW template
 */
export async function createSOWTemplate(input: CreateSOWTemplateInput): Promise<SOWTemplate | null> {
  if (!isOnlineMode()) return null

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Get user's organization
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  const organizationId = profile?.organization_id || null

  // Validate organization_id - must be a valid UUID or null (exclude 'default-org' and other invalid values)
  const validOrganizationId = organizationId && 
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(organizationId) &&
    organizationId !== 'default-org'
    ? organizationId
    : null

  const { data, error } = await supabase
    .from('sow_templates')
    .insert({
      user_id: user.id,
      organization_id: validOrganizationId,
      name: input.name,
      description: input.description || null,
      trade_category: input.tradeCategory || null,
      tasks: input.tasks || [],
      materials_included: input.materialsIncluded || [],
      materials_excluded: input.materialsExcluded || [],
      specifications: input.specifications || [],
      use_count: 0,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating SOW template:', error)
    return null
  }

  return {
    id: data.id,
    userId: data.user_id,
    organizationId: data.organization_id,
    name: data.name,
    description: data.description || undefined,
    tradeCategory: data.trade_category || undefined,
    tasks: (data.tasks || []) as SOWTask[],
    materialsIncluded: (data.materials_included || []) as SOWMaterial[],
    materialsExcluded: (data.materials_excluded || []) as SOWMaterial[],
    specifications: (data.specifications || []) as SOWSpecification[],
    useCount: data.use_count || 0,
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at),
  }
}

/**
 * Update an existing SOW template
 */
export async function updateSOWTemplate(
  templateId: string,
  input: UpdateSOWTemplateInput
): Promise<SOWTemplate | null> {
  if (!isOnlineMode()) return null

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const updateData: any = {}

  if (input.name !== undefined) updateData.name = input.name
  if (input.description !== undefined) updateData.description = input.description || null
  if (input.tradeCategory !== undefined) updateData.trade_category = input.tradeCategory || null
  if (input.tasks !== undefined) updateData.tasks = input.tasks
  if (input.materialsIncluded !== undefined) updateData.materials_included = input.materialsIncluded
  if (input.materialsExcluded !== undefined) updateData.materials_excluded = input.materialsExcluded
  if (input.specifications !== undefined) updateData.specifications = input.specifications

  const { data, error } = await supabase
    .from('sow_templates')
    .update(updateData)
    .eq('id', templateId)
    .eq('user_id', user.id) // Only allow updating own templates
    .select()
    .single()

  if (error) {
    console.error('Error updating SOW template:', error)
    return null
  }

  return {
    id: data.id,
    userId: data.user_id,
    organizationId: data.organization_id,
    name: data.name,
    description: data.description || undefined,
    tradeCategory: data.trade_category || undefined,
    tasks: (data.tasks || []) as SOWTask[],
    materialsIncluded: (data.materials_included || []) as SOWMaterial[],
    materialsExcluded: (data.materials_excluded || []) as SOWMaterial[],
    specifications: (data.specifications || []) as SOWSpecification[],
    useCount: data.use_count || 0,
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at),
  }
}

/**
 * Delete a SOW template
 */
export async function deleteSOWTemplate(templateId: string): Promise<boolean> {
  if (!isOnlineMode()) return false

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  // Fetch user's organization
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  const organizationId = profile?.organization_id || null

  // Load template to determine ownership
  const { data: template, error: fetchError } = await supabase
    .from('sow_templates')
    .select('id, user_id, organization_id')
    .eq('id', templateId)
    .single()

  if (fetchError || !template) {
    console.error('Error loading SOW template for delete:', fetchError)
    return false
  }

  const canDelete =
    template.user_id === user.id ||
    template.organization_id === organizationId

  if (!canDelete) {
    console.warn('User attempted to delete SOW template without permission', {
      templateId,
      userId: user.id,
    })
    return false
  }

  const { error } = await supabase
    .from('sow_templates')
    .delete()
    .eq('id', templateId)

  if (error) {
    console.error('Error deleting SOW template:', error)
    return false
  }

  return true
}

/**
 * Increment use count for a SOW template
 */
export async function incrementSOWTemplateUseCount(templateId: string): Promise<boolean> {
  if (!isOnlineMode()) return false

  const { error } = await supabase.rpc('increment_use_count', {
    table_name: 'sow_templates',
    record_id: templateId,
  })

  // If RPC doesn't exist, do it manually
  if (error) {
    const { data: template } = await supabase
      .from('sow_templates')
      .select('use_count')
      .eq('id', templateId)
      .single()

    if (template) {
      const { error: updateError } = await supabase
        .from('sow_templates')
        .update({ use_count: (template.use_count || 0) + 1 })
        .eq('id', templateId)

      if (updateError) {
        console.error('Error incrementing use count:', updateError)
        return false
      }
    }
  }

  return true
}

/**
 * Format SOW template into a text string for quote requests
 */
export function formatSOWForQuoteRequest(template: SOWTemplate): string {
  const lines: string[] = []

  // Tasks
  if (template.tasks.length > 0) {
    lines.push('TASKS:')
    template.tasks
      .sort((a, b) => a.order - b.order)
      .forEach(task => {
        lines.push(`- ${task.description}`)
      })
    lines.push('')
  }

  // Materials Included
  if (template.materialsIncluded.length > 0) {
    lines.push('MATERIALS INCLUDED:')
    template.materialsIncluded
      .sort((a, b) => a.order - b.order)
      .forEach(material => {
        lines.push(`- ${material.description}`)
      })
    lines.push('')
  }

  // Materials Excluded
  if (template.materialsExcluded.length > 0) {
    lines.push('MATERIALS EXCLUDED:')
    template.materialsExcluded
      .sort((a, b) => a.order - b.order)
      .forEach(material => {
        lines.push(`- ${material.description}`)
      })
    lines.push('')
  }

  // Specifications
  if (template.specifications.length > 0) {
    lines.push('SPECIFICATIONS:')
    template.specifications
      .sort((a, b) => a.order - b.order)
      .forEach(spec => {
        lines.push(`${spec.label}: ${spec.value}`)
      })
    lines.push('')
  }

  return lines.join('\n').trim()
}

