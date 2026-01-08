// ============================================================================
// Feedback Service
// ============================================================================
//
// Service for managing user feedback, bug reports, and feature requests
//

import { supabase } from '@/lib/supabase'
import type { Feedback, CreateFeedbackInput, UpdateFeedbackInput } from '@/types/feedback'

/**
 * Submit new feedback
 */
export async function submitFeedback(input: CreateFeedbackInput): Promise<Feedback | null> {
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

    const { data: feedback, error } = await supabase
      .from('feedback')
      .insert({
        organization_id: profile.organization_id,
        type: input.type,
        title: input.title,
        description: input.description,
        submitted_by: user.id,
      })
      .select()
      .single()

    if (error || !feedback) {
      console.error('Error submitting feedback:', error)
      return null
    }

    return feedback
  } catch (error) {
    console.error('Error in submitFeedback:', error)
    return null
  }
}

/**
 * Get all feedback for the current user's organization
 */
export async function getFeedback(): Promise<Feedback[]> {
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

    const { data: feedback, error } = await supabase
      .from('feedback')
      .select('*')
      .eq('organization_id', profile.organization_id)
      .order('submitted_at', { ascending: false })

    if (error) {
      console.error('Error fetching feedback:', error)
      return []
    }

    return feedback || []
  } catch (error) {
    console.error('Error in getFeedback:', error)
    return []
  }
}

/**
 * Get feedback by ID
 */
export async function getFeedbackById(feedbackId: string): Promise<Feedback | null> {
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

    const { data: feedback, error } = await supabase
      .from('feedback')
      .select('*')
      .eq('id', feedbackId)
      .eq('organization_id', profile.organization_id)
      .single()

    if (error || !feedback) {
      console.error('Error fetching feedback:', error)
      return null
    }

    return feedback
  } catch (error) {
    console.error('Error in getFeedbackById:', error)
    return null
  }
}

/**
 * Update feedback (admin only)
 */
export async function updateFeedback(
  feedbackId: string,
  updates: UpdateFeedbackInput
): Promise<Feedback | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      console.error('User not authenticated')
      return null
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id, role')
      .eq('id', user.id)
      .single()

    if (!profile?.organization_id || profile.role !== 'admin') {
      console.error('User is not an admin')
      return null
    }

    const updateData: any = {}

    if (updates.status !== undefined) {
      updateData.status = updates.status
      
      // Set resolved_at if status is completed or rejected
      if (updates.status === 'completed' || updates.status === 'rejected') {
        updateData.resolved_at = new Date().toISOString()
        updateData.resolved_by = user.id
      } else {
        // Clear resolved fields if status changes away from completed/rejected
        updateData.resolved_at = null
        updateData.resolved_by = null
      }
    }

    if (updates.admin_notes !== undefined) {
      updateData.admin_notes = updates.admin_notes
    }

    const { data: feedback, error } = await supabase
      .from('feedback')
      .update(updateData)
      .eq('id', feedbackId)
      .eq('organization_id', profile.organization_id)
      .select()
      .single()

    if (error || !feedback) {
      console.error('Error updating feedback:', error)
      return null
    }

    return feedback
  } catch (error) {
    console.error('Error in updateFeedback:', error)
    return null
  }
}

/**
 * Delete feedback (admin only)
 */
export async function deleteFeedback(feedbackId: string): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      console.error('User not authenticated')
      return false
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id, role')
      .eq('id', user.id)
      .single()

    if (!profile?.organization_id || profile.role !== 'admin') {
      console.error('User is not an admin')
      return false
    }

    const { error } = await supabase
      .from('feedback')
      .delete()
      .eq('id', feedbackId)
      .eq('organization_id', profile.organization_id)

    if (error) {
      console.error('Error deleting feedback:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Error in deleteFeedback:', error)
    return false
  }
}

/**
 * Get feedback statistics for admin dashboard
 */
export async function getFeedbackStats(): Promise<{
  total: number
  byStatus: Record<string, number>
  byType: Record<string, number>
}> {
  try {
    const feedback = await getFeedback()
    
    const byStatus: Record<string, number> = {}
    const byType: Record<string, number> = {}
    
    feedback.forEach(item => {
      byStatus[item.status] = (byStatus[item.status] || 0) + 1
      byType[item.type] = (byType[item.type] || 0) + 1
    })
    
    return {
      total: feedback.length,
      byStatus,
      byType,
    }
  } catch (error) {
    console.error('Error in getFeedbackStats:', error)
    return {
      total: 0,
      byStatus: {},
      byType: {},
    }
  }
}
