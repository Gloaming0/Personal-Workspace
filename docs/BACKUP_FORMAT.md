# Daily Work OS Portable Backup Format

Version: 1.0

## Contract Identity

- Media: UTF-8 JSON
- `format`: `daily-work-os-backup`
- Current `formatVersion`: `1`
- Recommended extension: `.json`
- Recommended filename: `daily-work-os-backup-YYYY-MM-DD.json`

The portable format is an application data contract. It is not an IndexedDB
dump and does not expose Dexie store names, indexes, internal keys, migrations,
or browser storage implementation details.

## Version 1 Shape

```ts
interface DailyWorkBackupV1 {
  format: 'daily-work-os-backup'
  formatVersion: 1
  exportedAt: Instant
  appVersion: string | null
  metadata: {
    sourceDatabaseVersion: number
    userId: string
  }
  data: {
    tasks: Task[]
    waiting: Waiting[]
    memos: Memo[]
    routines: Routine[]
    routineLogs: RoutineLog[]
    activities: Activity[]
    dailyLogs: DailyLog[]
  }
}
```

All Domain fields are preserved, including `version`, UTC timestamps,
LocalDates, nullable values, tombstones, Activity payloads, and immutable
DailyLog snapshots. Array order is not a business ordering guarantee; consumers
must apply the Domain query order, such as Activity `occurredAt` descending.

## Deliberately Excluded

Version 1 never contains:

- localStorage values or UI preferences;
- open panels, drafts, loading state, or other transient UI state;
- Morning Review seen-date markers;
- runtime diagnostics, error messages, or stack traces;
- account tokens, cookies, credentials, secrets, or sync queues.

## Ownership

Every entity must have the same `userId` as `metadata.userId`. Restore is
permitted only when that value equals the current user. Importers must not
silently rewrite ownership. Anonymous-to-authenticated ownership migration is
outside Format Version 1 and remains a future account migration concern.

## Validation

Parsing and validation complete before a restore transaction starts. A Version
1 importer validates:

- format identity and exact supported format version;
- required object/array structure;
- canonical UUID entity and reference ids;
- ownership, integer entity versions, UTC Instants, LocalDates, IANA timezones,
  enums, Routine schedules, Activity payloads, and DailyLog snapshots;
- duplicate ids and effective Focus/RoutineLog/DailyLog invariants;
- Waiting → Task, RoutineLog → Routine, and supported Activity → Entity
  references.

Project references are syntactically validated but cannot be resolved until a
Project Domain slice exists. DailyLog snapshot ids are validated but snapshots
never depend on live entities.

## Restore Semantics

Version 1 uses Replace Current Local Data:

1. Parse and validate without writes.
2. Show a summary and replacement warning.
3. Require explicit confirmation.
4. Export the current user data as a safety backup.
5. In one transaction, remove only the current user's rows and insert every
   validated backup row across all seven stores.
6. Validate the written set before commit.
7. Publish content-free local invalidations after commit.

Any delete, insert, constraint, quota, or integrity failure aborts the entire
transaction. Other users' rows remain untouched. There is no field-level merge
or ownership rewrite.

## Compatibility Policy

- Readers must reject unknown `formatVersion` values before accessing `data`.
- Version 1 readers may ignore unknown additive properties within a Version 1
  document, but required Version 1 fields retain their exact meaning.
- A future breaking shape or semantic change requires `formatVersion: 2` and an
  explicit importer/migration path. It must not reinterpret Version 1 in place.
- `sourceDatabaseVersion` is diagnostic metadata only. Portable-format support
  is not coupled to a matching Dexie version.
