import { describe, expect, it } from 'vitest'
import {
  projectTransitions,
  routineTransitions,
  taskTransitions,
  waitingTransitions,
} from './transitions'

describe('domain state transition contracts', () => {
  it('keeps follow-up out of the persisted Waiting state machine', () => {
    expect(Object.keys(waitingTransitions)).toEqual([
      'waiting',
      'confirmed',
      'closed',
    ])
    expect(waitingTransitions.waiting).toEqual(['confirmed', 'closed'])
    expect(waitingTransitions.confirmed).not.toContain('confirmed')
  })

  it('defines explicit legal transitions for Task, Routine, and Project', () => {
    expect(taskTransitions.todo).toEqual(['doing', 'done', 'later', 'archived'])
    expect(taskTransitions.done).toEqual(['todo', 'archived'])
    expect(routineTransitions.paused).toEqual(['active', 'archived'])
    expect(projectTransitions.completed).toEqual(['active', 'archived'])
  })
})
