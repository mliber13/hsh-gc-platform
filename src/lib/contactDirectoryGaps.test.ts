/**
 * "Users without a contact" should name only logins with no record anywhere. Shaped like the
 * live list on 2026-10-09: 18 crew on the HR roster (two inactive) and two office logins on
 * neither list. Only the two office logins are real gaps.
 */
import { describe, expect, it } from 'vitest'
import type { UserProfile } from '@/services/userService'
import { isOnHrRoster, usersMissingContact } from './contactDirectoryGaps'

function user(patch: Partial<UserProfile>): UserProfile {
  return { id: patch.email ?? 'u', email: 'x@example.com', is_active: true, ...patch } as UserProfile
}

const david = user({ full_name: 'David Busico', email: 'dbfungol@hotmail.com', roles: ['crew'], linked_employee_id: 'ml5i342huhgcacahj0a' })
const contractor = user({ full_name: '1099 crew', email: 'c@example.com', roles: ['crew'], linked_contractor_id: '7fbe6b6f55944f45' })
const zzTest = user({ full_name: 'ZZ Test Crew', email: 'zz@example.com', roles: ['crew'], is_active: false })
const krista = user({ full_name: 'Krista Petrock', email: 'krista@hshcontractor.com', roles: ['office_gc'] })
const tess = user({ full_name: 'Tess Emerson', email: 'tess@kibbeconsulting.com', roles: ['office_gc'] })
const mark = user({ full_name: 'Mark', email: 'mark@hshdrywall.com', roles: ['owner'] })

describe('usersMissingContact', () => {
  const contacts = [{ email: 'Mark@HSHdrywall.com ' }]
  const missing = usersMissingContact([david, contractor, zzTest, krista, tess, mark], contacts)

  it('names only the logins with no record anywhere', () => {
    expect(missing.map((u) => u.full_name)).toEqual(['Krista Petrock', 'Tess Emerson'])
  })

  it('leaves out crew on the HR roster, as employee or 1099', () => {
    expect(missing).not.toContain(david)
    expect(missing).not.toContain(contractor)
  })

  it('leaves out inactive accounts', () => {
    const inactiveOffice = user({ email: 'gone@example.com', roles: ['office_gc'], is_active: false })
    expect(usersMissingContact([inactiveOffice], [])).toEqual([])
  })

  it('still matches a directory contact by email, ignoring case and spaces', () => {
    expect(missing).not.toContain(mark)
  })

  it('a blank link is not a link', () => {
    expect(isOnHrRoster(user({ linked_employee_id: '  ', hr_person_id: '' }))).toBe(false)
    expect(isOnHrRoster(user({ hr_person_id: 'p1' }))).toBe(true)
  })
})
