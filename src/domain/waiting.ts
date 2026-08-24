import type { Waiting, WaitingStatus } from './entities'
import type { EntityId, Instant, LocalDate, UserId } from './shared'
import { waitingTransitions } from './transitions'

export type WaitingRuleErrorCode = 'empty_title' | 'invalid_transition'

export class WaitingRuleError extends Error {
  constructor(public readonly code: WaitingRuleErrorCode) {
    super(code)
    this.name = 'WaitingRuleError'
  }
}

export interface CreateWaitingInput {
  userId: UserId
  title: string
  person?: string | null
  notes?: string | null
  projectId?: EntityId | null
  sourceTaskId?: EntityId | null
  followUpDate?: LocalDate | null
}

export type EditWaitingInput = Partial<
  Pick<
    Waiting,
    'title' | 'person' | 'notes' | 'projectId' | 'sourceTaskId' | 'followUpDate'
  >
>

interface CreateWaitingContext {
  id: EntityId
  now: Instant
}

function normalizeOptionalText(value: string | null | undefined) {
  return value?.trim() || null
}

function changed(
  waiting: Waiting,
  now: Instant,
  fields: Partial<Waiting>,
): Waiting {
  return {
    ...waiting,
    ...fields,
    updatedAt: now,
    version: waiting.version + 1,
  }
}

export function createWaiting(
  input: CreateWaitingInput,
  context: CreateWaitingContext,
): Waiting {
  const title = input.title.trim()
  if (!title) throw new WaitingRuleError('empty_title')

  return {
    id: context.id,
    userId: input.userId,
    title,
    person: normalizeOptionalText(input.person),
    notes: normalizeOptionalText(input.notes),
    status: 'waiting',
    projectId: input.projectId ?? null,
    sourceTaskId: input.sourceTaskId ?? null,
    sentAt: context.now,
    followUpDate: input.followUpDate ?? null,
    confirmedAt: null,
    closedAt: null,
    createdAt: context.now,
    updatedAt: context.now,
    deletedAt: null,
    version: 1,
  }
}

export function editWaiting(
  waiting: Waiting,
  input: EditWaitingInput,
  now: Instant,
): Waiting {
  const fields: Partial<Waiting> = {}
  if ('title' in input) {
    const title = input.title?.trim()
    if (!title) throw new WaitingRuleError('empty_title')
    fields.title = title
  }
  if ('person' in input) fields.person = normalizeOptionalText(input.person)
  if ('notes' in input) fields.notes = normalizeOptionalText(input.notes)
  if ('projectId' in input) fields.projectId = input.projectId ?? null
  if ('sourceTaskId' in input) fields.sourceTaskId = input.sourceTaskId ?? null
  if ('followUpDate' in input) fields.followUpDate = input.followUpDate ?? null
  return changed(waiting, now, fields)
}

export function transitionWaiting(
  waiting: Waiting,
  nextStatus: WaitingStatus,
  now: Instant,
): Waiting {
  const allowed = waitingTransitions[waiting.status] as readonly WaitingStatus[]
  if (!allowed.includes(nextStatus)) {
    throw new WaitingRuleError('invalid_transition')
  }

  return changed(waiting, now, {
    status: nextStatus,
    confirmedAt:
      nextStatus === 'confirmed'
        ? now
        : nextStatus === 'waiting'
          ? null
          : waiting.confirmedAt,
    closedAt:
      nextStatus === 'closed'
        ? now
        : nextStatus === 'waiting'
          ? null
          : waiting.closedAt,
  })
}

export function confirmWaiting(waiting: Waiting, now: Instant): Waiting {
  return transitionWaiting(waiting, 'confirmed', now)
}

export function closeWaiting(waiting: Waiting, now: Instant): Waiting {
  return transitionWaiting(waiting, 'closed', now)
}

export function reopenWaiting(waiting: Waiting, now: Instant): Waiting {
  return transitionWaiting(waiting, 'waiting', now)
}

export function setWaitingFollowUpDate(
  waiting: Waiting,
  followUpDate: LocalDate | null,
  now: Instant,
): Waiting {
  return editWaiting(waiting, { followUpDate }, now)
}

export function deriveNeedsFollowUp(
  waiting: Pick<Waiting, 'status' | 'followUpDate'>,
  today: LocalDate,
): boolean {
  return (
    waiting.status === 'waiting' &&
    waiting.followUpDate !== null &&
    waiting.followUpDate <= today
  )
}
