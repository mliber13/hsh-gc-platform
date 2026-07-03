import { describe, expect, it } from 'vitest'
import { qbJobNameFromCustomerName } from '@/services/drywallQbRevenueService'

describe('qbJobNameFromCustomerName', () => {
  it('uses segment after last colon for Customer:Job names', () => {
    expect(qbJobNameFromCustomerName('Miller Homes: Lakemore - Irwin')).toBe('Lakemore - Irwin')
  })

  it('returns whole string when no colon', () => {
    expect(qbJobNameFromCustomerName('Aurora - Buzzy')).toBe('Aurora - Buzzy')
  })

  it('trims whitespace', () => {
    expect(qbJobNameFromCustomerName('  Builder Co :  Job Name  ')).toBe('Job Name')
  })
})
