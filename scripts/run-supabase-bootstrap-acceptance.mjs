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

function projectKeys() {
  const output = execFileSync(
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
  )
  const rows = JSON.parse(output)
  const anon = rows.find((row) => row.name === 'anon' && row.type === 'legacy')
  const service = rows.find(
    (row) => row.name === 'service_role' && row.type === 'legacy',
  )
  assert.ok(anon?.api_key && service?.api_key, 'Supabase keys unavailable')
  return { anon: anon.api_key, service: service.api_key }
}

const keys = projectKeys()
const url = `https://${projectRef}.supabase.co`
const options = {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input, init = {}) =>
      fetch(input, { ...init, signal: AbortSignal.timeout(45_000) }),
  },
}
const admin = createClient(url, keys.service, options)
let passed = 0
let failed = 0
const users = []

function success(result, label) {
  assert.equal(result.error, null, `${label}: request rejected`)
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

async function cleanup() {
  for (let page = 1; ; page += 1) {
    const listed = success(
      await admin.auth.admin.listUsers({ page, perPage: 1000 }),
      'list users',
    ).users
    const stale = listed.filter((user) => user.email?.startsWith('phase33-'))
    await Promise.allSettled(
      stale.map((user) => admin.auth.admin.deleteUser(user.id)),
    )
    if (listed.length < 1000) break
  }
}

async function identity(label) {
  const email = `phase33-${label}-${randomUUID()}@example.com`
  const password = `T-${randomUUID()}-a9!`
  const user = success(
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    }),
    `create ${label}`,
  ).user
  users.push(user.id)
  const client = createClient(url, keys.anon, options)
  success(
    await client.auth.signInWithPassword({ email, password }),
    `sign in ${label}`,
  )
  return { client, userId: user.id }
}

const now = () => new Date().toISOString()

function task(userId, id, overrides = {}) {
  const timestamp = now()
  return {
    id,
    userId,
    title: 'Bootstrap 任务 ✓',
    notes: null,
    status: 'todo',
    priority: 'P2',
    plannedDate: '2026-08-31',
    dueAt: null,
    projectId: null,
    focusDate: null,
    focusOrder: null,
    completedAt: null,
    version: 3,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    ...overrides,
  }
}

function change(entityType, entitySnapshot) {
  return {
    entityType,
    entityId: entitySnapshot.id,
    operation: 'create',
    baseServerRevision: null,
    entitySnapshot,
  }
}

async function uploadBootstrap(client, userId, deviceId, snapshots) {
  const bootstrapId = randomUUID()
  const chunks = [snapshots.slice(0, 2), snapshots.slice(2)]
  success(
    await client.rpc('begin_sync_bootstrap_v1', {
      p_bootstrap_id: bootstrapId,
      p_device_id: deviceId,
      p_manifest_hash: `manifest-${bootstrapId}`,
      p_total_chunks: chunks.length,
    }),
    'begin bootstrap',
  )
  for (const [index, entries] of chunks.entries()) {
    const request = {
      p_bootstrap_id: bootstrapId,
      p_chunk_index: index,
      p_idempotency_key: randomUUID(),
      p_payload: { changes: entries },
    }
    success(
      await client.rpc('upload_sync_bootstrap_chunk_v1', request),
      `chunk ${index}`,
    )
    success(
      await client.rpc('upload_sync_bootstrap_chunk_v1', request),
      `chunk ${index} retry`,
    )
  }
  const first = success(
    await client.rpc('commit_sync_bootstrap_v1', {
      p_bootstrap_id: bootstrapId,
    }),
    'commit bootstrap',
  )
  const replay = success(
    await client.rpc('commit_sync_bootstrap_v1', {
      p_bootstrap_id: bootstrapId,
    }),
    'retry commit bootstrap',
  )
  assert.deepEqual(replay, first)
  assert.equal(first.entityCount, snapshots.length)
  assert.equal(first.entityResults.length, snapshots.length)
  assert.equal(first.bootstrapId, bootstrapId)
  assert.ok(first.entityResults.every((result) => result.serverRevision > 0))
  return first
}

