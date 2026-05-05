export interface MeetingLead {
  id: string
  user_id: string | null
  display_name: string
  area_label: string
  is_meeting_operator: boolean
  display_order: number
  is_active: boolean
}

export interface MeetingPrompt {
  id: string
  lead_id: string
  question_text: string
  default_live_discuss: boolean
  display_order: number
  is_active: boolean
}

export interface MeetingSubmission {
  id: string
  lead_id: string
  prompt_id: string
  week_of: string
  answer_text: string | null
  is_live_discuss: boolean
  submitted_at: string
}

export interface PreReadPromptState {
  prompt_id: string
  question_text: string
  answer_text: string
  is_live_discuss: boolean
  submitted_at: string | null
  display_order: number
}

export interface MeetingViewPrompt {
  prompt_id: string
  question_text: string
  answer_text: string | null
  is_live_discuss: boolean
}

export interface MeetingLeadSection {
  lead_id: string
  display_name: string
  area_label: string
  prompts: MeetingViewPrompt[]
  has_submission: boolean
}

export interface MeetingViewData {
  meeting_id: string
  week_of: string
  sections: MeetingLeadSection[]
}

export type ActionItemStatus = 'Open' | 'In Progress' | 'Done' | 'Dropped'

export interface MeetingActionItem {
  id: string
  meeting_id: string | null
  task: string
  owner_lead_id: string
  due_date: string | null
  status: ActionItemStatus
  notes: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}
