import { supabase } from '@/lib/supabase'
import type {
  ActionItemStatus,
  MeetingActionItem,
  MeetingLeadSection,
  MeetingViewData,
  MeetingLead,
  MeetingPrompt,
  MeetingSubmission,
  PreReadPromptState,
} from '@/types/meeting'

export async function getCurrentUserMeetingLead(
  userId: string,
): Promise<MeetingLead | null> {
  const { data, error } = await supabase
    .from('meeting_leads')
    .select(
      'id, user_id, display_name, area_label, is_meeting_operator, display_order, is_active',
    )
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function getCurrentWeekOf(): Promise<string> {
  const { data, error } = await supabase.rpc('meeting_week_of')
  if (error) throw error
  return data
}

export async function getPreReadPromptState(
  leadId: string,
  weekOf: string,
): Promise<PreReadPromptState[]> {
  const [{ data: prompts, error: promptsError }, { data: submissions, error: submissionsError }] =
    await Promise.all([
      supabase
        .from('meeting_prompts')
        .select(
          'id, lead_id, question_text, default_live_discuss, display_order, is_active',
        )
        .eq('lead_id', leadId)
        .eq('is_active', true)
        .order('display_order', { ascending: true }),
      supabase
        .from('meeting_submissions')
        .select(
          'id, lead_id, prompt_id, week_of, answer_text, is_live_discuss, submitted_at',
        )
        .eq('lead_id', leadId)
        .eq('week_of', weekOf),
    ])

  if (promptsError) throw promptsError
  if (submissionsError) throw submissionsError

  const submissionByPromptId = new Map(
    ((submissions ?? []) as MeetingSubmission[]).map((submission) => [
      submission.prompt_id,
      submission,
    ]),
  )

  return ((prompts ?? []) as MeetingPrompt[]).map((prompt) => {
    const submission = submissionByPromptId.get(prompt.id)
    return {
      prompt_id: prompt.id,
      question_text: prompt.question_text,
      answer_text: submission?.answer_text ?? '',
      is_live_discuss:
        submission?.is_live_discuss ?? prompt.default_live_discuss,
      submitted_at: submission?.submitted_at ?? null,
      display_order: prompt.display_order,
    }
  })
}

export async function upsertPreReadSubmissions(params: {
  leadId: string
  weekOf: string
  prompts: Array<{
    prompt_id: string
    answer_text: string
    is_live_discuss: boolean
  }>
}): Promise<void> {
  const nowIso = new Date().toISOString()
  const rows = params.prompts.map((prompt) => ({
    lead_id: params.leadId,
    prompt_id: prompt.prompt_id,
    week_of: params.weekOf,
    answer_text: prompt.answer_text,
    is_live_discuss: prompt.is_live_discuss,
    submitted_at: nowIso,
  }))

  const { error } = await supabase.from('meeting_submissions').upsert(rows, {
    onConflict: 'lead_id,prompt_id,week_of',
  })
  if (error) throw error
}

export async function ensureMeeting(meetingDate: string): Promise<string> {
  const { data, error } = await supabase.rpc('ensure_meeting', {
    p_meeting_date: meetingDate,
  })
  if (error) throw error
  return data
}

export async function getMeetingViewData(
  meetingDate: string,
  weekOf: string,
): Promise<MeetingViewData> {
  const [
    meetingId,
    { data: leads, error: leadsError },
    { data: prompts, error: promptsError },
    { data: submissions, error: submissionsError },
  ] = await Promise.all([
    ensureMeeting(meetingDate),
    supabase
      .from('meeting_leads')
      .select(
        'id, user_id, display_name, area_label, is_meeting_operator, display_order, is_active',
      )
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
    supabase
      .from('meeting_prompts')
      .select(
        'id, lead_id, question_text, default_live_discuss, display_order, is_active',
      )
      .eq('is_active', true)
      .order('lead_id', { ascending: true })
      .order('display_order', { ascending: true }),
    supabase
      .from('meeting_submissions')
      .select(
        'id, lead_id, prompt_id, week_of, answer_text, is_live_discuss, submitted_at',
      )
      .eq('week_of', weekOf),
  ])

  if (leadsError) throw leadsError
  if (promptsError) throw promptsError
  if (submissionsError) throw submissionsError

  const allLeads = (leads ?? []) as MeetingLead[]
  const allPrompts = (prompts ?? []) as MeetingPrompt[]
  const allSubmissions = (submissions ?? []) as MeetingSubmission[]

  const promptsByLeadId = new Map<string, MeetingPrompt[]>()
  for (const prompt of allPrompts) {
    const existing = promptsByLeadId.get(prompt.lead_id) ?? []
    existing.push(prompt)
    promptsByLeadId.set(prompt.lead_id, existing)
  }

  const submissionsByPromptId = new Map<string, MeetingSubmission>()
  const submissionCountByLeadId = new Map<string, number>()
  for (const submission of allSubmissions) {
    submissionsByPromptId.set(submission.prompt_id, submission)
    const currentCount = submissionCountByLeadId.get(submission.lead_id) ?? 0
    submissionCountByLeadId.set(submission.lead_id, currentCount + 1)
  }

  const sections: MeetingLeadSection[] = allLeads.map((lead) => {
    const leadPrompts = (promptsByLeadId.get(lead.id) ?? []).sort(
      (a, b) => a.display_order - b.display_order,
    )
    const hasSubmission = (submissionCountByLeadId.get(lead.id) ?? 0) > 0

    return {
      lead_id: lead.id,
      display_name: lead.display_name,
      area_label: lead.area_label,
      has_submission: hasSubmission,
      prompts: leadPrompts.map((prompt) => {
        const submission = submissionsByPromptId.get(prompt.id)
        return {
          prompt_id: prompt.id,
          question_text: prompt.question_text,
          answer_text: submission?.answer_text ?? null,
          is_live_discuss: submission?.is_live_discuss ?? false,
        }
      }),
    }
  })

  return {
    meeting_id: meetingId,
    week_of: weekOf,
    sections,
  }
}

export async function getMeetingActionItems(
  meetingId: string,
): Promise<MeetingActionItem[]> {
  const { data, error } = await supabase
    .from('meeting_action_items')
    .select(
      'id, meeting_id, task, owner_lead_id, due_date, status, notes, created_at, updated_at, created_by',
    )
    .eq('meeting_id', meetingId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as MeetingActionItem[]
}

export async function createMeetingActionItem(params: {
  meetingId: string
  task: string
  ownerLeadId: string
  dueDate: string | null
  notes: string | null
}): Promise<MeetingActionItem> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError) throw userError

  const { data, error } = await supabase
    .from('meeting_action_items')
    .insert({
      meeting_id: params.meetingId,
      task: params.task,
      owner_lead_id: params.ownerLeadId,
      due_date: params.dueDate,
      notes: params.notes,
      created_by: user?.id ?? null,
    })
    .select(
      'id, meeting_id, task, owner_lead_id, due_date, status, notes, created_at, updated_at, created_by',
    )
    .single()

  if (error) throw error
  return data as MeetingActionItem
}

