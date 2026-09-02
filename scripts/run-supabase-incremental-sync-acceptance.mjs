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
const rows = JSON.parse(
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
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ),
)
const anon = rows.find((row) => row.name === 'anon' && row.type === 'legacy')
const service = rows.find(
  (row) => row.name === 'service_role' && row.type === 'legacy',
)
assert.ok(anon?.api_key && service?.api_key, 'Supabase keys unavailable')

const url = `https://${projectRef}.supabase.co`
const options = {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input, init = {}) =>
      fetch(input, { ...init, signal: AbortSignal.timeout(45_000) }),
  },
}
const admin = createClient(url, service.api_key, options)
let passed = 0
let failed = 0
let userId

function success(result, label) {
  assert.equal(result.error, null, `${label}: ${result.error?.message}`)
  return result.data
}

async function check(name, action) {
  try {
    await action()
    passed += 1
    console.log(`ok ${passed + failed} - ${name}`)
  } catch (error) {
    failed += 1
    console.log(`not ok ${passed + failed} - ${name}`)
    console.log(
      `  reason: ${error instanceof Error ? error.message : 'failed'}`,
    )
  }
}

const now = () => new Date().toISOString()
const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))
const shared = (id, overrides = {}) => ({
  id,
  userId,
  version: 1,
  createdAt: now(),
  updatedAt: now(),
  deletedAt: null,
  ...overrides,
})
const task = (id, title, overrides = {}) => ({
  ...shared(id),
  title,
  notes: null,
  status: 'todo',
  priority: 'P2',
  plannedDate: '2026-08-31',
  dueAt: null,
  projectId: null,
  focusDate: null,
  focusOrder: null,
  completedAt: null,
  ...overrides,
})
const waiting = (id, overrides = {}) => ({
  ...shared(id),
  title: 'Waiting 跨设备',
  notes: null,
  status: 'waiting',
  person: 'Alex',
  projectId: null,
  sourceTaskId: null,
  sentAt: now(),
  followUpDate: '2026-09-01',
  confirmedAt: null,
  closedAt: null,
  ...overrides,
})
const memo = (id, content, overrides = {}) => ({
  ...shared(id),
  content,
  pinned: false,
  projectId: null,
  ...overrides,
})
const routine = (id) => ({
  ...shared(id),
  title: 'Daily review',
  status: 'active',
  schedule: { frequency: 'daily' },
  timezone: 'Asia/Shanghai',
  sortOrder: 1,
})
const routineLog = (id, routineId) => ({
  ...shared(id),
  routineId,
  date: '2026-08-31',
  completedAt: now(),
})
const activity = (id, entityId, eventType, entityType = 'task') => ({
  ...shared(id),
  eventType,
  entityType,
  entityId,
  payload: { title: 'Acceptance activity', entityId },
  deviceId: deviceA.id,
  occurredAt: now(),
})
const dailyLog = (id) => ({
  ...shared(id),
  date: '2026-08-31',
  finalizeTimezone: 'Asia/Shanghai',
  summary: 'Stable 原始总结',
  snapshot: {
    completedTasks: [{ id: randomUUID(), title: 'Done snapshot' }],
    openTasks: [],
    waiting: [],
    routines: [],
    memo: null,
  },
  finalizedAt: now(),
})

function change(entityType, entitySnapshot, operation = 'create', base = null) {
  return {
    sequence: 1,
    entityType,
    entityId: entitySnapshot.id,
    operation,
    baseServerRevision: base,
    baseLocalVersion: Math.max(0, entitySnapshot.version - 1),
    resultingLocalVersion: entitySnapshot.version,
    predecessorMutationId: null,
    entitySnapshot,
  }
}

class Device {
  constructor(label) {
    this.label = label
    this.id = randomUUID()
    this.cursor = 0
    this.commitOrder = 0
    this.entities = new Map()
    this.revisions = new Map()
    this.outbox = []
    this.quarantine = []
  }

  queue(changes, mutationId = randomUUID()) {
    const record = {
      mutationId,
      deviceId: this.id,
      userId,
      occurredAt: now(),
      commitOrder: ++this.commitOrder,
      changes,
    }
    this.outbox.push(record)
    return record
  }

