# Daily Work OS Sync Protocol

Status: Phase 2.3 local contract, no network implementation.

This document defines the durable boundary that a Phase 3 Sync Engine may use.
It does not define a Supabase schema, HTTP protocol, authentication flow, or
Realtime transport.

## Identity

### Device identity

Each browser profile owns one UUID `deviceId`. It is generated once and stored
under a versioned browser-local key. It is installation metadata, not user
business data:

- portable backups never include it;
- restore never overwrites it;
- Activity and local mutations record it as provenance;
- clearing the browser profile creates a new device identity.

### Mutation identity

One logical command owns one UUID `mutationId`:

```ts
interface MutationMetadata {
  mutationId: string
  deviceId: string
  userId: string
  occurredAt: Instant
}
```

UI, command retry, and future network retry must reuse the same id. A mutation
may change several entities, but every resulting journal row shares that id.
The Unit of Work rejects a replay that attempts another write and rolls it back.
If a replay is an already-satisfied no-op, the existing result may be returned.

New End Day commands use the UUID `commandId` as their `mutationId`. This keeps
the immutable DailyLog id, local idempotency key, and future network mutation
identity aligned. Non-UUID historical command ids remain readable and receive a
generated local mutation id when first processed; they are not rewritten.

## Revision model

Entity `version` remains local optimistic concurrency only. It is never treated
as a server revision.

```ts
interface SyncMetadata {
  localVersion: number
  baseServerRevision: number | null
  serverRevision: number | null
  lastMutationId: string
  lastModifiedByDeviceId: string
}
```

`sync_metadata` stores this state separately from Domain entities. New local
data starts with both remote revisions `null`; Phase 2.3 never invents a server
revision. Acknowledgement may advance the stored server boundary through the
SyncRepository port. Each outbox row captures the server revision on which its
local mutation was based.

## Local mutation journal

Dexie Version 8 adds an append-only-until-acknowledged `local_changes` store:

```ts
interface LocalMutationChange extends MutationMetadata {
  id: string
  sequence: number
  entityType: SyncEntityType
  entityId: string
  operation: 'create' | 'update' | 'delete'
  baseVersion: number
  resultingVersion: number
  baseServerRevision: number | null
  status: 'pending' | 'acknowledged'
  acknowledgedAt: Instant | null
}
```

The journal contains identifiers, revisions, operation type, and timing only.
It never contains task titles, memo content, localized Activity sentences, or
UI state. Entity, Activity, SyncMetadata, and LocalMutationChange are committed
inside the same Unit of Work transaction. Failed commands leave none of them.

`LocalChangeCoordinator` remains a transient multi-tab invalidation transport;
it is not the durable sync journal and must not be uploaded.

## Tombstones

Every sync-capable repository can enumerate current-user tombstones and read an
entity including `deletedAt != null`. Ordinary business queries continue to
exclude them.

```text
local delete
  → versioned tombstone
  → pending delete journal row
  → future upload
  → remote acknowledgement
  → retention period
  → optional explicit physical cleanup
```

Phase 2.3 performs no physical cleanup. A tombstone must never be purged merely
because it is old or hidden from the UI; remote acknowledgement and a future
retention policy are prerequisites.

## Storage-neutral SyncRepository

The future Sync Engine may use only these ports:

- `listPendingChanges(userId)`
- `listTombstones(userId, entityType?)`
- `getEntityIncludingDeleted(userId, entityType, entityId)`
- `getSyncMetadata(userId, entityType, entityId)`
- `applyRemoteChange(change)`
- `markMutationAcknowledged(userId, mutationId, revision, acknowledgedAt)`

It must never access a Dexie table. Remote apply validates ownership, persisted
entity shape, revision base, immutable history, and unique invariants in one
local transaction. It does not create a second local mutation for the remote
change.

## Conflict taxonomy

| Conflict | Automatic handling | Required behavior |
| --- | --- | --- |
| Replayed identical `mutationId` | Yes | Return/recognize the prior outcome; never duplicate writes. |
| Same-base concurrent edit | No field merge in MVP | Quarantine and ask the user; never silent Last Write Wins. |
| Delete vs update | No | Preserve tombstone and remote candidate until explicit user choice. |
| Immutable DailyLog conflict | Never | Keep both candidates outside the canonical slot and require explicit resolution; never overwrite a Snapshot. |
| Duplicate Focus invariant | No | Reject remote apply; user chooses the three Focus items and unique slots. |
| Duplicate RoutineLog invariant | Only byte-for-byte/idempotent replay | Otherwise quarantine; one effective user/routine/date log remains canonical. |
| Duplicate DailyLog invariant | Never | Reject/quarantine; one effective user/date log and no silent Snapshot replacement. |
| Ownership conflict | Never | Stop and require an ownership migration decision. |

Phase 2.3 implements detection and safe rejection, not conflict UI or merge.

## Anonymous to authenticated ownership proposal

Phase 3 must make ownership migration a separate confirmed command. It must
create a safety backup first and must never silently rewrite `local-user`.

MVP cases:

1. **No local data, no cloud data:** sign in and begin with the authenticated
   owner; no migration.
2. **Local data, empty cloud account:** offer “Move this device's local data to
   the account.” After confirmation, a future atomic ownership migration and
   initial upload may run.
3. **No local data, existing cloud data:** offer to use/download the account
   data. No local ownership rewrite is needed.
4. **Local data and existing cloud data:** do not merge. Offer to create a local
   backup and use the cloud account, or cancel sign-in. Replacing cloud data or
   combining histories requires a later explicit workflow.

The user can always cancel and continue locally. A failed migration retains the
original owner and data.

## Backup boundary

Backup Format v1 includes Domain entities, tombstones, Activity payloads, and
DailyLog snapshots. It excludes `deviceId` storage, `local_changes`, and
`sync_metadata`. Replace restore clears the current user's non-portable journal
and revision state, preserves the current device identity, and leaves future
account reconciliation to Phase 3.

## Phase 3 prerequisites still missing

- authenticated ownership and confirmed ownership migration;
- a remote schema/revision allocator and transport protocol;
- acknowledgement values per remote entity revision;
- conflict quarantine persistence and user-facing resolution;
- outbox scheduling, retry/backoff, connectivity, and observability;
- retention policy and remotely acknowledged tombstone cleanup;
- security, authorization, encryption, and account deletion policy.
