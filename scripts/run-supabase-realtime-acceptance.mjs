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
const options = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(url, service.api_key, options)
let userA
let userB
let passed = 0
let failed = 0

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

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))
const waitFor = async (predicate, timeout = 12_000) => {
  const started = Date.now()
  while (!predicate()) {
    if (Date.now() - started > timeout)
      throw new Error('Realtime event timed out')
    await wait(50)
  }
}

const makeTask = (userId, id, title) => {
  const instant = new Date().toISOString()
  return {
    id,
    userId,
    version: 1,
    createdAt: instant,
    updatedAt: instant,
    deletedAt: null,
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
  }
}

async function createUser(prefix) {
  const email = `${prefix}-${randomUUID()}@example.com`
  const password = `T-${randomUUID()}-a9!`
  const created = success(
    await admin.auth.admin.createUser({ email, password, email_confirm: true }),
    `create ${prefix}`,
  )
  const client = createClient(url, anon.api_key, options)
  success(
    await client.auth.signInWithPassword({ email, password }),
    `sign in ${prefix}`,
  )
  return { id: created.user.id, client }
}

function subscribe(client, userId, received) {
  const states = []
  const channel = client
    .channel(`phase35-${randomUUID()}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'sync_invalidations',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => received.push(payload.new),
    )
    .subscribe((status) => states.push(status))
  return { channel, states }
}

async function mutate(client, userId, title) {
  const mutationId = randomUUID()
  const deviceId = randomUUID()
  const entity = makeTask(userId, randomUUID(), title)
  return success(
    await client.rpc('apply_sync_mutation_v1', {
      p_request: {
        mutationId,
        deviceId,
        userId,
        occurredAt: new Date().toISOString(),
        commitOrder: 1,
        changes: [
          {
            sequence: 1,
            entityType: 'task',
            entityId: entity.id,
            operation: 'create',
            baseServerRevision: null,
            baseLocalVersion: 0,
            resultingLocalVersion: 1,
            predecessorMutationId: null,
            entitySnapshot: entity,
          },
        ],
      },
    }),
    'apply realtime mutation',
  )
}

try {
  userA = await createUser('phase35-a')
  userB = await createUser('phase35-b')
  const receivedA = []
  const receivedB = []
  const subA = subscribe(userA.client, userA.id, receivedA)
  const subB = subscribe(userB.client, userB.id, receivedB)
  await waitFor(
    () =>
      subA.states.includes('SUBSCRIBED') && subB.states.includes('SUBSCRIBED'),
  )

  await check(
    'owner receives a content-free invalidation after mutation',
    async () => {
      await mutate(userA.client, userA.id, 'Realtime A')
      await waitFor(() => receivedA.length === 1)
      assert.deepEqual(Object.keys(receivedA[0]).sort(), [
        'changed_at',
        'mutation_id',
        'server_revision',
        'user_id',
      ])
    },
  )

  await check(
    'another authenticated owner receives no invalidation',
    async () => {
      await wait(500)
      assert.equal(receivedB.length, 0)
    },
  )

  await check(
    'self notification is a single wake-up, not a duplicate write',
    async () => {
      const result = await mutate(userA.client, userA.id, 'Self wake-up')
      await waitFor(() => receivedA.length === 2)
      const replay = success(
        await userA.client.rpc('query_sync_mutation_result_v1', {
          p_mutation_id: result.mutationId,
        }),
        'query mutation receipt',
      )
      assert.equal(replay.mutationId, result.mutationId)
      await wait(400)
      assert.equal(receivedA.length, 2)
    },
  )

  await check(
    'disconnect gap is recovered by revision cursor pull',
    async () => {
      await userA.client.removeChannel(subA.channel)
      const before = Number(
        success(
          await userA.client.rpc('inspect_cloud_workspace_v1'),
          'watermark before',
        ).highWatermark,
      )
      await mutate(userA.client, userA.id, 'During disconnect')
      const page = success(
        await userA.client.rpc('pull_sync_changes_v1', {
          p_after_revision: before,
          p_limit: 100,
        }),
        'catch-up pull',
      )
      assert.ok(page.changes.length >= 1)
      assert.ok(Number(page.highWatermark) > before)
    },
  )

  await userB.client.removeChannel(subB.channel)
} finally {
  if (userA?.id) await admin.auth.admin.deleteUser(userA.id)
  if (userB?.id) await admin.auth.admin.deleteUser(userB.id)
}

console.log(
  `realtime acceptance summary: passed=${passed} failed=${failed} skipped=0`,
)
if (failed > 0) process.exitCode = 1