  async push(record = this.outbox[0]) {
    let result
    for (let attempt = 0; attempt < 3; attempt += 1) {
      result = await client.rpc('apply_sync_mutation_v1', {
        p_request: record,
      })
      if (!result.error) break
      const message = `${result.error.message} ${result.error.details ?? ''}`
      if (!/fetch|timeout|ECONNRESET|aborted|5\d\d/i.test(message)) break
      const known = await client.rpc('query_sync_mutation_result_v1', {
        p_mutation_id: record.mutationId,
      })
      if (!known.error && known.data) {
        result = { data: known.data, error: null }
        break
      }
      await wait(300 * (attempt + 1))
    }
    assert.ok(result, 'mutation request did not produce a result')
    if (result.error) {
      this.outbox = this.outbox.filter(
        (item) => item.mutationId !== record.mutationId,
      )
      this.quarantine.push(record.mutationId)
      return result
    }
    for (const ack of result.data.entityResults) {
      const key = `${ack.entityType}:${ack.entityId}`
      this.revisions.set(key, Number(ack.serverRevision))
      for (const later of this.outbox) {
        if (later.mutationId === record.mutationId) continue
        for (const item of later.changes) {
          if (`${item.entityType}:${item.entityId}` === key) {
            item.baseServerRevision = Number(ack.serverRevision)
          }
        }
      }
    }
    this.outbox = this.outbox.filter(
      (item) => item.mutationId !== record.mutationId,
    )
    return result
  }

  async pull(limit = 2) {
    for (;;) {
      const page = success(
        await client.rpc('pull_sync_changes_v1', {
          p_after_revision: this.cursor,
          p_limit: limit,
        }),
        `${this.label} pull`,
      )
      for (const item of page.changes) {
        const key = `${item.entity_type}:${item.entity_id}`
        this.entities.set(key, structuredClone(item.record))
        this.revisions.set(key, Number(item.server_revision))
        this.cursor = Number(item.server_revision)
      }
      if (this.cursor >= Number(page.highWatermark)) return
    }
  }
}

let client
let deviceA
let deviceB

