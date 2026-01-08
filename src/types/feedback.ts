// ============================================================================
// Feedback System Types
// ============================================================================

export type FeedbackType = 'bug' | 'feature-request' | 'general-feedback'

export type FeedbackStatus = 
  | 'new'
  | 'reviewing'
  | 'in-progress'
  | 'completed'
  | 'rejected'
  | 'duplicate'

export interface Feedback {
  id: string
  organization_id: string
  type: FeedbackType
  title: string
  description: string
  status: FeedbackStatus
  submitted_by: string
  submitted_at: string
  admin_notes?: string
  resolved_at?: string
  resolved_by?: string
}

export interface CreateFeedbackInput {
  type: FeedbackType
  title: string
  description: string
}

export interface UpdateFeedbackInput {
  status?: FeedbackStatus
  admin_notes?: string
}

export const FEEDBACK_TYPE_LABELS: Record<FeedbackType, string> = {
  'bug': 'Bug Report',
  'feature-request': 'Feature Request',
  'general-feedback': 'General Feedback',
}

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  'new': 'New',
  'reviewing': 'Reviewing',
  'in-progress': 'In Progress',
  'completed': 'Completed',
  'rejected': 'Rejected',
  'duplicate': 'Duplicate',
}

export const FEEDBACK_STATUS_COLORS: Record<FeedbackStatus, string> = {
  'new': 'bg-blue-100 text-blue-800',
  'reviewing': 'bg-yellow-100 text-yellow-800',
  'in-progress': 'bg-orange-100 text-orange-800',
  'completed': 'bg-green-100 text-green-800',
  'rejected': 'bg-red-100 text-red-800',
  'duplicate': 'bg-gray-100 text-gray-800',
}
