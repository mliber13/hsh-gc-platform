import { describe, expect, it } from 'vitest'
import { isFieldForeman } from '@/lib/rbac'
import type { UserProfile } from '@/services/userService'

function profile(partial: Partial<UserProfile>): UserProfile {
  return {
    id: 'u1',
    email: 'test@example.com',
    full_name: 'Test',
    organization_id: 'org',
    role: 'viewer',
    roles: ['crew'],
    created_at: '',
    updated_at: '',
    ...partial,
  }
}

describe('isFieldForeman', () => {
  it('is false when flag missing or false', () => {
    expect(isFieldForeman(null)).toBe(false)
    expect(isFieldForeman(profile({}))).toBe(false)
    expect(isFieldForeman(profile({ is_field_foreman: false }))).toBe(false)
  })

  it('reads snake_case and camelCase', () => {
    expect(isFieldForeman(profile({ is_field_foreman: true }))).toBe(true)
    expect(isFieldForeman(profile({ isFieldForeman: true }))).toBe(true)
  })

  it('does not owner-short-circuit (crew-expansion only)', () => {
    expect(
      isFieldForeman(
        profile({
          roles: ['owner'],
          is_field_foreman: false,
        }),
      ),
    ).toBe(false)
  })
})
