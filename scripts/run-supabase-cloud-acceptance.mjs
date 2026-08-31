import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const root = new URL('../', import.meta.url)
const projectRef = readFileSync(
  new URL('supabase/.temp/project-ref', root),
  'utf8',
).trim()

function loadProjectKeys() {
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
  assert.ok(anon?.api_key, 'browser-safe anon key is unavailable')
  assert.ok(service?.api_key, 'server-only acceptance key is unavailable')
  return { anonKey: anon.api_key, serviceKey: service.api_key }
}

const { anonKey, serviceKey } = loadProjectKeys()
const url = `https://${projectRef}.supabase.co`
const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input, init = {}) =>
      fetch(input, { ...init, signal: AbortSignal.timeout(45_000) }),
  },
}
const admin = createClient(url, serviceKey, clientOptions)
const anonymous = createClient(url, anonKey, clientOptions)

let passed = 0
let failed = 0
let skipped = 0
const failures = []

async function acceptance(name, action) {
  try {
    await action()
    passed += 1
    console.log(`ok ${passed + failed} - ${name}`)
  } catch (error) {
    failed += 1
    failures.push(name)
    console.log(`not ok ${passed + failed} - ${name}`)
    console.log(
      `  reason: ${error instanceof Error ? error.message : 'acceptance failed'}`,
    )
  }
}

function expectSuccess(result, label) {
  assert.equal(result.error, null, `${label}: request rejected`)
  return result.data
}

function expectFailure(result, label, message) {
  assert.ok(result.error, `${label}: request unexpectedly succeeded`)
  if (message) {
    assert.match(result.error.message, message, `${label}: wrong error`)
  }
  return result
}

function iso(offset = 0) {
  return new Date(Date.now() + offset).toISOString()
}

function taskSnapshot(userId, id, overrides = {}) {
  const timestamp = iso()
  return {
    id,
    userId,
    title: 'Cloud acceptance task',
    notes: null,
    status: 'todo',
    priority: 'P2',
    plannedDate: '2026-08-31',
    dueAt: null,
    projectId: null,
    focusDate: null,
    focusOrder: null,
    completedAt: null,
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    ...overrides,
  }
}

function memoSnapshot(userId, id, content = 'Cloud acceptance memo') {
  const timestamp = iso()
  return {
    id,
    userId,
    content,
    pinned: false,
    projectId: null,
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
  }
}

function createChange(
  entityType,
  entitySnapshot,
  operation = 'create',
  base = null,
) {
  return {
    entityType,
    entityId: entitySnapshot.id,
    operation,
    baseServerRevision: base,
    entitySnapshot,
  }
}

function mutation(userId, deviceId, changes, mutationId = randomUUID()) {
  return { mutationId, deviceId, userId, changes }
}

function rpc(client, request) {
  return client.rpc('apply_sync_mutation_v1', { p_request: request })
}

function sortedRevisions(result) {
  return result.entityResults
    .map((item) => Number(item.serverRevision))
    .sort((left, right) => left - right)
}

function assertContiguous(values, start) {
  assert.deepEqual(
    values,
    Array.from({ length: values.length }, (_, index) => start + index),
  )
}

function listFiles(directory) {
  const files = []
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) files.push(...listFiles(path))
    else files.push(path)
  }
  return files
}

const users = []
let clientA
let clientB
let restoreClientA

async function cleanupAcceptanceUsers() {
  for (let page = 1; ; page += 1) {
    const result = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    const listed = expectSuccess(result, 'list acceptance users').users
    const stale = listed.filter((user) => user.email?.startsWith('phase32b-'))
    await Promise.allSettled(
      stale.map((user) => admin.auth.admin.deleteUser(user.id)),
    )
    if (listed.length < 1000) break
  }
}

async function createTestUser(label) {
  const email = `phase32b-${label}-${randomUUID()}@example.com`
  const password = `T-${randomUUID()}-a9!`
  const result = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  const user = expectSuccess(result, `create ${label}`)?.user
  assert.ok(user?.id, `create ${label}: missing user id`)
  users.push(user.id)
  const client = createClient(url, anonKey, clientOptions)
  const signIn = await client.auth.signInWithPassword({ email, password })
  const session = expectSuccess(signIn, `sign in ${label}`)?.session
  assert.ok(session, `sign in ${label}: missing session`)
  return { client, session, userId: user.id }
}

