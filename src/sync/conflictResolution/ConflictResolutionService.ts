import type {
  ConflictResolutionCommand,
  ConflictResolutionPort,
  ConflictResolutionResult,
  DailyLogConflictResolutionCloudPort,
} from '@/sync/contracts'
import { isUuid } from '@/sync/journal'

export class ConflictResolutionService {
  constructor(
    private readonly port: ConflictResolutionPort,
    private readonly cloud?: DailyLogConflictResolutionCloudPort,
    private readonly deviceId?: string,
  ) {}

  async resolve(
    command: ConflictResolutionCommand,
  ): Promise<ConflictResolutionResult> {
    if (
      !command.userId ||
      !command.conflictId ||
      !isUuid(command.resolutionId)
    ) {
      throw new Error('Invalid conflict resolution command.')
    }
    if (command.mutationId !== null && !isUuid(command.mutationId)) {
      throw new Error('Invalid conflict resolution mutation identifier.')
    }
    if (command.action === 'repair_focus') {
      const selected = command.focusTaskIds ?? []
      if (selected.length > 3 || new Set(selected).size !== selected.length) {
        throw new Error('Focus resolution accepts at most three unique tasks.')
      }
    }
    if (command.action === 'keep_local_daily_log') {
      if (!this.cloud || !this.deviceId) {
        throw new Error('DailyLogResolutionCloudUnavailable')
      }
      const proposal = await this.port.getProposal(
        command.userId,
        command.conflictId,
      )
      if (!proposal.localCandidate) throw new Error('LocalCandidateNotFound')
      await this.cloud.resolveDailyLogConflict({
        resolutionId: command.resolutionId,
        deviceId: this.deviceId,
        candidate: proposal.localCandidate,
      })
      command = { ...command, mutationId: null }
    }
    return this.port.resolve(structuredClone(command))
  }
}
