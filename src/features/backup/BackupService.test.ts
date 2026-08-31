import { describe, expect, it, vi } from 'vitest'
import type { BackupRepository, SafetyBackupSink } from './contracts'
import { BackupError } from './errors'
import {
  backupFormat,
  currentBackupFormatVersion,
  type BackupData,
} from './format'
import { BackupService } from './BackupService'
import { createCompleteBackupData, fixtureIds } from './testFixtures'

const NOW = '2026-08-25T10:30:00.000Z'

class MemoryBackupRepository implements BackupRepository {
  constructor(public data: BackupData) {}
  readAll = vi.fn(async () => structuredClone(this.data))
  replaceAll = vi.fn(async (_userId: string, data: BackupData) => {
    this.data = structuredClone(data)
  })
}

describe('Backup Format and Service', () => {
  it('exports deterministic v1 JSON without modifying entity metadata', async () => {
    const original = createCompleteBackupData()
    const repository = new MemoryBackupRepository(original)
    const service = new BackupService(repository, {
      now: () => NOW,
      appVersion: '0.1.0',
    })
    const before = structuredClone(original)

    const result = await service.createBackup('local-user', 'Asia/Shanghai')

    expect(result.filename).toBe('daily-work-os-backup-2026-08-25.json')
    expect(result.backup).toMatchObject({
      format: backupFormat,
      formatVersion: currentBackupFormatVersion,
      exportedAt: NOW,
      appVersion: '0.1.0',
      metadata: { sourceDatabaseVersion: 10, userId: 'local-user' },
    })
    expect(result.backup.data).toEqual(before)
    expect(repository.data).toEqual(before)
    expect(result.json).toContain('完成提案 ✓ Привет')
    expect(result.backup.data.tasks[1]).toMatchObject({
      deletedAt: '2026-08-25T09:00:00.000Z',
      version: 2,
    })
    expect(result.backup.data.activities[0]?.payload).toEqual({
      title: '完成提案 ✓ Привет',
      entityId: fixtureIds.task,
    })
    expect(result.backup.data.dailyLogs[0]?.snapshot.memos[0]?.content).toBe(
      '备忘：明天继续 🌙',
    )
  })

  it('creates and saves a safety backup before replacing data', async () => {
    const oldData = createCompleteBackupData()
    const repository = new MemoryBackupRepository(oldData)
    const service = new BackupService(repository, { now: () => NOW })
    const incoming = await service.createBackup('local-user', 'UTC')
    incoming.backup.data.tasks[0]!.title = 'Restored title'
    const sequence: string[] = []
    const sink: SafetyBackupSink = {
      save: vi.fn(async (backup, filename) => {
        sequence.push('safety')
        expect(filename).toBe('daily-work-os-safety-backup-2026-08-25.json')
        expect(backup.data).toEqual(oldData)
      }),
    }
    repository.replaceAll.mockImplementationOnce(async (_userId, data) => {
      sequence.push('replace')
      repository.data = structuredClone(data)
    })

    await service.restore('local-user', incoming.backup, 'UTC', sink)

    expect(sequence).toEqual(['safety', 'replace'])
    expect(repository.data.tasks[0]?.title).toBe('Restored title')
  })

  it('cancels restore when the safety backup cannot be saved', async () => {
    const repository = new MemoryBackupRepository(createCompleteBackupData())
    const service = new BackupService(repository, { now: () => NOW })
    const incoming = await service.createBackup('local-user', 'UTC')

    await expect(
      service.restore('local-user', incoming.backup, 'UTC', {
        save: vi.fn(async () => {
          throw new Error('download blocked')
        }),
      }),
    ).rejects.toMatchObject({ code: 'safety-backup-failed' })
    expect(repository.replaceAll).not.toHaveBeenCalled()
  })

  it.each([
    ['corrupt JSON', '{', 'invalid-json'],
    [
      'unsupported version',
      JSON.stringify({
        format: backupFormat,
        formatVersion: 2,
        exportedAt: NOW,
        appVersion: null,
        metadata: { sourceDatabaseVersion: 9, userId: 'local-user' },
        data: createCompleteBackupData(),
      }),
      'unsupported-version',
    ],
  ])('rejects %s without writing', (_label, json, code) => {
    const repository = new MemoryBackupRepository(createCompleteBackupData())
    const service = new BackupService(repository)
    expect(() => service.validateImport(json, 'local-user')).toThrowError(
      expect.objectContaining({ code }),
    )
    expect(repository.replaceAll).not.toHaveBeenCalled()
  })

  it('rejects wrong ownership, invalid entities, and broken references', async () => {
    const repository = new MemoryBackupRepository(createCompleteBackupData())
    const service = new BackupService(repository, { now: () => NOW })
    const prepared = await service.createBackup('local-user', 'UTC')

    const wrongOwner = structuredClone(prepared.backup)
    wrongOwner.metadata.userId = 'other-user'
    expect(() =>
      service.validateImport(JSON.stringify(wrongOwner), 'local-user'),
    ).toThrowError(expect.objectContaining({ code: 'wrong-owner' }))

    const invalidEntity = structuredClone(prepared.backup)
    invalidEntity.data.tasks[0]!.id = 'not-a-uuid'
    expect(() =>
      service.validateImport(JSON.stringify(invalidEntity), 'local-user'),
    ).toThrowError(expect.objectContaining({ code: 'invalid-entity' }))

    const brokenReference = structuredClone(prepared.backup)
    brokenReference.data.routineLogs[0]!.routineId =
      '00000000-0000-4000-8000-000000000099'
    expect(() =>
      service.validateImport(JSON.stringify(brokenReference), 'local-user'),
    ).toThrowError(expect.objectContaining({ code: 'invalid-reference' }))
    expect(repository.replaceAll).not.toHaveBeenCalled()
  })

  it('accepts unknown additive fields in v1 but rejects a future format version', async () => {
    const repository = new MemoryBackupRepository(createCompleteBackupData())
    const service = new BackupService(repository, { now: () => NOW })
    const prepared = await service.createBackup('local-user', 'UTC')
    const additive = {
      ...prepared.backup,
      futureOptionalMetadata: { ignored: true },
    }
    expect(
      service.validateImport(JSON.stringify(additive), 'local-user').backup,
    ).toMatchObject({ formatVersion: 1 })

    expect(() =>
      service.validateImport(
        JSON.stringify({ ...prepared.backup, formatVersion: 99 }),
        'local-user',
      ),
    ).toThrowError(
      expect.objectContaining<Partial<BackupError>>({
        code: 'unsupported-version',
      }),
    )
  })
})
