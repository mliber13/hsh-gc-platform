// Site contacts are kept once, in the Contact Directory's "Site Contacts" category, instead of
// being retyped with their phone number on every job (Mark, 2026-10-15). The job still stores
// its own copy (fieldTakeoff.siteContact / contactPhone); the directory is what fills it.
// The directory's `role` holds the person's company — it shows as "Name (company)".

import type { Contact } from '@/types/contactDirectory'

export const SITE_CONTACT_LABEL = 'SITE_CONTACT'

export const phoneDigits = (phone: string | null | undefined): string =>
  (phone ?? '').replace(/\D/g, '').slice(-10)

/** 4405551234 → 440-555-1234, so every number in the list reads the same. */
export function formatSitePhone(phone: string | null | undefined): string {
  const d = phoneDigits(phone)
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : (phone ?? '').trim()
}

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

/**
 * Contacts matching what is typed, best first: the job's own company's people lead, then
 * everyone else. Typing matches the name, the company or the phone.
 */
export function matchSiteContacts(
  contacts: Contact[],
  query: string,
  client: string | null | undefined,
  limit = 8,
): Contact[] {
  const q = norm(query)
  const qDigits = phoneDigits(query)
  const company = norm(client)
  const sameCompany = (c: Contact) =>
    Boolean(company) && Boolean(norm(c.role)) && (company.includes(norm(c.role)) || norm(c.role).includes(company))
  const hits = contacts.filter((c) => {
    if (!q) return true
    if (norm(c.name).includes(q) || norm(c.role).includes(q)) return true
    return qDigits.length >= 3 && phoneDigits(c.phone).includes(qDigits)
  })
  const starts = (c: Contact) => (q && norm(c.name).startsWith(q) ? 0 : 1)
  return hits
    .sort(
      (a, b) =>
        Number(!sameCompany(a)) - Number(!sameCompany(b)) ||
        starts(a) - starts(b) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, limit)
}

/**
 * Whether a saved job's contact is someone the list does not have yet. Matched by phone, then
 * by name, so a person is never added twice; a known person with a different number is left
 * alone — which number is right is a call for whoever edits the directory, not a save.
 */
export function isNewSiteContact(contacts: Contact[], name: string, phone: string): boolean {
  const n = norm(name)
  if (!n) return false
  const d = phoneDigits(phone)
  return !contacts.some((c) => norm(c.name) === n || (d.length === 10 && phoneDigits(c.phone) === d))
}
