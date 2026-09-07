import { describe, expect, it } from 'vitest'
import { describePushOutcome } from '@/services/pushService'

describe('describePushOutcome', () => {
  it('stays silent when a push was delivered', () => {
    expect(
      describePushOutcome({ ok: true, recipients: 3, sent: 3, failed: 0, pruned: 0 }),
    ).toBeNull()
  })

  it('stays silent when there was nobody else to notify', () => {
    // Posting in your own lane with no one else on it is normal, not a fault.
    expect(
      describePushOutcome({ ok: true, recipients: 0, sent: 0, failed: 0, pruned: 0 }),
    ).toBeNull()
  })

  it('stays silent when at least one device got it', () => {
    // Partial delivery still means the message reached someone.
    expect(
      describePushOutcome({ ok: true, recipients: 2, sent: 1, failed: 1, pruned: 0 }),
    ).toBeNull()
  })

  it('names the reason when the send never left the building', () => {
    const said = describePushOutcome({ ok: false, reason: 'No authorization header' })
    expect(said?.level).toBe('warning')
    // The reason is the whole point — it is what was missing before.
    expect(said?.message).toContain('No authorization header')
  })

  it('warns when every device failed, and points away from the crew', () => {
    const said = describePushOutcome({
      ok: true,
      recipients: 2,
      sent: 0,
      failed: 2,
      pruned: 0,
    })
    expect(said?.level).toBe('warning')
    expect(said?.message).toContain('config')
  })

  it('tells the sender when recipients exist but none have notifications on', () => {
    const said = describePushOutcome({
      ok: true,
      recipients: 3,
      sent: 0,
      failed: 0,
      pruned: 0,
    })
    expect(said?.level).toBe('info')
    expect(said?.message).toContain('notifications turned on')
  })

  it('treats pruned-only sends as a delivery failure worth reporting', () => {
    // Every subscription was dead and got cleaned up — nobody was reached.
    const said = describePushOutcome({
      ok: true,
      recipients: 1,
      sent: 0,
      failed: 0,
      pruned: 1,
    })
    expect(said).not.toBeNull()
    expect(said?.level).toBe('info')
  })
})