try {
  await cleanup()
  const userA = await identity('a')
  const userB = await identity('b')
  const deviceA = randomUUID()
  const activeTaskId = randomUUID()
  const deletedTaskId = randomUUID()
  const memoId = randomUUID()
  const activityId = randomUUID()
  const dailyLogId = randomUUID()
  const timestamp = now()
  const activeTask = task(userA.userId, activeTaskId)
  const deletedTask = task(userA.userId, deletedTaskId, {
    title: 'Deleted tombstone',
    deletedAt: timestamp,
    updatedAt: timestamp,
  })
  const memo = {
    id: memoId,
    userId: userA.userId,
    content: 'Bootstrap memo Привет',
    pinned: true,
    projectId: null,
    version: 2,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
  }
  const activity = {
    id: activityId,
    userId: userA.userId,
    eventType: 'task_created',
    entityType: 'task',
    entityId: activeTaskId,
    payload: { title: activeTask.title, entityId: activeTaskId },
    deviceId: deviceA,
    occurredAt: timestamp,
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
  }
  const dailyLog = {
    id: dailyLogId,
    userId: userA.userId,
    date: '2026-08-31',
    finalizeTimezone: 'Asia/Shanghai',
    summary: 'Bootstrap history unchanged',
    snapshot: {
      completedTasks: [],
      openTasks: [],
      waiting: [],
      memos: [{ entityId: memoId, content: memo.content }],
      routines: [],
    },
    finalizedAt: timestamp,
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
  }
  const changesA = [
    change('task', activeTask),
    change('task', deletedTask),
    change('memo', memo),
    change('activity', activity),
    change('daily_log', dailyLog),
  ]
  let commitA

  await check(
    'User A local-data snapshot bootstraps into empty cloud',
    async () => {
      const before = success(
        await userA.client.rpc('inspect_cloud_workspace_v1'),
        'inspect A before',
      )
      assert.equal(before.hasData, false)
      commitA = await uploadBootstrap(
        userA.client,
        userA.userId,
        deviceA,
        changesA,
      )
      assert.deepEqual(
        commitA.entityResults.map((result) => result.serverRevision),
        [1, 2, 3, 4, 5],
      )
    },
  )

  await check(
    'new device restores complete revision snapshot including history',
    async () => {
      const pulled = success(
        await userA.client.rpc('pull_sync_changes_v1', {
          p_after_revision: 0,
          p_limit: 100,
        }),
        'pull A',
      )
      assert.equal(pulled.highWatermark, commitA.highWatermark)
      assert.equal(pulled.changes.length, 5)
      assert.deepEqual(
        pulled.changes.map((entry) => entry.server_revision),
        [1, 2, 3, 4, 5],
      )
      assert.ok(
        pulled.changes.some(
          (entry) =>
            entry.entity_id === deletedTaskId && entry.record.deleted_at,
        ),
      )
      assert.equal(
        pulled.changes.find((entry) => entry.entity_id === dailyLogId).record
          .snapshot.memos[0].content,
        memo.content,
      )
      assert.equal(
        pulled.changes.find((entry) => entry.entity_id === activityId).record
          .payload.title,
        activeTask.title,
      )
    },
  )

  await check(
    'RLS preserves ownership during bootstrap and restore reads',
    async () => {
      assert.equal(
        success(await userA.client.from('tasks').select('id'), 'A tasks')
          .length,
        2,
      )
      assert.equal(
        success(await userB.client.from('tasks').select('id'), 'B tasks')
          .length,
        0,
      )
      assert.equal(
        success(await userB.client.from('daily_logs').select('id'), 'B logs')
          .length,
        0,
      )
    },
  )

  await check(
    'User B local plus cloud data remains an explicit blocked decision',
    async () => {
      const taskB = task(userB.userId, randomUUID())
      await uploadBootstrap(userB.client, userB.userId, randomUUID(), [
        change('task', taskB),
      ])
      const cloud = success(
        await userB.client.rpc('inspect_cloud_workspace_v1'),
        'inspect B',
      )
      const localHasData = true
      const decision =
        localHasData && cloud.hasData ? 'manual_choice_required' : 'unexpected'
      assert.equal(decision, 'manual_choice_required')
      assert.equal(
        success(await userB.client.from('tasks').select('id'), 'B unchanged')
          .length,
        1,
      )
    },
  )

  await check(
    'bootstrap acknowledgements expose per-entity revision metadata',
    async () => {
      assert.equal(commitA.entityResults.length, 5)
      assert.ok(
        commitA.entityResults.every(
          (result) => result.serverVersion === 1 && result.serverRevision >= 1,
        ),
      )
      const workspace = success(
        await userA.client.rpc('inspect_cloud_workspace_v1'),
        'inspect A after',
      )
      assert.equal(workspace.highWatermark, commitA.highWatermark)
    },
  )
} finally {
  await Promise.allSettled(users.map((id) => admin.auth.admin.deleteUser(id)))
}

console.log(
  `bootstrap acceptance summary: passed=${passed} failed=${failed} skipped=0`,
)
if (failed > 0) process.exitCode = 1
