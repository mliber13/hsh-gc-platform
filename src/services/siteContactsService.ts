// The Contact Directory's "Site Contacts" category as a pick list for a job's site contact.
// See lib/drywall/siteContacts for the matching rules.

import { createContact, fetchContacts } from './contactDirectoryService'
import { formatSitePhone, isNewSiteContact, SITE_CONTACT_LABEL } from '@/lib/drywall/siteContacts'
import type { Contact } from '@/types'

export function fetchSiteContacts(): Promise<Contact[]> {
  return fetchContacts({ label: SITE_CONTACT_LABEL })
}

/**
 * Add a job's site contact to the list when it is someone new, so they are a pick next time.
 * Best-effort: the job is already saved, and a miss here costs one retype, so it never throws.
 * Returns true when a contact was added.
 */
export async function rememberSiteContact(input: {
  name: string
  phone: string
  company: string
}): Promise<boolean> {
  try {
    const name = input.name.trim()
    const known = await fetchSiteContacts()
    if (!isNewSiteContact(known, name, input.phone)) return false
    await createContact({
      label: SITE_CONTACT_LABEL,
      name,
      phone: formatSitePhone(input.phone) || null,
      role: input.company.trim() || null,
    })
    return true
  } catch (e) {
    console.warn('Could not add site contact to the directory', e)
    return false
  }
}
