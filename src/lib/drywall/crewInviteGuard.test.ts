/**
 * The predicate behind consume_crew_invite_token's "already has app access" guard.
 *
 * Batch 1A wrote it as "holds any role that is not crew". profiles.roles defaults
 * to {viewer}, and handle_new_user does not name roles on insert — so every brand
 * new account arrived holding {viewer}, tripped the guard, and could not sign up.
 * Every crew signup was blocked from 2026-09-10 until 2026-09-14.
 *
 * This mirrors the SQL in 20260914130000. It is a unit test of the rule, not of
 * the function — but the rule is the part that was wrong.
 */
import { describe, expect, it } from 'vitest'

const OPERATOR_ROLES = ['owner', 'office_gc', 'office_drywall', 'field_gc', 'field_drywall']

/** `p.roles && ARRAY[...]` — true when the arrays overlap. */
function alreadyHasAppAccess(roles: string[]): boolean {
  return roles.some((r) => OPERATOR_ROLES.includes(r))
}

/** What 1A shipped. Kept so the regression stays legible. */
function oldPredicate(roles: string[]): boolean {
  return roles.some((r) => r !== 'crew')
}

describe('crew invite guard', () => {
  it('lets a brand-new signup through', () => {
    // handle_new_user inserts without naming roles, so the column default applies.
    expect(alreadyHasAppAccess(['viewer'])).toBe(false)
  })

  it('is the case the old predicate got wrong', () => {
    expect(oldPredicate(['viewer'])).toBe(true) // blocked every signup
    expect(alreadyHasAppAccess(['viewer'])).toBe(false)
  })

  it('still refuses to demote a real operator', () => {
    for (const role of OPERATOR_ROLES) {
      expect(alreadyHasAppAccess([role])).toBe(true)
    }
    expect(alreadyHasAppAccess(['viewer', 'office_drywall'])).toBe(true)
  })

  it('lets an existing crew account re-consume', () => {
    expect(alreadyHasAppAccess(['crew'])).toBe(false)
  })

  it('handles an empty roles array', () => {
    expect(alreadyHasAppAccess([])).toBe(false)
  })
})