try {
  await cleanupAcceptanceUsers()
  const identityA = await createTestUser('a')
  const identityB = await createTestUser('b')
  const identityC = await createTestUser('bootstrap-failure')
  clientA = identityA.client
  clientB = identityB.client
  const userA = identityA.userId
  const userB = identityB.userId
  const userC = identityC.userId
  const deviceA = randomUUID()
  const deviceB = randomUUID()
  const deviceC = randomUUID()

  await acceptance('real Auth users and auth.uid identity', async () => {
    const [a, b] = await Promise.all([
      clientA.auth.getUser(),
      clientB.auth.getUser(),
    ])
    assert.equal(expectSuccess(a, 'get user A').user.id, userA)
    assert.equal(expectSuccess(b, 'get user B').user.id, userB)
    assert.notEqual(userA, userB)
  })

  await acceptance('session restore from a real Auth session', async () => {
    restoreClientA = createClient(url, anonKey, clientOptions)
    expectSuccess(
      await restoreClientA.auth.setSession({
        access_token: identityA.session.access_token,
        refresh_token: identityA.session.refresh_token,
      }),
      'restore session A',
    )
    assert.equal(
      expectSuccess(
        await restoreClientA.auth.getSession(),
        'get restored session',
      ).session.user.id,
      userA,
    )
  })

  const expectedTables = [
    'tasks',
    'confirmations',
    'memos',
    'routines',
    'routine_logs',
    'activities',
    'daily_logs',
    'sync_user_state',
    'sync_mutations',
    'sync_mutation_results',
    'sync_changes',
    'sync_device_cursors',
    'sync_conflicts',
    'sync_bootstrap_sessions',
    'sync_bootstrap_chunks',
  ]

  await acceptance(
    'all cloud tables are reachable by server acceptance role',
    async () => {
      for (const table of expectedTables) {
        expectSuccess(
          await admin
            .from(table)
            .select('*', { head: true, count: 'exact' })
            .limit(0),
          `table ${table}`,
        )
      }
    },
  )

  await acceptance(
    'anonymous business reads and writes are denied',
    async () => {
      expectFailure(
        await anonymous.from('tasks').select('id').limit(1),
        'anon select',
      )
      expectFailure(
        await anonymous.from('memos').insert({ content: 'forbidden' }),
        'anon insert',
      )
      expectFailure(
        await anonymous.rpc('inspect_cloud_workspace_v1'),
        'anon RPC',
      )
    },
  )

  const bootstrapId = randomUUID()
  const bootstrapTaskId = randomUUID()
  const bootstrapMemoId = randomUUID()
  const bootstrapChunkZero = {
    changes: [createChange('task', taskSnapshot(userB, bootstrapTaskId))],
  }
  const bootstrapChunkOne = {
    changes: [createChange('memo', memoSnapshot(userB, bootstrapMemoId))],
  }
  const chunkKeyZero = randomUUID()
  const chunkKeyOne = randomUUID()

  await acceptance(
    'bootstrap begin, chunk replay, mismatch, and incomplete commit',
    async () => {
      const begin = await clientB.rpc('begin_sync_bootstrap_v1', {
        p_bootstrap_id: bootstrapId,
        p_device_id: deviceB,
        p_manifest_hash: 'phase-3.2b-two-chunks',
        p_total_chunks: 2,
      })
      assert.equal(expectSuccess(begin, 'begin bootstrap').status, 'staging')
      const upload = () =>
        clientB.rpc('upload_sync_bootstrap_chunk_v1', {
          p_bootstrap_id: bootstrapId,
          p_chunk_index: 0,
          p_idempotency_key: chunkKeyZero,
          p_payload: bootstrapChunkZero,
        })
      assert.equal(
        expectSuccess(await upload(), 'upload chunk').status,
        'accepted',
      )
      assert.equal(
        expectSuccess(await upload(), 'replay chunk').status,
        'accepted',
      )
      expectFailure(
        await clientB.rpc('upload_sync_bootstrap_chunk_v1', {
          p_bootstrap_id: bootstrapId,
          p_chunk_index: 0,
          p_idempotency_key: chunkKeyZero,
          p_payload: { changes: [] },
        }),
        'changed chunk replay',
        /BootstrapChunkReuse/,
      )
      expectFailure(
        await clientB.rpc('commit_sync_bootstrap_v1', {
          p_bootstrap_id: bootstrapId,
        }),
        'incomplete bootstrap',
        /BootstrapChunksIncomplete/,
      )
      assert.equal(
        expectSuccess(
          await clientB.from('tasks').select('id').eq('id', bootstrapTaskId),
          'incomplete bootstrap rows',
        ).length,
        0,
      )
    },
  )

  await acceptance(
    'bootstrap multi-chunk atomic commit and acknowledgement replay',
    async () => {
      expectSuccess(
        await clientB.rpc('upload_sync_bootstrap_chunk_v1', {
          p_bootstrap_id: bootstrapId,
          p_chunk_index: 1,
          p_idempotency_key: chunkKeyOne,
          p_payload: bootstrapChunkOne,
        }),
        'upload final chunk',
      )
      const first = expectSuccess(
        await clientB.rpc('commit_sync_bootstrap_v1', {
          p_bootstrap_id: bootstrapId,
        }),
        'commit bootstrap',
      )
      const replay = expectSuccess(
        await clientB.rpc('commit_sync_bootstrap_v1', {
          p_bootstrap_id: bootstrapId,
        }),
        'replay bootstrap commit',
      )
      assert.equal(first.status, 'committed')
      assert.equal(first.entityCount, 2)
      assert.deepEqual(replay, first)
      assert.equal(
        expectSuccess(
          await clientB.from('tasks').select('id').eq('id', bootstrapTaskId),
          'bootstrap task',
        ).length,
        1,
      )
      assert.equal(
        expectSuccess(
          await clientB.from('memos').select('id').eq('id', bootstrapMemoId),
          'bootstrap memo',
        ).length,
        1,
      )
    },
  )

  await acceptance(
    'bootstrap mid-commit failure leaves no canonical half-state',
    async () => {
      const failingBootstrap = randomUUID()
      const validTaskId = randomUUID()
      expectSuccess(
        await identityC.client.rpc('begin_sync_bootstrap_v1', {
          p_bootstrap_id: failingBootstrap,
          p_device_id: deviceC,
          p_manifest_hash: 'phase-3.2b-failure',
          p_total_chunks: 1,
        }),
        'begin failing bootstrap',
      )
      expectSuccess(
        await identityC.client.rpc('upload_sync_bootstrap_chunk_v1', {
          p_bootstrap_id: failingBootstrap,
          p_chunk_index: 0,
          p_idempotency_key: randomUUID(),
          p_payload: {
            changes: [
              createChange('task', taskSnapshot(userC, validTaskId)),
              {
                entityType: 'unsupported',
                entityId: randomUUID(),
                operation: 'create',
                baseServerRevision: null,
                entitySnapshot: { id: randomUUID() },
              },
            ],
          },
        }),
        'stage failing bootstrap',
      )
      expectFailure(
        await identityC.client.rpc('commit_sync_bootstrap_v1', {
          p_bootstrap_id: failingBootstrap,
        }),
        'failing bootstrap commit',
        /Unsupported mutation change/,
      )
      assert.equal(
        expectSuccess(
          await identityC.client
            .from('tasks')
            .select('id')
            .eq('id', validTaskId),
          'failed bootstrap task',
        ).length,
        0,
      )
      assert.equal(
        expectSuccess(
          await identityC.client.from('sync_changes').select('server_revision'),
          'failed bootstrap changes',
        ).length,
        0,
      )
    },
  )

  const taskAId = randomUUID()
  const createA = mutation(userA, deviceA, [
    createChange('task', taskSnapshot(userA, taskAId)),
  ])
  let taskARevision = 0

  await acceptance(
    'single entity mutation create and durable result',
    async () => {
      const result = expectSuccess(await rpc(clientA, createA), 'create task A')
      taskARevision = result.entityResults[0].serverRevision
      assert.equal(taskARevision, 1)
      assert.equal(result.entityResults[0].serverVersion, 1)
      const changes = expectSuccess(
        await clientA
          .from('sync_changes')
          .select('server_revision,entity_id,mutation_id')
          .eq('mutation_id', createA.mutationId),
        'create sync change',
      )
      assert.deepEqual(
        changes.map((row) => row.server_revision),
        [1],
      )
      const receipt = expectSuccess(
        await clientA.rpc('query_sync_mutation_result_v1', {
          p_mutation_id: createA.mutationId,
        }),
        'query mutation result',
      )
      assert.equal(receipt.mutationId, createA.mutationId)
    },
  )

  await acceptance('RLS isolates two authenticated owners', async () => {
    const [rowsA, rowsB, forgedRead] = await Promise.all([
      clientA.from('tasks').select('user_id,id'),
      clientB.from('tasks').select('user_id,id'),
      clientA.from('tasks').select('id').eq('user_id', userB),
    ])
    assert.ok(
      expectSuccess(rowsA, 'A reads own').every((row) => row.user_id === userA),
    )
    assert.ok(
      expectSuccess(rowsB, 'B reads own').every((row) => row.user_id === userB),
    )
    assert.equal(expectSuccess(forgedRead, 'A filters B').length, 0)
  })

  await acceptance(
    'authenticated clients cannot bypass RPC or forge ownership',
    async () => {
      expectFailure(
        await clientA.from('memos').insert({
          user_id: userA,
          id: randomUUID(),
          content: 'direct write',
        }),
        'direct own insert',
      )
      expectFailure(
        await clientA
          .from('tasks')
          .update({ title: 'forged' })
          .eq('user_id', userB),
        'direct other owner update',
      )
      expectFailure(
        await rpc(clientA, {
          ...mutation(userB, deviceA, [
            createChange('memo', memoSnapshot(userB, randomUUID())),
          ]),
          userId: userB,
        }),
        'RPC ownership spoof',
        /OwnershipConflict/,
      )
    },
  )

  await acceptance(
    'mutation replay is idempotent and reuse mismatch is rejected',
    async () => {
      const replay = expectSuccess(
        await rpc(clientA, createA),
        'mutation replay',
      )
      assert.equal(replay.entityResults[0].serverRevision, 1)
      const changedPayload = structuredClone(createA)
      changedPayload.changes[0].entitySnapshot.title = 'Different payload'
      expectFailure(
        await rpc(clientA, changedPayload),
        'mutation id reuse',
        /MutationIdReuse/,
      )
      const changes = expectSuccess(
        await clientA
          .from('sync_changes')
          .select('server_revision')
          .eq('mutation_id', createA.mutationId),
        'idempotent changes',
      )
      assert.equal(changes.length, 1)
    },
  )

  let updateA
  await acceptance('entity update uses exact base revision', async () => {
    const updated = taskSnapshot(userA, taskAId, {
      title: 'Updated cloud task',
      version: 2,
      updatedAt: iso(1),
    })
    updateA = mutation(userA, deviceA, [
      createChange('task', updated, 'update', taskARevision),
    ])
    const result = expectSuccess(await rpc(clientA, updateA), 'update task')
    assert.equal(result.entityResults[0].serverRevision, 2)
    assert.equal(result.entityResults[0].serverVersion, 2)
    taskARevision = 2
  })

  await acceptance(
    'stale base revision is rejected without visible revision gap',
    async () => {
      const before = expectSuccess(
        await clientA.rpc('inspect_cloud_workspace_v1'),
        'watermark before stale',
      ).highWatermark
      const stale = mutation(userA, deviceA, [
        createChange(
          'task',
          taskSnapshot(userA, taskAId, { title: 'Stale overwrite' }),
          'update',
          1,
        ),
      ])
      const staleResult = expectFailure(
        await rpc(clientA, stale),
        'stale update',
        /BaseServerRevisionConflict/,
      )
      assert.equal(staleResult.error.code, 'PT409')
      const after = expectSuccess(
        await clientA.rpc('inspect_cloud_workspace_v1'),
        'watermark after stale',
      ).highWatermark
      assert.equal(after, before)
    },
  )

  await acceptance(
    'delete mutation persists a complete tombstone and change',
    async () => {
      const deletedAt = iso(2)
      const tombstone = taskSnapshot(userA, taskAId, {
        title: 'Updated cloud task',
        version: 3,
        updatedAt: deletedAt,
        deletedAt,
      })
      const deletion = mutation(userA, deviceA, [
        createChange('task', tombstone, 'delete', taskARevision),
      ])
      const result = expectSuccess(await rpc(clientA, deletion), 'delete task')
      assert.equal(result.entityResults[0].serverRevision, 3)
      const rows = expectSuccess(
        await clientA.from('tasks').select('deleted_at').eq('id', taskAId),
        'read tombstone',
      )
      assert.ok(rows[0].deleted_at)
    },
  )

  await acceptance(
    'multi-entity failure rolls back entity, receipt, change, and revision',
    async () => {
      const before = expectSuccess(
        await clientA.rpc('inspect_cloud_workspace_v1'),
        'watermark before rollback',
      ).highWatermark
      const memoId = randomUUID()
      const failedMutationId = randomUUID()
      const request = mutation(
        userA,
        deviceA,
        [
          createChange('memo', memoSnapshot(userA, memoId, 'must roll back')),
          {
            entityType: 'unsupported',
            entityId: randomUUID(),
            operation: 'create',
            baseServerRevision: null,
            entitySnapshot: { id: randomUUID() },
          },
        ],
        failedMutationId,
      )
      expectFailure(
        await rpc(clientA, request),
        'failure injection',
        /Unsupported mutation change/,
      )
      assert.equal(
        expectSuccess(
          await clientA.from('memos').select('id').eq('id', memoId),
          'rolled back memo',
        ).length,
        0,
      )
      assert.equal(
        expectSuccess(
          await clientA
            .from('sync_mutations')
            .select('mutation_id')
            .eq('mutation_id', failedMutationId),
          'rolled back receipt',
        ).length,
        0,
      )
      assert.equal(
        expectSuccess(
          await clientA.rpc('inspect_cloud_workspace_v1'),
          'watermark after rollback',
        ).highWatermark,
        before,
      )
    },
  )

  const endDayMutationId = randomUUID()
  let dailyLogAId
  let activityAId
  await acceptance(
    'End Day multi-entity mutation is atomic with per-entity revisions',
    async () => {
      const endTaskId = randomUUID()
      dailyLogAId = randomUUID()
      activityAId = randomUUID()
      const timestamp = iso(3)
      const dailyLog = {
        id: dailyLogAId,
        userId: userA,
        date: '2026-08-31',
        finalizeTimezone: 'Asia/Shanghai',
        summary: 'Cloud acceptance',
        snapshot: {
          completedTasks: [],
          openTasks: [],
          waiting: [],
          memos: [],
          routines: [],
        },
        finalizedAt: timestamp,
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
      }
      const activity = {
        id: activityAId,
        userId: userA,
        eventType: 'daily_log_finalized',
        entityType: 'daily_log',
        entityId: dailyLogAId,
        payload: { title: '2026-08-31' },
        deviceId: deviceA,
        occurredAt: timestamp,
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
      }
      const request = mutation(
        userA,
        deviceA,
        [
          createChange('task', taskSnapshot(userA, endTaskId)),
          createChange('daily_log', dailyLog),
          createChange('activity', activity),
        ],
        endDayMutationId,
      )
      const result = expectSuccess(
        await rpc(clientA, request),
        'End Day mutation',
      )
      assertContiguous(sortedRevisions(result), 4)
      assert.equal(
        expectSuccess(
          await clientA
            .from('sync_changes')
            .select('server_revision')
            .eq('mutation_id', endDayMutationId),
          'End Day changes',
        ).length,
        3,
      )
      const replay = expectSuccess(
        await rpc(clientA, request),
        'End Day replay',
      )
      assert.deepEqual(replay, result)
    },
  )

  await acceptance(
    'same-user concurrent revisions are unique, ordered, and gap-free',
    async () => {
      const requests = Array.from({ length: 5 }, (_, index) =>
        mutation(userA, deviceA, [
          createChange(
            'memo',
            memoSnapshot(userA, randomUUID(), `Concurrent ${index}`),
          ),
        ]),
      )
      const responses = await Promise.all(
        requests.map((request) => rpc(clientA, request)),
      )
      const revisions = responses
        .flatMap((response, index) =>
          sortedRevisions(expectSuccess(response, `concurrent ${index}`)),
        )
        .sort((left, right) => left - right)
      assertContiguous(revisions, 7)
      assert.equal(new Set(revisions).size, revisions.length)
      const changeRows = expectSuccess(
        await clientA
          .from('sync_changes')
          .select('server_revision,entity_id')
          .in('server_revision', revisions),
        'concurrent change rows',
      )
      assert.equal(changeRows.length, revisions.length)
    },
  )

  await acceptance(
    'different users mutate concurrently without cross-owner blocking',
    async () => {
      const requestsA = Array.from({ length: 2 }, () =>
        mutation(userA, deviceA, [
          createChange('memo', memoSnapshot(userA, randomUUID(), 'Owner A')),
        ]),
      )
      const requestsB = Array.from({ length: 2 }, () =>
        mutation(userB, deviceB, [
          createChange('memo', memoSnapshot(userB, randomUUID(), 'Owner B')),
        ]),
      )
      const [resultsA, resultsB] = await Promise.all([
        Promise.all(requestsA.map((request) => rpc(clientA, request))),
        Promise.all(requestsB.map((request) => rpc(clientB, request))),
      ])
      assertContiguous(
        resultsA
          .flatMap((result) =>
            sortedRevisions(expectSuccess(result, 'owner A concurrent')),
          )
          .sort((a, b) => a - b),
        12,
      )
      assertContiguous(
        resultsB
          .flatMap((result) =>
            sortedRevisions(expectSuccess(result, 'owner B concurrent')),
          )
          .sort((a, b) => a - b),
        3,
      )
    },
  )

  await acceptance(
    'Focus invariant permits exactly three unique slots',
    async () => {
      const date = '2026-09-01'
      const focused = [1, 2, 3].map((order) =>
        createChange(
          'task',
          taskSnapshot(userB, randomUUID(), {
            focusDate: date,
            focusOrder: order,
          }),
        ),
      )
      expectSuccess(
        await rpc(clientB, mutation(userB, deviceB, focused)),
        'three Focus slots',
      )
      const before = expectSuccess(
        await clientB.rpc('inspect_cloud_workspace_v1'),
        'Focus watermark before violation',
      ).highWatermark
      expectFailure(
        await rpc(
          clientB,
          mutation(userB, deviceB, [
            createChange(
              'task',
              taskSnapshot(userB, randomUUID(), {
                focusDate: date,
                focusOrder: 1,
              }),
            ),
          ]),
        ),
        'duplicate Focus slot',
      )
      const rows = expectSuccess(
        await clientB
          .from('tasks')
          .select('focus_order')
          .eq('focus_date', date),
        'Focus rows',
      )
      assert.deepEqual(rows.map((row) => row.focus_order).sort(), [1, 2, 3])
      assert.equal(
        expectSuccess(
          await clientB.rpc('inspect_cloud_workspace_v1'),
          'Focus watermark after violation',
        ).highWatermark,
        before,
      )
    },
  )

  await acceptance(
    'RoutineLog active-day invariant rejects duplicates atomically',
    async () => {
      const routineId = randomUUID()
      const timestamp = iso()
      const log = (id) => ({
        id,
        userId: userB,
        routineId,
        date: '2026-09-01',
        completedAt: timestamp,
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
      })
      const firstId = randomUUID()
      const secondId = randomUUID()
      expectFailure(
        await rpc(
          clientB,
          mutation(userB, deviceB, [
            createChange('routine_log', log(firstId)),
            createChange('routine_log', log(secondId)),
          ]),
        ),
        'duplicate RoutineLog',
      )
      assert.equal(
        expectSuccess(
          await clientB
            .from('routine_logs')
            .select('id')
            .eq('routine_id', routineId),
          'RoutineLog rollback',
        ).length,
        0,
      )
    },
  )

  let dailyLogBId
  await acceptance(
    'DailyLog unique date and immutable constraints reject violations',
    async () => {
      dailyLogBId = randomUUID()
      const timestamp = iso()
      const daily = (id) => ({
        id,
        userId: userB,
        date: '2026-09-01',
        finalizeTimezone: 'UTC',
        summary: 'Immutable',
        snapshot: {
          completedTasks: [],
          openTasks: [],
          waiting: [],
          memos: [],
          routines: [],
        },
        finalizedAt: timestamp,
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
      })
      expectSuccess(
        await rpc(
          clientB,
          mutation(userB, deviceB, [
            createChange('daily_log', daily(dailyLogBId)),
          ]),
        ),
        'first DailyLog',
      )
      expectFailure(
        await rpc(
          clientB,
          mutation(userB, deviceB, [
            createChange('daily_log', daily(randomUUID())),
          ]),
        ),
        'duplicate DailyLog date',
      )
      expectFailure(
        await admin
          .from('daily_logs')
          .update({ summary: 'forbidden overwrite' })
          .eq('user_id', userB)
          .eq('id', dailyLogBId),
        'admin DailyLog update',
        /immutable/,
      )
    },
  )

  await acceptance(
    'Activity remains append-only even for server role',
    async () => {
      expectFailure(
        await admin
          .from('activities')
          .update({ payload: { title: 'changed' } })
          .eq('user_id', userA)
          .eq('id', activityAId),
        'admin Activity update',
        /immutable/,
      )
      expectFailure(
        await admin
          .from('activities')
          .delete()
          .eq('user_id', userA)
          .eq('id', activityAId),
        'admin Activity delete',
        /immutable/,
      )
    },
  )

  await acceptance(
    'mutation acknowledgement lookup is retry-safe',
    async () => {
      const first = expectSuccess(
        await clientA.rpc('query_sync_mutation_result_v1', {
          p_mutation_id: endDayMutationId,
        }),
        'first acknowledgement lookup',
      )
      const second = expectSuccess(
        await clientA.rpc('query_sync_mutation_result_v1', {
          p_mutation_id: endDayMutationId,
        }),
        'second acknowledgement lookup',
      )
      assert.deepEqual(second, first)
    },
  )

  await acceptance(
    'security-definer SQL and build artifact contain no unsafe secret boundary',
    async () => {
      const migrationDirectory = new URL('supabase/migrations/', root)
      const migration = listFiles(fileURLToPath(migrationDirectory))
        .filter((file) => file.endsWith('.sql'))
        .map((file) => readFileSync(file, 'utf8'))
        .join('\n')
      const definerCount = (migration.match(/security definer/g) ?? []).length
      const safeDefinerCount = (
        migration.match(/security definer\s+set search_path\s*=\s*''/g) ?? []
      ).length
      assert.ok(definerCount >= 8)
      assert.equal(safeDefinerCount, definerCount)
      assert.doesNotMatch(
        migration,
        /from\s+(tasks|memos|activities|daily_logs)\b/i,
      )
      for (const directoryName of ['src', 'dist']) {
        const directory = new URL(`${directoryName}/`, root)
        for (const file of listFiles(fileURLToPath(directory))) {
          assert.equal(
            readFileSync(file, 'utf8').includes(serviceKey),
            false,
            `server key leaked into ${directoryName}`,
          )
        }
      }
    },
  )

  await acceptance(
    'sign out removes cloud access from the signed-out client',
    async () => {
      expectSuccess(
        await clientA.auth.signOut({ scope: 'local' }),
        'sign out A',
      )
      assert.equal(
        expectSuccess(await clientA.auth.getSession(), 'session after sign out')
          .session,
        null,
      )
      expectFailure(
        await clientA.from('tasks').select('id').limit(1),
        'post-signout access',
      )
    },
  )
} finally {
  if (restoreClientA) await restoreClientA.auth.signOut({ scope: 'local' })
  if (clientB) await clientB.auth.signOut({ scope: 'local' })
  await Promise.allSettled(
    users.map((userId) => admin.auth.admin.deleteUser(userId)),
  )
  await cleanupAcceptanceUsers()
}

console.log(
  `acceptance summary: passed=${passed} failed=${failed} skipped=${skipped}`,
)
if (failed > 0) {
  console.log(`failed checks: ${failures.join(', ')}`)
  process.exitCode = 1
}
