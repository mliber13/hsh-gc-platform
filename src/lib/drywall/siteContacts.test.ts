import { describe, expect, it } from 'vitest'
import { formatSitePhone, isNewSiteContact, matchSiteContacts } from './siteContacts'
import type { Contact } from '@/types/contactDirectory'

const c = (name: string, phone: string | null, role: string | null): Contact =>
  ({ id: name, label: 'SITE_CONTACT', name, phone, role }) as Contact

const list = [
  c('Jeff Head', '440-667-1027', 'Payne and Tompkins'),
  c('Joe Petche', '216-334-5560', 'Payne and Tompkins'),
  c('Chris Sarvey', '614-813-6197', 'Schumacher'),
  c('Hal Greaves', '330-417-6419', 'Schumacher'),
  c('Jon Bussey', '330-806-4216', 'Schumacher'),
]

describe('site contacts', () => {
  it("the job's own company comes first", () => {
    const names = matchSiteContacts(list, '', 'Schumacher Homes').map((x) => x.name)
    expect(names.slice(0, 3)).toEqual(['Chris Sarvey', 'Hal Greaves', 'Jon Bussey'])
  })

  it('typing matches name, company or phone', () => {
    expect(matchSiteContacts(list, 'jo', null).map((x) => x.name)).toEqual(['Joe Petche', 'Jon Bussey'])
    expect(matchSiteContacts(list, 'payne', null)).toHaveLength(2)
    expect(matchSiteContacts(list, '(440) 667', null).map((x) => x.name)).toEqual(['Jeff Head'])
  })

  it('a person already listed — by name or by number — is not added again', () => {
    expect(isNewSiteContact(list, 'jeff head', '')).toBe(false)
    expect(isNewSiteContact(list, 'Jeffrey Head', '4406671027')).toBe(false)
    expect(isNewSiteContact(list, 'Kyle Krebs', '440-552-3776')).toBe(true)
    expect(isNewSiteContact(list, '  ', '440-552-3776')).toBe(false)
  })

  it('numbers read one way', () => {
    expect(formatSitePhone('2163345560')).toBe('216-334-5560')
    expect(formatSitePhone('330*541*8717')).toBe('330-541-8717')
    expect(formatSitePhone('ext 12')).toBe('ext 12')
  })
})
