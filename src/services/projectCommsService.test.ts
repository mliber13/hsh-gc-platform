import { describe, expect, it } from 'vitest'
import {
  groupIntoLanes,
  laneKeyOf,
  type ProjectCommsMessage,
} from '@/services/projectCommsService'

function msg(over: Partial<ProjectCommsMessage>): ProjectCommsMessage {
  return {
    id: 'm1',
    projectId: 'p1',
    at: '2026-09-01T12:00:00.000Z',
    authorUserId: 'u1',
    authorPersonId: null,
    author: 'Someone',
    authorRole: 'operator',
    audience: 'office',
    audiencePersonId: null,
    body: 'hello',
    ...over,
  }
}

describe('laneKeyOf', () => {
  it('keys office and job lanes by audience alone', () => {
    expect(laneKeyOf(msg({ audience: 'office' }))).toBe('office')
    expect(laneKeyOf(msg({ audience: 'job' }))).toBe('job')
  })

  it('keys a crew lane by the person it belongs to', () => {
    expect(laneKeyOf(msg({ audience: 'crew', audiencePersonId: 'emp-7' }))).toBe('crew:emp-7')
  })

  it('never collapses two crew members into one lane', () => {
    const hanger = msg({ id: 'a', audience: 'crew', audiencePersonId: 'emp-hanger' })
    const cleanout = msg({ id: 'b', audience: 'crew', audiencePersonId: 'emp-cleanout' })
    expect(laneKeyOf(hanger)).not.toBe(laneKeyOf(cleanout))
  })
})

describe('groupIntoLanes', () => {
  const hangerMsg = msg({
    id: 'a',
    at: '2026-09-01T09:00:00.000Z',
    author: 'Hank Hanger',
    authorRole: 'crew',
    audience: 'crew',
    audiencePersonId: 'emp-hanger',
    body: 'need more board',
  })
  const cleanoutMsg = msg({
    id: 'b',
    at: '2026-09-01T11:00:00.000Z',
    author: 'Carl Cleanout',
    authorRole: 'crew',
    audience: 'crew',
    audiencePersonId: 'emp-cleanout',
    body: 'dumpster full',
  })
  const jobMsg = msg({
    id: 'c',
    at: '2026-09-01T10:00:00.000Z',
    author: 'Office',
    audience: 'job',
    body: 'gate code 1234',
  })
  const officeMsg = msg({
    id: 'd',
    at: '2026-09-01T08:00:00.000Z',
    author: 'Office',
    audience: 'office',
    body: 'customer is slow to pay',
  })

  it('separates each crew member into their own lane', () => {
    const lanes = groupIntoLanes([hangerMsg, cleanoutMsg, jobMsg, officeMsg])
    const crewLanes = lanes.filter((l) => l.audience === 'crew')
    expect(crewLanes).toHaveLength(2)
    for (const lane of crewLanes) {
      expect(lane.messages).toHaveLength(1)
    }
    // The cleanout guy's lane must not contain the hanger's message.
    const cleanoutLane = lanes.find((l) => l.personId === 'emp-cleanout')
    expect(cleanoutLane?.messages.map((m) => m.body)).toEqual(['dumpster full'])
  })

  it('labels crew lanes from the roster when available', () => {
    const lanes = groupIntoLanes([hangerMsg], (id) =>
      id === 'emp-hanger' ? 'Hank H.' : undefined,
    )
    expect(lanes[0]?.label).toBe('Hank H.')
  })

  it('falls back to the crew author name when the roster has no match', () => {
    const lanes = groupIntoLanes([hangerMsg])
    expect(lanes[0]?.label).toBe('Hank Hanger')
  })

  it('orders crew lanes first, then job-wide, then office', () => {
    const lanes = groupIntoLanes([officeMsg, jobMsg, hangerMsg, cleanoutMsg])
    expect(lanes.map((l) => l.audience)).toEqual(['crew', 'crew', 'job', 'office'])
  })

  it('sorts crew lanes by most recent activity', () => {
    const lanes = groupIntoLanes([hangerMsg, cleanoutMsg])
    // Cleanout posted at 11:00, hanger at 09:00.
    expect(lanes[0]?.personId).toBe('emp-cleanout')
    expect(lanes[0]?.lastAt).toBe('2026-09-01T11:00:00.000Z')
  })

  it('tracks the newest timestamp per lane across several messages', () => {
    const older = msg({
      id: 'e',
      at: '2026-09-01T07:00:00.000Z',
      audience: 'crew',
      audiencePersonId: 'emp-hanger',
      authorRole: 'crew',
      author: 'Hank Hanger',
    })
    const lanes = groupIntoLanes([older, hangerMsg])
    expect(lanes).toHaveLength(1)
    expect(lanes[0]?.messages).toHaveLength(2)
    expect(lanes[0]?.lastAt).toBe('2026-09-01T09:00:00.000Z')
  })

  it('returns no lanes for an empty log', () => {
    expect(groupIntoLanes([])).toEqual([])
  })
})
