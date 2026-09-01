import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const root = new URL('../', import.meta.url)
const projectRef = readFileSync(
  new URL('supabase/.temp/project-ref', root),
  'utf8',
).trim()
const keys = JSON.parse(
  execFileSync(
    'npx',
    [
      'supabase',
      'projects',
      'api-keys',
      '--project-ref',
      projectRef,
      '--output',
      'json',
    ],
    {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  ),
)
const anon = keys.find((row) => row.name === 'anon' && row.type === 'legacy')
const service = keys.find(
  (row) => row.name === 'service_role' && row.type === 'legacy',
)
assert.ok(anon?.api_key && service?.api_key)
const url = `https://${projectRef}.supabase.co`
const options = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(url, service.api_key, options)
let owner
let client
let passed = 0
let failed = 0
const device = randomUUID()
const now = () => new Date().toISOString()

function ok(result, label) {
  assert.equal(result.error, null, `${label}: ${result.error?.message}`)
  return result.data
}
async function check(name, action) {
  try {
    await action()
    console.log(`ok ${++passed + failed} - ${name}`)
  } catch (error) {
    console.log(`not ok ${passed + ++failed} - ${name}`)
    console.log(
      `  reason: ${error instanceof Error ? error.message : 'failed'}`,
    )
  }
}
const base = (id, overrides = {}) => ({
  id,
  userId: owner,
  version: 1,
  createdAt: now(),
  updatedAt: now(),
  deletedAt: null,
  ...overrides,
})
const task = (id, title, overrides = {}) => ({
  ...base(id),
  title,
  notes: null,
  status: 'todo',
  priority: 'P2',
  plannedDate: '2026-09-01',
  dueAt: null,
  projectId: null,
  focusDate: null,
  focusOrder: null,
  completedAt: null,
  ...overrides,
})
const routine = (id) => ({
  ...base(id),
  title: 'Resolve routine',
  status: 'active',
  schedule: { frequency: 'daily' },
  timezone: 'Asia/Shanghai',
  sortOrder: 1,
})
const routineLog = (id, routineId, overrides = {}) => ({
  ...base(id),
  routineId,
  date: '2026-09-01',
  completedAt: now(),
  ...overrides,
})
const dailyLog = (id, summary) => ({
  ...base(id),
  date: '2026-09-01',
  finalizeTimezone: 'Asia/Shanghai',
  summary,
  finalizedAt: now(),
  snapshot: {
    completedTasks: [],
    openTasks: [],
    waiting: [],
    memos: [],
    routines: [],
  },
})
const change = (type, entity, operation = 'create', revision = null) => ({
  sequence: 1,
  entityType: type,
  entityId: entity.id,
  operation,
  baseServerRevision: revision,
  baseLocalVersion: Math.max(0, entity.version - 1),
  resultingLocalVersion: entity.version,
  predecessorMutationId: null,
  entitySnapshot: entity,
})
async function mutate(changes, mutationId = randomUUID()) {
  return client.rpc('apply_sync_mutation_v1', {
    p_request: {
      mutationId,
      deviceId: device,
      userId: owner,
      occurredAt: now(),
      commitOrder: 1,
      changes: changes.map((item, index) => ({ ...item, sequence: index + 1 })),
    },
  })
}

try {
  const email = `phase35-conflict-${randomUUID()}@example.com`
  const password = `T-${randomUUID()}-a9!`
  const created = ok(
    await admin.auth.admin.createUser({ email, password, email_confirm: true }),
    'create user',
  )
  owner = created.user.id
  client = createClient(url, anon.api_key, options)
  ok(await client.auth.signInWithPassword({ email, password }), 'sign in')

  await check(
    'SameBase keep-mine rebases on the latest server revision',
    async () => {
      const id = randomUUID()
      const createdAck = ok(
        await mutate([change('task', task(id, 'Base'))]),
        'create task',
      )
      const revision = Number(createdAck.entityResults[0].serverRevision)
      const winner = ok(
        await mutate([
          change(
            'task',
            task(id, 'Remote', { version: 2 }),
            'update',
            revision,
          ),
        ]),
        'winner',
      )
      const stale = await mutate([
        change('task', task(id, 'Stale', { version: 2 }), 'update', revision),
      ])
      assert.ok(stale.error)
      const latest = Number(winner.entityResults[0].serverRevision)
      const replacement = ok(
        await mutate([
          change(
            'task',
            task(id, 'Keep mine', { version: 3 }),
            'update',
            latest,
          ),
        ]),
        'replacement',
      )
      assert.ok(Number(replacement.entityResults[0].serverRevision) > latest)
    },
  )

  await check(
    'DeleteVsUpdate keep-deleted uses a fresh explicit mutation',
    async () => {
      const id = randomUUID()
      const createdAck = ok(
        await mutate([change('task', task(id, 'Delete base'))]),
        'create delete base',
      )
      const revision = Number(createdAck.entityResults[0].serverRevision)
      const updated = ok(
        await mutate([
          change(
            'task',
            task(id, 'Remote edit', { version: 2 }),
            'update',
            revision,
          ),
        ]),
        'remote edit',
      )
      const latest = Number(updated.entityResults[0].serverRevision)
      const tombstone = task(id, 'Remote edit', {
        version: 3,
        deletedAt: now(),
      })
      ok(
        await mutate([change('task', tombstone, 'delete', latest)]),
        'keep deleted',
      )
    },
  )

  await check('Focus repair submits one legal ordered mutation', async () => {
    const entries = [1, 2, 3].map((order) =>
      task(randomUUID(), `Focus ${order}`, {
        focusDate: '2026-09-01',
        focusOrder: order,
      }),
    )
    const ack = ok(
      await mutate(entries.map((entry) => change('task', entry))),
      'three focus',
    )
    const removed = {
      ...entries[0],
      version: 2,
      updatedAt: now(),
      focusDate: null,
      focusOrder: null,
    }
    const added = task(randomUUID(), 'Chosen focus', {
      focusDate: '2026-09-01',
      focusOrder: 1,
    })
    ok(
      await mutate([
        change(
          'task',
          removed,
          'update',
          Number(ack.entityResults[0].serverRevision),
        ),
        change('task', added),
      ]),
      'focus repair',
    )
  })

  await check('RoutineLog resolution leaves one active record', async () => {
    const routineId = randomUUID()
    ok(await mutate([change('routine', routine(routineId))]), 'create routine')
    const first = routineLog(randomUUID(), routineId)
    const ack = ok(
      await mutate([change('routine_log', first)]),
      'first routine log',
    )
    const deleted = { ...first, version: 2, updatedAt: now(), deletedAt: now() }
    const chosen = routineLog(randomUUID(), routineId)
    ok(
      await mutate([
        change(
          'routine_log',
          deleted,
          'delete',
          Number(ack.entityResults[0].serverRevision),
        ),
        change('routine_log', chosen),
      ]),
      'routine log choice',
    )
    const rows = ok(
      await client.from('routine_logs').select('id').is('deleted_at', null),
      'read routine logs',
    )
    assert.equal(rows.length, 1)
  })

  await check(
    'DailyLog official snapshot RPC is idempotent and audited',
    async () => {
      const first = dailyLog(randomUUID(), 'Remote official')
      ok(await mutate([change('daily_log', first)]), 'first daily log')
      const candidate = dailyLog(randomUUID(), 'Local chosen official')
      const resolutionId = randomUUID()
      const request = { resolutionId, deviceId: device, candidate }
      const accepted = ok(
        await client.rpc('resolve_daily_log_conflict_v1', {
          p_request: request,
        }),
        'resolve daily log',
      )
      const replay = ok(
        await client.rpc('resolve_daily_log_conflict_v1', {
          p_request: request,
        }),
        'replay daily resolution',
      )
      assert.deepEqual(replay, accepted)
      const active = ok(
        await client
          .from('daily_logs')
          .select('id,summary')
          .is('deleted_at', null),
        'read daily log',
      )
      assert.deepEqual(active, [
        { id: candidate.id, summary: candidate.summary },
      ])
      const receipts = ok(
        await client.from('sync_conflict_resolutions').select('resolution_id'),
        'read resolution receipt',
      )
      assert.equal(receipts.length, 1)
    },
  )
} finally {
  if (owner) await admin.auth.admin.deleteUser(owner)
}

console.log(
  `conflict resolution acceptance summary: passed=${passed} failed=${failed} skipped=0`,
)
if (failed > 0) process.exitCode = 1
