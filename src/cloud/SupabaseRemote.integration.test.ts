import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, describe, expect, it } from 'vitest'

const nodeEnvironment =
  (
    globalThis as unknown as {
      process?: { env: Record<string, string | undefined> }
    }
  ).process?.env ?? {}
const environment = {
  url: nodeEnvironment.SUPABASE_TEST_URL,
  anonKey: nodeEnvironment.SUPABASE_TEST_ANON_KEY,
  userAEmail: nodeEnvironment.SUPABASE_TEST_USER_A_EMAIL,
  userAPassword: nodeEnvironment.SUPABASE_TEST_USER_A_PASSWORD,
  userBEmail: nodeEnvironment.SUPABASE_TEST_USER_B_EMAIL,
  userBPassword: nodeEnvironment.SUPABASE_TEST_USER_B_PASSWORD,
}
const configured = Object.values(environment).every(Boolean)

describe.skipIf(!configured)('Supabase two-user remote integration', () => {
  let userA: SupabaseClient | undefined
  let userB: SupabaseClient | undefined

  afterAll(async () => {
    if (!userA || !userB) return
    await Promise.all([
      userA.auth.signOut({ scope: 'local' }),
      userB.auth.signOut({ scope: 'local' }),
    ])
  })

  it('restores sessions and isolates owner-scoped cloud reads', async () => {
    userA = createClient(environment.url!, environment.anonKey!)
    userB = createClient(environment.url!, environment.anonKey!)
    const [a, b] = await Promise.all([
      userA.auth.signInWithPassword({
        email: environment.userAEmail!,
        password: environment.userAPassword!,
      }),
      userB.auth.signInWithPassword({
        email: environment.userBEmail!,
        password: environment.userBPassword!,
      }),
    ])
    expect(a.error).toBeNull()
    expect(b.error).toBeNull()
    expect((await userA.auth.getSession()).data.session?.user.id).not.toBe(
      (await userB.auth.getSession()).data.session?.user.id,
    )

    const [inspectionA, inspectionB] = await Promise.all([
      userA.rpc('inspect_cloud_workspace_v1'),
      userB.rpc('inspect_cloud_workspace_v1'),
    ])
    expect(inspectionA.error).toBeNull()
    expect(inspectionB.error).toBeNull()

    const directWrite = await userA.from('memos').insert({
      user_id: a.data.user!.id,
      id: crypto.randomUUID(),
      content: 'must be rejected',
      pinned: false,
      version: 1,
      server_revision: 1,
      last_mutation_id: crypto.randomUUID(),
      last_modified_by_device_id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    expect(directWrite.error).not.toBeNull()
  })
})
