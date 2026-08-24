import type { EntityId } from '@/domain/shared'
import type { TodayProjectNameResolver } from './contracts'

export class MockTodayProjectNameResolver implements TodayProjectNameResolver {
  constructor(
    private readonly projectNames: ReadonlyMap<EntityId, string> = new Map(),
  ) {}

  async resolve(
    projectIds: readonly EntityId[],
  ): Promise<ReadonlyMap<EntityId, string>> {
    return new Map(
      projectIds.flatMap((id) => {
        const name = this.projectNames.get(id)
        return name ? [[id, name] as const] : []
      }),
    )
  }
}
