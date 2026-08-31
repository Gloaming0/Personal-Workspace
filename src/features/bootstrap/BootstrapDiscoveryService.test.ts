import { describe, expect, it } from 'vitest'
import type { CloudSyncPort } from '@/cloud/contracts'
import type { SyncRepository } from '@/sync/contracts'
import { BootstrapDiscoveryService } from './BootstrapDiscoveryService'

function service(localHasData: boolean, cloudHasData: boolean) {
  return new BootstrapDiscoveryService(
    { hasData: async () => localHasData },
    {
      inspectCloudWorkspace: async () => ({
        hasData: cloudHasData,
        highWatermark: 0,
      }),
    } as CloudSyncPort,
    {
      getBootstrapState: async () => 'requires_bootstrap',
    } as unknown as SyncRepository,
  )
}

describe('BootstrapDiscoveryService', () => {
  it.each([
    [false, false, 'initialize_authenticated_workspace'],
    [true, false, 'connect_local_data'],
    [false, true, 'restore_cloud_data'],
    [true, true, 'manual_choice_required'],
  ] as const)(
    'maps local=%s cloud=%s without mutating either side',
    async (local, cloud, decision) => {
      await expect(service(local, cloud).inspect()).resolves.toMatchObject({
        local: local ? 'has_data' : 'empty',
        cloud: cloud ? 'has_data' : 'empty',
        syncBootstrapState: 'requires_bootstrap',
        decision,
      })
    },
  )
})
