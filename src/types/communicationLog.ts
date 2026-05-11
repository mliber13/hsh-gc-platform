// CommunicationLogEntry - schedule comms-layer entity.
// Reference: docs/SCHEDULE_TARGET_MODEL.md section 3.1.
// Step 5: types only. Service + UI land in step 6.

export type CommLogDirection = 'inbound' | 'outbound' | 'system'

export type CommLogChannel = 'sms' | 'email' | 'in-app' | 'phone' | 'system'

export interface CommLogAttachment {
  url: string
  mime_type: string
  file_size: number
  thumbnail_url?: string
}

export interface CommunicationLogEntry {
  id: string
  organization_id: string
  project_id: string
  schedule_item_id?: string | null

  direction: CommLogDirection
  channel: CommLogChannel

  author_user_id?: string | null
  author_company_id?: string | null
  author_label?: string | null

  body: string
  attachments: CommLogAttachment[]
  metadata?: Record<string, unknown> | null

  created_at: string
}
