import { describe, expect, it } from 'vitest'
import {
  buildCascadePreview,
  detectPredecessorConflict,
  predictCascadeStartForEdit,
  toRpcBatch,
} from './foremanScheduleEdit'
import type { DrywallProjectScheduleItem } from '@/services/scheduleService'

function item(
  partial: Partial<DrywallProjectScheduleItem> & Pick<DrywallProjectScheduleItem, 'id' | 'name'>,
): DrywallProjectScheduleItem {
  return {
    project_id: 'proj-1',
    schedule_id: 'sched-1',
    type: 'field',
    start_date: '2026-07-20',
    end_date: '2026-07-20',
    duration: 1,
    status: 'not-started',
    notes: null,
    assigned_persons: [],
    show_job_info_person_ids: [],
    assigned_company_id: null,
    predecessor_ids: [],
    lag_work_days: 0,
    tasks: [],
    lead_person_ids: [],
    supplier_id: null,
    ...partial,
  }
}

describe('foremanScheduleEdit', () => {
  it('cascades a dependent when predecessor start moves later (parallel-zero lag 0)', () => {
    const siblings = [
      item({ id: 'a', name: 'Stock', start_date: '2026-07-20', end_date: '2026-07-20' }),
      item({
        id: 'b',
        name: 'Hang',
        start_date: '2026-07-20',
        end_date: '2026-07-21',
        duration: 2,
        predecessor_ids: ['a'],
        lag_work_days: 0,
      }),
    ]

    const preview = buildCascadePreview(siblings, 'a', {
      startDate: '2026-07-22',
      endDate: '2026-07-22',
      status: 'not-started',
      assignedPersons: [],
    })

    expect(preview.conflict).toBeNull()
    const hang = preview.items.find((i) => i.id === 'b')
    expect(hang?.start_date).toBe('2026-07-22')
    expect(preview.changes.some((c) => c.itemId === 'b')).toBe(true)
  })

  it('detects predecessor conflict when user start differs from cascade prediction', () => {
    const siblings = [
      item({ id: 'a', name: 'Stock', start_date: '2026-07-20', end_date: '2026-07-20' }),
      item({
        id: 'b',
        name: 'Hang',
        start_date: '2026-07-20',
        end_date: '2026-07-20',
        predecessor_ids: ['a'],
        lag_work_days: 0,
      }),
    ]

    const conflict = detectPredecessorConflict(siblings, 'b', {
      startDate: '2026-07-24',
      endDate: '2026-07-24',
      status: 'not-started',
      assignedPersons: [],
    })

    expect(conflict).not.toBeNull()
    expect(conflict?.predictedStart).toBe(
      predictCascadeStartForEdit(
        siblings,
        'b',
        {
          startDate: '2026-07-24',
          endDate: '2026-07-24',
          status: 'not-started',
          assignedPersons: [],
        },
        ['a'],
        0,
      ),
    )
    expect(conflict?.predecessor?.id).toBe('a')
  })

  it('detach clears predecessors then cascades without conflict', () => {
    const siblings = [
      item({ id: 'a', name: 'Stock', start_date: '2026-07-20', end_date: '2026-07-20' }),
      item({
        id: 'b',
        name: 'Hang',
        start_date: '2026-07-20',
        end_date: '2026-07-20',
        predecessor_ids: ['a'],
        lag_work_days: 0,
      }),
    ]

    const preview = buildCascadePreview(
      siblings,
      'b',
      {
        startDate: '2026-07-24',
        endDate: '2026-07-24',
        status: 'not-started',
        assignedPersons: ['person-1'],
      },
      { resolveConflict: 'detach' },
    )

    expect(preview.conflict).toBeNull()
    const hang = preview.items.find((i) => i.id === 'b')
    expect(hang?.start_date).toBe('2026-07-24')
    expect(hang?.predecessor_ids).toEqual([])
    expect(hang?.assigned_persons).toEqual(['person-1'])
  })

  it('toRpcBatch includes fields the foreman RPC writes', () => {
    const batch = toRpcBatch([
      item({
        id: 'a',
        name: 'Stock',
        assigned_persons: ['p1'],
        predecessor_ids: [],
      }),
    ])
    expect(batch[0]).toMatchObject({
      id: 'a',
      start_date: '2026-07-20',
      end_date: '2026-07-20',
      status: 'not-started',
      assigned_persons: ['p1'],
    })
  })
})