try {
  const email = `phase34-${randomUUID()}@example.com`
  const password = `T-${randomUUID()}-a9!`
  const created = success(
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    }),
    'create acceptance user',
  )
  userId = created.user.id
  client = createClient(url, anon.api_key, options)
  success(
    await client.auth.signInWithPassword({ email, password }),
    'sign in acceptance user',
  )
  deviceA = new Device('device A')
  deviceB = new Device('device B')

  const taskId = randomUUID()
  let taskVersion = 1
  await check(
    'A creates Task, pushes it, and B incrementally pulls it',
    async () => {
      const snapshot = task(taskId, 'A → B Task')
      const mutation = deviceA.queue([change('task', snapshot)])
      success(await deviceA.push(mutation), 'push task create')
      await deviceB.pull(1)
      assert.equal(deviceB.entities.get(`task:${taskId}`).title, 'A → B Task')
    },
  )

  await check(
    'B focuses Task and A receives the unique Focus slot',
    async () => {
      const base = deviceB.revisions.get(`task:${taskId}`)
      taskVersion += 1
      const snapshot = task(taskId, 'A → B Task', {
        focusDate: '2026-09-02',
        focusOrder: 1,
        version: taskVersion,
      })
      success(
        await deviceB.push(
          deviceB.queue([change('task', snapshot, 'update', base)]),
        ),
        'push task focus',
      )
      await deviceA.pull()
      assert.equal(deviceA.entities.get(`task:${taskId}`).focus_order, 1)
    },
  )

  await check('A completes Task and B receives the new revision', async () => {
    const base = deviceA.revisions.get(`task:${taskId}`)
    taskVersion += 1
    const snapshot = task(taskId, 'A → B Task', {
      status: 'done',
      completedAt: now(),
      focusDate: null,
      focusOrder: null,
      version: taskVersion,
    })
    success(
      await deviceA.push(
        deviceA.queue([change('task', snapshot, 'update', base)]),
      ),
      'push task complete',
    )
    await deviceB.pull()
    assert.equal(deviceB.entities.get(`task:${taskId}`).status, 'done')
  })

  await check(
    'B reopens Task and A converges without a duplicate',
    async () => {
      const base = deviceB.revisions.get(`task:${taskId}`)
      taskVersion += 1
      const snapshot = task(taskId, 'A → B Task', {
        status: 'todo',
        completedAt: null,
        version: taskVersion,
      })
      success(
        await deviceB.push(
          deviceB.queue([change('task', snapshot, 'update', base)]),
        ),
        'push task reopen',
      )
      await deviceA.pull()
      assert.equal(deviceA.entities.get(`task:${taskId}`).status, 'todo')
    },
  )

  await check(
    'Waiting and edited Memo propagate in both directions',
    async () => {
      const waitingId = randomUUID()
      const memoId = randomUUID()
      success(
        await deviceA.push(
          deviceA.queue([
            change('waiting', waiting(waitingId)),
            change('memo', memo(memoId, 'Memo v1')),
          ]),
        ),
        'push waiting and memo',
      )
      await deviceB.pull(1)
      assert.equal(
        deviceB.entities.get(`waiting:${waitingId}`).title,
        'Waiting 跨设备',
      )
      const waitingBase = deviceB.revisions.get(`waiting:${waitingId}`)
      success(
        await deviceB.push(
          deviceB.queue([
            change(
              'waiting',
              waiting(waitingId, {
                status: 'confirmed',
                confirmedAt: now(),
                version: 2,
              }),
              'update',
              waitingBase,
            ),
          ]),
        ),
        'confirm waiting',
      )
      await deviceA.pull()
      assert.equal(
        deviceA.entities.get(`waiting:${waitingId}`).status,
        'confirmed',
      )

      const pinBase = deviceA.revisions.get(`memo:${memoId}`)
      success(
        await deviceA.push(
          deviceA.queue([
            change(
              'memo',
              memo(memoId, 'Memo v1', { pinned: true, version: 2 }),
              'update',
              pinBase,
            ),
          ]),
        ),
        'pin memo',
      )
      await deviceB.pull()
      const base = deviceB.revisions.get(`memo:${memoId}`)
      success(
        await deviceB.push(
          deviceB.queue([
            change(
              'memo',
              memo(memoId, 'Memo v2 from B', {
                pinned: true,
                version: 3,
              }),
              'update',
              base,
            ),
          ]),
        ),
        'push memo edit',
      )
      await deviceA.pull()
      assert.equal(
        deviceA.entities.get(`memo:${memoId}`).content,
        'Memo v2 from B',
      )
    },
  )

  await check(
    'Routine check-in reaches both devices exactly once',
    async () => {
      const routineId = randomUUID()
      const logId = randomUUID()
      const completed = routineLog(logId, routineId)
      success(
        await deviceA.push(
          deviceA.queue([
            change('routine', routine(routineId)),
            change('routine_log', completed),
          ]),
        ),
        'push routine check-in',
      )
      await deviceB.pull()
      assert.equal(
        deviceB.entities.get(`routine_log:${logId}`).routine_id,
        routineId,
      )
      const base = deviceB.revisions.get(`routine_log:${logId}`)
      const undone = {
        ...completed,
        version: 2,
        updatedAt: now(),
        deletedAt: now(),
      }
      success(
        await deviceB.push(
          deviceB.queue([change('routine_log', undone, 'delete', base)]),
        ),
        'undo routine check-in',
      )
      await deviceA.pull()
      assert.ok(deviceA.entities.get(`routine_log:${logId}`).deleted_at)
    },
  )

  let logId
  await check(
    'End Day multi-entity mutation is atomic and snapshot-stable',
    async () => {
      logId = randomUUID()
      const activityId = randomUUID()
      const log = dailyLog(logId)
      const event = activity(
        activityId,
        logId,
        'daily_log_finalized',
        'daily_log',
      )
      const request = deviceB.queue([
        change('daily_log', log),
        change('activity', event),
      ])
      const result = success(await deviceB.push(request), 'push End Day')
      assert.equal(result.entityResults.length, 2)
      await deviceA.pull()
      assert.equal(
        deviceA.entities.get(`daily_log:${logId}`).snapshot.completedTasks[0]
          .title,
        'Done snapshot',
      )
      assert.ok(deviceA.entities.has(`activity:${activityId}`))
    },
  )

  await check(
    'Tombstone and idempotent Activity retry do not duplicate history',
    async () => {
      const base = deviceA.revisions.get(`task:${taskId}`)
      const deleted = task(taskId, 'A → B Task', {
        status: 'todo',
        completedAt: null,
        deletedAt: now(),
        version: ++taskVersion,
      })
      success(
        await deviceA.push(
          deviceA.queue([change('task', deleted, 'delete', base)]),
        ),
        'push tombstone',
      )
      await deviceB.pull()
      assert.ok(deviceB.entities.get(`task:${taskId}`).deleted_at)

      const event = activity(randomUUID(), taskId, 'task_completed')
      const request = deviceA.queue([change('activity', event)])
      const first = success(await deviceA.push(request), 'push activity')
      const replay = success(
        await client.rpc('apply_sync_mutation_v1', { p_request: request }),
        'retry activity mutation',
      )
      assert.deepEqual(replay, first)
      await deviceB.pull()
      assert.ok(deviceB.entities.has(`activity:${event.id}`))
    },
  )

  await check(
    'two offline edits keep their immutable order and converge',
    async () => {
      const id = randomUUID()
      const createdTask = task(id, 'Offline base')
      success(
        await deviceA.push(deviceA.queue([change('task', createdTask)])),
        'push offline base',
      )
      await deviceA.pull()
      const base = deviceA.revisions.get(`task:${id}`)
      const first = deviceA.queue([
        change('task', task(id, 'Offline A', { version: 2 }), 'update', base),
      ])
      const second = deviceA.queue([
        change('task', task(id, 'Offline B', { version: 3 }), 'update', base),
      ])
      assert.equal(first.changes[0].entitySnapshot.title, 'Offline A')
      assert.equal(second.changes[0].entitySnapshot.title, 'Offline B')
      success(await deviceA.push(first), 'push offline mutation A')
      assert.ok(second.changes[0].baseServerRevision > base)
      success(await deviceA.push(second), 'push offline mutation B')
      await deviceB.pull()
      assert.equal(deviceB.entities.get(`task:${id}`).title, 'Offline B')
    },
  )

  await check(
    'same-base concurrent edit and DeleteVsUpdate reject the second writer',
    async () => {
      const id = randomUUID()
      success(
        await deviceA.push(
          deviceA.queue([change('task', task(id, 'Conflict base'))]),
        ),
        'push conflict base',
      )
      await Promise.all([deviceA.pull(), deviceB.pull()])
      const base = deviceA.revisions.get(`task:${id}`)
      success(
        await deviceA.push(
          deviceA.queue([
            change(
              'task',
              task(id, 'Writer A', { version: 2 }),
              'update',
              base,
            ),
          ]),
        ),
        'first concurrent writer',
      )
      const stale = await deviceB.push(
        deviceB.queue([
          change('task', task(id, 'Writer B', { version: 2 }), 'update', base),
        ]),
      )
      assert.ok(stale.error)
      assert.match(stale.error.message, /BaseServerRevisionConflict/)

      await deviceB.pull()
      const latest = deviceB.revisions.get(`task:${id}`)
      success(
        await deviceA.push(
          deviceA.queue([
            change(
              'task',
              task(id, 'Deleted A', { deletedAt: now(), version: 3 }),
              'delete',
              latest,
            ),
          ]),
        ),
        'delete winner',
      )
      const updateAfterDelete = await deviceB.push(
        deviceB.queue([
          change(
            'task',
            task(id, 'Updated B', { version: 3 }),
            'update',
            latest,
          ),
        ]),
      )
      assert.ok(updateAfterDelete.error)
    },
  )

  await check(
    'Focus, RoutineLog and DailyLog invariants reject duplicates',
    async () => {
      const focusChanges = [1, 2, 3].map((order) =>
        change(
          'task',
          task(randomUUID(), `Focus ${order}`, {
            focusDate: '2026-08-31',
            focusOrder: order,
          }),
        ),
      )
      success(
        await deviceA.push(deviceA.queue(focusChanges)),
        'push three focus tasks',
      )
      const fourth = await deviceB.push(
        deviceB.queue([
          change(
            'task',
            task(randomUUID(), 'Focus 4', {
              focusDate: '2026-08-31',
              focusOrder: 3,
            }),
          ),
        ]),
      )
      assert.ok(fourth.error)

      const routineId = randomUUID()
      success(
        await deviceA.push(
          deviceA.queue([change('routine', routine(routineId))]),
        ),
        'push duplicate-test routine',
      )
      success(
        await deviceA.push(
          deviceA.queue([
            change('routine_log', routineLog(randomUUID(), routineId)),
          ]),
        ),
        'push first routine log',
      )
      const duplicateLog = await deviceB.push(
        deviceB.queue([
          change('routine_log', routineLog(randomUUID(), routineId)),
        ]),
      )
      assert.ok(duplicateLog.error)

      const duplicateDailyLog = await deviceB.push(
        deviceB.queue([change('daily_log', dailyLog(randomUUID()))]),
      )
      assert.ok(duplicateDailyLog.error)
      assert.ok(logId)
    },
  )

  await check(
    'pull pagination is revision-based and cursors reach the high watermark',
    async () => {
      await Promise.all([deviceA.pull(1), deviceB.pull(1)])
      const inspection = success(
        await client.rpc('inspect_cloud_workspace_v1'),
        'inspect final workspace',
      )
      assert.equal(deviceA.cursor, Number(inspection.highWatermark))
      assert.equal(deviceB.cursor, Number(inspection.highWatermark))
      assert.equal(deviceA.outbox.length, 0)
      assert.equal(deviceB.outbox.length, 0)
      assert.ok(deviceB.quarantine.length > 0)
      const activities = success(
        await client.from('activities').select('id'),
        'read final activities',
      )
      assert.equal(
        new Set(activities.map((row) => row.id)).size,
        activities.length,
      )
    },
  )
} finally {
  if (userId) await admin.auth.admin.deleteUser(userId)
}

console.log(
  `incremental sync acceptance summary: passed=${passed} failed=${failed} skipped=0`,
)
if (failed > 0) process.exitCode = 1
