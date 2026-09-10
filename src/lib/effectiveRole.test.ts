/**
 * Effective role derivation (P1-SEC-9).
 *
 * The two role systems disagreed: the client read `roles[0]`, while every SQL
 * helper matches with `roles && ARRAY[...]`. So a ['crew','office_drywall']
 * profile was crew in the UI and an operator to every policy. These pin the
 * precedence so the client always lands on the side SQL already takes.
 */
import { describe, expect, it } from 'vitest'
import { deriveEffectiveRole } from './rbac'
import type { UserProfile } from '@/services/userService'

function profile(patch: Partial<UserProfile>): UserProfile {
  return { id: 'u1', email: 'x@y.z', ...patch } as UserProfile
}

describe('deriveEffectiveRole', () => {
  it('returns the single role a profile holds', () => {
    expect(deriveEffectiveRole(profile({ roles: ['owner'] }))).toBe('owner')
    expect(deriveEffectiveRole(profile({ roles: ['crew'] }))).toBe('crew')
    expect(deriveEffectiveRole(profile({ roles: ['office_drywall'] }))).toBe('office_drywall')
  })

  it('takes the highest privilege, not the first listed', () => {
    // The case that motivated the change: SQL treats this as an operator.
    expect(deriveEffectiveRole(profile({ roles: ['crew', 'office_drywall'] }))).toBe(
      'office_drywall',
    )
    // And the same set in the other order must resolve identically.
    expect(deriveEffectiveRole(profile({ roles: ['office_drywall', 'crew'] }))).toBe(
      'office_drywall',
    )
  })

  it('ranks crew above viewer — crew reaches /crew, viewer reaches nothing', () => {
    expect(deriveEffectiveRole(profile({ roles: ['viewer', 'crew'] }))).toBe('crew')
  })

  it('ranks owner above everything', () => {
    expect(
      deriveEffectiveRole(profile({ roles: ['viewer', 'crew', 'field_gc', 'owner'] })),
    ).toBe('owner')
  })

  it('falls back to the legacy role column when roles is empty', () => {
    expect(deriveEffectiveRole(profile({ roles: [], role: 'admin' }))).toBe('owner')
    expect(deriveEffectiveRole(profile({ roles: [], role: 'editor' }))).toBe('office_gc')
    expect(deriveEffectiveRole(profile({ roles: [], role: 'viewer' }))).toBe('viewer')
  })

  it('ignores a role string that is not an rbac role', () => {
    expect(deriveEffectiveRole(profile({ roles: ['nonsense'], role: 'editor' }))).toBe('office_gc')
  })

  it('is viewer for no profile at all', () => {
    expect(deriveEffectiveRole(null)).toBe('viewer')
    expect(deriveEffectiveRole(undefined)).toBe('viewer')
  })
})