export async function updateMeetingActionItemStatus(
  id: string,
  status: ActionItemStatus,
): Promise<MeetingActionItem> {
  const { data, error } = await supabase
    .from('meeting_action_items')
    .update({ status })
    .eq('id', id)
    .select(
      'id, meeting_id, task, owner_lead_id, due_date, status, notes, created_at, updated_at, created_by',
    )
    .single()

  if (error) throw error
  return data as MeetingActionItem
}

export async function deleteMeetingActionItem(id: string): Promise<void> {
  const { error } = await supabase.from('meeting_action_items').delete().eq('id', id)
  if (error) throw error
}

export function subscribeMeetingActionItems(
  meetingId: string,
  handlers: {
    onInsert: (row: MeetingActionItem) => void
    onUpdate: (row: MeetingActionItem) => void
    onDelete: (id: string) => void
  },
): () => void {
  const channel = supabase
    .channel(`meeting_action_items:${meetingId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'meeting_action_items',
        filter: `meeting_id=eq.${meetingId}`,
      },
      (payload) => handlers.onInsert(payload.new as MeetingActionItem),
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'meeting_action_items',
        filter: `meeting_id=eq.${meetingId}`,
      },
      (payload) => handlers.onUpdate(payload.new as MeetingActionItem),
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'meeting_action_items',
        filter: `meeting_id=eq.${meetingId}`,
      },
      (payload) => handlers.onDelete(payload.old.id as string),
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}
