import { describe, expect, it, vi } from 'vitest'
import type { LocalMutationRecord } from '@/sync/contracts'
import {
  SupabaseCloudSyncAdapter,
  type RpcClient,
} from './SupabaseCloudSyncAdapter'

const mutation: LocalMutationRecord = {
  mutationId: '11111111-1111-4111-8111-111111111111',
  userId: 'local-user',
  deviceId: '22222222-2222-4222-8222-222222222222',
  occurredAt: '2026-08-31T00:00:00.000Z',
  commitOrder: 1,
  entityKeys: ['task:33333333-3333-4333-8333-333333333333'],
  changes: [],
  status: 'pending',
  acknowledgedAt: null,
  entityResults: [],
  failureCode: null,
}

describe('SupabaseCloudSyncAdapter', () => {
  it('maps the storage-neutral mutation contract to RPC without adding user data', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        mutationId: mutation.mutationId,
        entityResults: [
          {
            entityType: 'task',
            entityId: '33333333-3333-4333-8333-333333333333',
            serverRevision: 1,
            serverVersion: 1,
          },
        ],
      },
      error: null,
    })
    const adapter = new SupabaseCloudSyncAdapter({ rpc } as RpcClient)

    const acknowledgement = await adapter.submitMutation(mutation)

    expect(acknowledgement.entityResults[0]?.serverRevision).toBe(1)
    expect(rpc).toHaveBeenCalledWith('apply_sync_mutation_v1', {
      p_request: expect.objectContaining({
        mutationId: mutation.mutationId,
        deviceId: mutation.deviceId,
        userId: 'local-user',
        commitOrder: 1,
      }),
    })
  })

  it('uses revision paging and versioned bootstrap RPCs', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { changes: [], highWatermark: 7 },
      error: null,
    })
    const adapter = new SupabaseCloudSyncAdapter({ rpc } as RpcClient)

    await expect(adapter.pullRemotePage(4, 25)).resolves.toEqual({
      changes: [],
      highWatermark: 7,
    })
    await adapter.beginBootstrap({
      bootstrapId: '11111111-1111-4111-8111-111111111111',
      deviceId: '22222222-2222-4222-8222-222222222222',
      manifestHash: 'hash',
      totalChunks: 2,
    })
    expect(rpc).toHaveBeenCalledWith('pull_sync_changes_v1', {
      p_after_revision: 4,
      p_limit: 25,
    })
    expect(rpc).toHaveBeenCalledWith(
      'begin_sync_bootstrap_v1',
      expect.objectContaining({ p_total_chunks: 2 }),
    )
  })

  it('assembles the latest authoritative cloud snapshot from revision pages', async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name !== 'pull_sync_changes_v1') return { data: null, error: null }
      return {
        data: {
          highWatermark: 2,
          changes: [
            {
              entity_type: 'task',
              entity_id: '33333333-3333-4333-8333-333333333333',
              server_revision: 1,
              mutation_id: mutation.mutationId,
              device_id: mutation.deviceId,
              record: {
                id: '33333333-3333-4333-8333-333333333333',
                user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                title: 'Original',
                notes: null,
                status: 'todo',
                priority: 'P2',
                planned_date: '2026-08-31',
                due_at: null,
                project_id: null,
                focus_date: null,
                focus_order: null,
                completed_at: null,
                version: 1,
                created_at: mutation.occurredAt,
                updated_at: mutation.occurredAt,
                deleted_at: null,
                server_changed_at: mutation.occurredAt,
              },
            },
            {
              entity_type: 'task',
              entity_id: '33333333-3333-4333-8333-333333333333',
              server_revision: 2,
              mutation_id: mutation.mutationId,
              device_id: mutation.deviceId,
              record: {
                id: '33333333-3333-4333-8333-333333333333',
                user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                title: 'Latest',
                notes: null,
                status: 'todo',
                priority: 'P2',
                planned_date: '2026-08-31',
                due_at: null,
                project_id: null,
                focus_date: null,
                focus_order: null,
                completed_at: null,
                version: 2,
                created_at: mutation.occurredAt,
                updated_at: mutation.occurredAt,
                deleted_at: null,
                server_changed_at: mutation.occurredAt,
              },
            },
          ],
        },
        error: null,
      }
    })
    const adapter = new SupabaseCloudSyncAdapter({ rpc } as RpcClient)

    const snapshot = await adapter.downloadBootstrapSnapshot(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    )

    expect(snapshot.highWatermark).toBe(2)
    expect(snapshot.entries).toHaveLength(1)
    expect(snapshot.entries[0]).toMatchObject({
      serverRevision: 2,
      entitySnapshot: { title: 'Latest', version: 2 },
    })
  })
})
