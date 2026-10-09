/**
 * App logins that have no record anywhere — the Contact Directory's "Users without a contact".
 *
 * It used to list every login whose email matched no directory contact. Crew are kept in the HR
 * team roster, not the directory (Mark, 2026-10-09: "HR roster only"), so every crew login showed
 * as missing: on that day 18 of the 20 names were crew already on the roster, two of them
 * inactive test accounts, burying the two real gaps (office logins on neither list).
 *
 * A login counts as recorded when it is linked to a roster person, and an inactive login is not
 * a gap at all — it cannot sign in.
 */
import type { UserProfile } from '@/services/userService'

type ContactLike = { email?: string | null }

function present(v: unknown): boolean {
  return typeof v === 'string' && v.trim() !== ''
}

/** Linked to an HR roster person — employee, 1099 contractor, or the HR time-clock link. */
export function isOnHrRoster(
  user: Pick<
    UserProfile,
    'linked_employee_id' | 'linked_contractor_id' | 'linkedEmployeeId' | 'linkedContractorId' | 'hr_person_id'
  >,
): boolean {
  return [
    user.linked_employee_id,
    user.linked_contractor_id,
    user.linkedEmployeeId,
    user.linkedContractorId,
    user.hr_person_id,
  ].some(present)
}

export function usersMissingContact<U extends UserProfile>(users: U[], contacts: ContactLike[]): U[] {
  const contactEmails = new Set(
    contacts.map((c) => c.email?.toLowerCase().trim()).filter((e): e is string => Boolean(e)),
  )
  return users.filter(
    (u) =>
      present(u.email) &&
      u.is_active !== false &&
      !isOnHrRoster(u) &&
      !contactEmails.has(String(u.email).toLowerCase().trim()),
  )
}
