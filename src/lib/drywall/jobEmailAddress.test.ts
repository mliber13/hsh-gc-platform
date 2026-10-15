import { describe, expect, it } from 'vitest'
import { jobEmailAddress, parseJobEmailCode } from './jobEmailAddress'

const id = '5201b055-8a3c-4f15-98e3-f3b133b12e19'

describe('job email address', () => {
  it('reads as the job and carries the start of its id', () => {
    expect(jobEmailAddress(id, 'Moreland Hills - Langenmayr')).toBe(
      'moreland-hills-langenmayr-5201b055@files.hshdrywall.com',
    )
    expect(jobEmailAddress(id, '!!!')).toBe('job-5201b055@files.hshdrywall.com')
  })

  it('round-trips: the receiver finds the job from the address it was sent to', () => {
    expect(parseJobEmailCode(jobEmailAddress(id, '8022 Nicodemus Rd'))).toBe('5201b055')
    // Mail clients change case; the name part can be anything.
    expect(parseJobEmailCode('Whatever-5201B055@Files.HSHDrywall.com')).toBe('5201b055')
  })

  it('refuses addresses that are not a job address', () => {
    expect(parseJobEmailCode('mark@hshdrywall.com')).toBeNull()
    expect(parseJobEmailCode('langenmayr@files.hshdrywall.com')).toBeNull()
    expect(parseJobEmailCode('x-5201b05@files.hshdrywall.com')).toBeNull()
    expect(parseJobEmailCode('x-5201b055@evil.example')).toBeNull()
  })
})
