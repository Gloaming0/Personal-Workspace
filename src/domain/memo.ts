import type { Memo } from './entities'
import type { EntityId, Instant, UserId } from './shared'

export class MemoRuleError extends Error {
  constructor(public readonly code: 'empty_content' | 'deleted') {
    super(code)
    this.name = 'MemoRuleError'
  }
}

export interface CreateMemoInput {
  userId: UserId
  content: string
  pinned?: boolean
  projectId?: EntityId | null
}

export type EditMemoInput = Partial<Pick<Memo, 'content' | 'projectId'>>

interface MemoContext {
  id: EntityId
  now: Instant
}

function updateMemo(memo: Memo, now: Instant, fields: Partial<Memo>): Memo {
  if (memo.deletedAt !== null) throw new MemoRuleError('deleted')
  return { ...memo, ...fields, updatedAt: now, version: memo.version + 1 }
}

export function createMemo(input: CreateMemoInput, context: MemoContext): Memo {
  const content = input.content.trim()
  if (!content) throw new MemoRuleError('empty_content')
  return {
    id: context.id,
    userId: input.userId,
    content,
    pinned: input.pinned ?? false,
    projectId: input.projectId ?? null,
    createdAt: context.now,
    updatedAt: context.now,
    deletedAt: null,
    version: 1,
  }
}

export function editMemo(memo: Memo, input: EditMemoInput, now: Instant): Memo {
  const fields: Partial<Memo> = {}
  if ('content' in input) {
    const content = input.content?.trim()
    if (!content) throw new MemoRuleError('empty_content')
    fields.content = content
  }
  if ('projectId' in input) fields.projectId = input.projectId ?? null
  return updateMemo(memo, now, fields)
}

export function setMemoPinned(memo: Memo, pinned: boolean, now: Instant): Memo {
  return updateMemo(memo, now, { pinned })
}

export function softDeleteMemo(memo: Memo, now: Instant): Memo {
  return updateMemo(memo, now, { deletedAt: now })
}
