// Each job has an address at files.hshdrywall.com; forwarding an email there files its
// attachments on the job (Mark, 2026-10-15 — prints arrive by email, and saving them to Drive
// first was the step to cut). The receiver is supabase/functions/receive-job-email, which
// mirrors parseJobEmailCode — change both together.
//
// "langenmayr-5201b055@files.hshdrywall.com": the name part is only for people; the job is
// found by the 8 hex characters after the last hyphen, the start of the project's id.

export const JOB_FILES_EMAIL_DOMAIN = 'files.hshdrywall.com'

function slug(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/g, '')
  return s || 'job'
}

export function jobEmailAddress(projectId: string, projectName: string): string {
  return `${slug(projectName)}-${projectId.slice(0, 8).toLowerCase()}@${JOB_FILES_EMAIL_DOMAIN}`
}

/** The project-id prefix in a job address, or null when it is not one of ours. */
export function parseJobEmailCode(address: string): string | null {
  const m = address.trim().toLowerCase().match(/^([^@\s]+)@([^@\s]+)$/)
  if (!m || m[2] !== JOB_FILES_EMAIL_DOMAIN) return null
  const code = m[1].split('-').pop() ?? ''
  return /^[0-9a-f]{8}$/.test(code) ? code : null
}
