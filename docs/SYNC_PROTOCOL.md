# Daily Work OS Sync Protocol

Status: Phase 3.1 formal local transport contract, no network implementation.

This document defines the durable local boundary that a Phase 3 Sync Engine may
use and the reviewed cloud protocol that later phases may implement. Phase 3.0
does not install a Supabase client, connect to a cloud project, authenticate a
user, or send network traffic.

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
  serverVersion: number | null
  lastMutationId: string
  lastAcknowledgedMutationId: string | null
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

# Phase 3.0 Cloud Architecture Proposal

The following contract is approved for implementation planning, not yet
implemented. PostgreSQL/Supabase is authoritative only after an authenticated
account completes bootstrap. Dexie remains the runtime source for the UI, and
the UI never reads cloud rows or Realtime payloads directly.

```text
UI / Feature Services
        ↓
Local UnitOfWork → Dexie entities + Activity + local_changes
        ↓
Sync Engine (future)
        ↓
Versioned RPC boundary
        ↓
PostgreSQL entity tables + mutation receipts + sync change feed
```

## Revision model

Two version domains remain deliberately separate:

- local `entity.version` is an optimistic-concurrency counter within one local
  database;
- remote `server_revision` is a PostgreSQL-assigned, owner-scoped ordered change
  cursor. Clients never manufacture it and never derive it from a timestamp;
- remote row `version` is a server-side edit counter for that cloud row. It is
  useful for diagnostics but is not the synchronization cursor and is not copied
  from a client's local version;
- `baseServerRevision` is the exact remote revision on which a mutation was
  based, or `null` for a create that has never existed remotely.

Each user owns one `sync_user_state` row. The mutation transaction locks that
row, reserves an ordered range by incrementing `last_revision`, and assigns one
revision to each accepted entity result. Concurrent writers for the same user
therefore serialize revision allocation without blocking other users, and a
rolled-back transaction does not advance the counter. Clients still request
`revision > cursor` and never depend on a gapless stream because retention and
protocol filtering may omit records. A multi-entity mutation receives one
revision per resulting entity row. Its acknowledgement contains an ordered
result list and a `highWatermark`.

Create is legal only when `baseServerRevision` is `null` and the owner/entity
key is absent, except for an identical mutation replay. Update and delete are
legal only when the target exists and its current `server_revision` exactly
equals `baseServerRevision`. Delete writes a tombstone and receives a new
revision. A stale base returns a structured conflict and performs no partial
write.

## Cloud storage model

All tenant-owned tables use the composite primary key `(user_id, id)`. Every
cross-table foreign key must include `user_id`; this prevents a reference from
crossing ownership even if UUIDs collide. Common mutable-row columns are:

```text
user_id uuid
id uuid
version bigint check (version >= 1)
server_revision bigint not null
last_mutation_id uuid not null
last_modified_by_device_id uuid not null
created_at timestamptz not null
updated_at timestamptz not null
server_changed_at timestamptz not null default now()
deleted_at timestamptz null
primary key (user_id, id)
```

`created_at`, `updated_at`, and `deleted_at` are Domain instants preserved across
devices. `server_changed_at` is server-owned. Ordering, cursoring, and conflict
checks use `server_revision`, never client time. Every entity table has
`(user_id, server_revision)` and appropriate active-row indexes.

Proposed tables and constraints:

- `tasks`: Domain task fields; a partial unique constraint on
  `(user_id, focus_date, focus_order)` for active focused rows, `focus_order`
  restricted to 1–3, and focus allowed only for `todo`/`doing`;
- `confirmations`: Waiting fields and status restricted to `waiting`,
  `confirmed`, or `closed`; `needsFollowUp` remains derived;
- `memos`: raw user content, pin state, and nullable project reference;
- `routines`: schedule JSON validated against the supported schedule union and
  an IANA timezone;
- `routine_logs`: a partial unique active-row constraint on
  `(user_id, routine_id, date)`;
- `activities`: event type plus raw payload snapshot; no localized sentence;
  business writes are insert-only;
- `daily_logs`: immutable snapshot JSON, date, summary, `finalize_timezone`, and
  `finalized_at`; a partial unique active-row constraint on `(user_id, date)`;
- `projects`: reserved because Project exists as a Domain reference, but not
  activated until a local Project repository and persistence slice exist.
  Existing project IDs must not receive a cloud foreign key prematurely.

The cloud control plane adds:

- `sync_user_state`: one locked revision allocator/high watermark per user;
- `sync_mutations`: one receipt per `(user_id, mutation_id)`, canonical request
  hash, device, protocol version, status, timestamps, and structured outcome;
- `sync_mutation_results`: ordered entity results for an accepted mutation;
- `sync_changes`: immutable revision feed containing the resulting canonical
  row snapshot, operation, mutation, device, and server time;
- `sync_device_cursors`: last pulled revision and last-seen/retired state per
  `(user_id, device_id)`;
- `sync_conflicts`: quarantined conflict metadata and candidates, introduced
  only with the conflict workflow.

The immutable `sync_changes` snapshot avoids reconstructing an earlier change
from a row that may already have changed again. It contains raw Domain data and
is protected as user data by RLS and retention rules.

## Mutation API contract

The future versioned RPC accepts one logical mutation:

```ts
interface CloudMutationRequestV1 {
  protocolVersion: 1
  mutationId: UUID
  deviceId: UUID
  userId: UUID
  occurredAt: Instant
  changes: Array<{
    sequence: number
    entityType: SyncEntityType
    entityId: UUID
    operation: 'create' | 'update' | 'delete'
    baseServerRevision: number | null
    baseLocalVersion: number
    resultingLocalVersion: number
    predecessorMutationId: UUID | null
    entitySnapshot: unknown
  }>
}
```

The server treats `auth.uid()` as authority and rejects a different request
`userId`. In one PostgreSQL transaction it:

1. validates protocol, identity, ownership, schemas, references, immutable
   fields, and invariants;
2. reserves or locks `(user_id, mutation_id)` and compares a hash of the
   canonical request;
3. returns the stored outcome for an identical replay, but rejects reuse of the
   same UUID with different content;
4. locks affected canonical rows and checks every base revision before writing;
5. allocates revisions, writes every entity result and change-feed row, then
   stores ordered results and the final receipt;
6. commits everything or nothing.

The response is `applied`, `conflict`, or `rejected`. An applied response
contains every entity result and the high watermark. A conflict/rejection has a
stable machine code and safe display key, never a database stack. Timeout after
submission has an unknown outcome, so the client retries the same `mutationId`;
it never creates a replacement mutation.

End Day is one multi-entity mutation. Its Task decisions, DailyLog, and Activity
are accepted or rejected together. DailyLog uniqueness and immutability are
validated before canonical writes.

## Local outbox preconditions (P0)

The current Phase 2.3 journal is not yet sufficient for network replay:

1. it stores identifiers but no immutable post-mutation entity snapshot, so an
   older offline mutation would incorrectly upload the entity's latest state;
2. it has no durable monotonic commit order across mutations and currently
   relies on a client timestamp;
3. multiple offline edits of one entity share the last acknowledged remote base
   unless their causal predecessor is represented and safely rebased;
4. acknowledgement currently accepts one revision per mutation although a
   multi-entity mutation receives multiple remote revisions;
5. there is no atomic local port for applying a pull page and advancing its
   cursor together.

Phase 3.1 resolves these before any network transport. The formal local contract
adds an immutable canonical entity snapshot, a database-assigned
`commitOrder`, and `predecessorMutationId` to each journal result. It changes
acknowledgement to accept ordered per-entity results, supports safe causal
rebase only when local version edges match, and adds
`applyRemotePage`. These are sync infrastructure fields, are excluded from
portable backup, and use Dexie Version 9.

## Bootstrap state machine

Bootstrap begins with a local validated summary, a cloud summary, a safety
backup when local data exists, and an explicit ownership decision.

| Local | Cloud | Result |
| --- | --- | --- |
| Empty | Empty | Bind the authenticated owner, initialize cursor, enter ready. |
| Data | Empty | Confirm ownership migration and stage an idempotent initial upload. |
| Empty | Data | Pull a cloud snapshot, apply locally atomically, then pull changes after its watermark. |
| Data | Data | Stop at a choice. Do not merge or overwrite either side silently. |

The states are `preflight → decision-required → preparing → staging →
committing → initializing-local-metadata → ready`, plus `retryable-error`,
`rollback-available`, and `conflict`.

Cloud snapshot bootstrap returns a watermark and pages canonical rows. A row
that changes after that watermark is obtained through the subsequent incremental
pull. The local cursor advances only after the page and its integrity checks
commit.

For local data moving to an empty account:

1. create and verify a portable safety backup;
2. obtain explicit user confirmation;
3. atomically rewrite local ownership and create a reversible migration
   checkpoint;
4. upload idempotent chunks into a server-side bootstrap staging session;
5. atomically commit the staged session into canonical cloud tables;
6. replay the same commit request until its acknowledgement is known;
7. initialize local sync metadata/cursor and remove the checkpoint.

Before server commit, failure can roll local ownership back from the checkpoint
or safety backup and discard staging. Server commit is the durable commit point:
after it, an acknowledgement loss is recovered by idempotent retry rather than
attempting an unsafe split-brain rollback. No cloud rows become canonical until
the staged upload is complete and validated.

When both sides contain data, the MVP offers “use cloud after preserving a local
backup” or “cancel and continue locally.” Replacing cloud or merging histories
is a separate future product flow.

## Push and pull algorithm

One synchronization cycle is:

1. refresh authentication and acquire a per-device sync lease;
2. pull ordered changes after the durable cursor;
3. apply each page through the storage-neutral remote-apply port and advance the
   cursor in the same local transaction;
4. quarantine a remote change that intersects a pending local causal chain;
5. group pending journal rows by `mutationId` and send exact stored snapshots in
   durable `commitOrder`;
6. atomically apply ordered acknowledgement results locally, advance each
   entity's metadata, and safely rebase only direct same-device successors;
7. pull again to the returned server high watermark.

Push never scans the whole database and never reconstructs historical payloads
from current rows. Pull is paginated, ordered by `change_revision`, idempotent,
and resumes from the last committed cursor. A failed local apply never advances
that cursor. An acknowledged journal can be retained for diagnostics/retention
and later compacted; pending rows are never dropped merely because a request
was sent.

## Conflict resolution matrix

| Conflict | Default disposition | Automatic action |
| --- | --- | --- |
| Same-base concurrent edit | Quarantine for user choice | None; no field merge or LWW. |
| Delete vs update | Quarantine tombstone and candidate | None; deletion does not silently win. |
| Immutable DailyLog conflict | Quarantine both snapshots | Never overwrite or combine automatically. |
| Duplicate Focus invariant | Reject/quarantine selection | User chooses at most three unique slots. |
| Duplicate RoutineLog invariant | Accept only identical idempotent replay | Otherwise quarantine one candidate. |
| Duplicate DailyLog invariant | Quarantine | Never replace an existing snapshot silently. |
| Ownership conflict | Stop synchronization | Require an explicit ownership/bootstrap decision. |

Only exact mutation replay and exact duplicate immutable data are automatic.
Client time is never a conflict winner. Resolution creates a new mutation with a
new `mutationId` and an explicit base revision; it never edits a receipt.

## Tombstone lifecycle

```text
local soft delete
  → tombstone + outbox in one transaction
  → server tombstone + revision + acknowledgement
  → every active device pulls beyond that revision
  → retention window elapses
  → optional privileged physical cleanup
```

MVP keeps tombstones indefinitely. Later cleanup is legal only when the server
has acknowledged the delete, all non-retired device cursors are beyond its
revision, no open conflict/reference requires it, and the configured retention
period has elapsed. An indefinitely offline device blocks cleanup until the user
explicitly retires it. Physical cleanup is a server maintenance operation, not
a client mutation.

## Security and RLS

Every exposed table enables RLS. Tenant selection uses
`(select auth.uid()) = user_id`, and queries also include an explicit `user_id`
filter for plan quality. `user_id` is indexed by the composite primary key.

The client receives SELECT only where needed; direct INSERT/UPDATE/DELETE grants
on canonical and sync-control tables are revoked. All cloud writes go through a
versioned transaction RPC so revision checks, invariants, receipts, and change
feed writes cannot be bypassed. The RPC may use `security definer` only with an
empty pinned `search_path`, fully qualified objects, explicit `auth.uid()`
ownership checks, and EXECUTE revoked from `public`/`anon` then granted to
`authenticated`.

- canonical/select policy: authenticated owner only;
- mutation receipts, results, changes, cursors, and conflicts: owner only;
- Activity: append through the mutation RPC only; no ordinary update/delete;
- DailyLog: create/finalize through the mutation RPC only; no ordinary update or
  replacement;
- tombstone: an authenticated owner may create it only through a legal delete
  mutation;
- service-role credentials never ship to the browser.

RLS is defense in depth; authorization, ownership, and base revision are still
validated inside the RPC.

## Retry and error taxonomy

| Category | Examples | Client behavior |
| --- | --- | --- |
| Retryable | offline, timeout, 429, 5xx, serialization/deadlock | Keep the same mutation ID; exponential backoff with jitter and a cap. |
| Unknown outcome | timeout after request send | Query/replay the same mutation receipt; never issue a new command. |
| Authentication | expired token/401 | Pause, refresh once, then require sign-in without dropping outbox. |
| Authorization | 403/RLS/ownership | Stop; user/account action required. |
| Conflict | stale base, uniqueness, immutable history | Quarantine; no blind retry. |
| Permanent validation | invalid schema, unsupported protocol, mutation-ID reuse | Stop the mutation and show a safe actionable error. |
| Local capacity/integrity | quota, corrupt journal, failed local transaction | Do not acknowledge or advance cursor; enter local recovery flow. |

Suggested foreground retry delays are approximately 1, 2, 4, 8, 16, then 30
seconds with jitter; background attempts respect connectivity and browser
lifecycle. The exact schedule is policy, not correctness. Cursor and mutation
identity provide correctness across arbitrary retries.

## Realtime boundary

Realtime is an optional invalidation hint, never a data transport or source of
truth. A private owner-scoped signal may contain only the highest changed
revision and causes a debounced incremental pull. UI components never subscribe
to or render a Supabase payload. Reconnect always pulls from the durable cursor,
so missed, duplicated, or reordered signals are harmless. Polling/manual sync
remains a correctness-equivalent fallback. Supabase Broadcast is preferred over
direct Postgres Changes when this phase is implemented because the official
guidance favors it for scalability and authorization control.

## Phase 3 risk register

### P0 — must close before cloud writes

- Harden the local Outbox for immutable exact replay, durable order, causal
  rebasing, per-entity acknowledgement, and atomic cursor advancement.
- Prove the mutation RPC is atomic and idempotent under concurrent requests,
  stale bases, uniqueness failures, and an acknowledgement-lost retry.
- Prove RLS, grants, RPC ownership checks, and cross-owner references with two
  real authenticated users; never rely on client-supplied `userId`.
- Make bootstrap staging and its server commit recoverable across browser close,
  network loss, partial chunk upload, and lost final acknowledgement.
- Preserve Focus, RoutineLog, and DailyLog invariants for both mutation apply and
  bootstrap commit; DailyLog candidates must never be silently replaced.

### P1 — required before broad rollout

- Define size, encryption/at-rest expectations, access auditing, and retention
  for duplicated user content in immutable `sync_changes` and conflict records.
- Choose an explicit inactive-device retirement and tombstone retention policy;
  indefinite retention is the safe MVP default.
- Add a protocol/schema compatibility window so an older client cannot submit an
  unsupported payload after a server deployment.
- Design account deletion/export and failed-login recovery without shipping a
  service-role secret or losing a still-valid local database.
- Resolve Project persistence before enabling project rows or foreign keys.
- Provide conflict and sync-status UX that is understandable without exposing
  raw server/database errors.

## External design basis

- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Database Functions](https://supabase.com/docs/guides/database/functions)
- [Supabase Realtime database changes](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes)
- [PostgreSQL explicit and row-level locking](https://www.postgresql.org/docs/current/explicit-locking.html)

# Phase 3.1 Formal Local Transport Contract

This section supersedes the Phase 2.3 `local_changes` transport shape. The
legacy store is empty after Version 9 migration and receives no new writes.

## Mutation Record v2

```ts
interface LocalMutationRecord extends MutationMetadata {
  commitOrder: number
  entityKeys: string[]
  changes: MutationEntityChange[]
  status:
    | 'pending'
    | 'in_flight'
    | 'acknowledged'
    | 'conflicted'
    | 'failed_permanent'
  acknowledgedAt: Instant | null
  entityResults: MutationEntityResult[]
  failureCode: string | null
}

interface MutationEntityChange {
  sequence: number
  entityType: SyncEntityType
  entityId: string
  operation: 'create' | 'update' | 'delete'
  baseServerRevision: number | null
  baseLocalVersion: number
  resultingLocalVersion: number
  predecessorMutationId: string | null
  entitySnapshot: SyncEntity
}
```

The snapshot is the exact post-command Domain state, including a complete
tombstone for delete. Raw user-authored content is necessary transport data;
translated UI sentences, component state, preferences, credentials, and
diagnostics are forbidden. End Day captures Task, DailyLog, and Activity in one
record.

## Commit and causal order

`sync_device_state.lastCommitOrder` is incremented per user/device in the same
transaction as Entity, Activity, SyncMetadata, bootstrap marker, and Mutation
Record. Rollback consumes no committed number. Push sorts strictly by
`commitOrder`, not time.

Every changed entity records its prior `lastMutationId` as
`predecessorMutationId`. A pending successor is Push-ready only after that
predecessor is acknowledged. `conflicted` and `failed_permanent` are terminal
for automatic Push and block the successor chain.

An `in_flight` record survives a crash and is reset to `pending` by explicit
startup recovery. `acknowledged` never re-enters Push. Permanent validation
failures are retained without infinite retry.

## Per-entity acknowledgement

```ts
interface MutationAck {
  mutationId: string
  entityResults: Array<{
    entityType: SyncEntityType
    entityId: string
    serverRevision: number
    serverVersion: number
  }>
}
```

The result set must match the Mutation Record exactly. Identical replay is a
no-op; a different replay is rejected. A late Ack may advance the acknowledged
remote revision/version but must preserve a newer local version,
`lastMutationId`, snapshot, and device provenance. It may transactionally rebase
only the direct successor whose predecessor ID and local version edge both
match; this updates the successor's remote base without reconstructing history
from the current Entity.

## Atomic Pull Page

`applyRemotePage` owns one transaction across all Domain tables,
`sync_metadata`, `local_mutations`, `sync_conflicts`, and
`sync_device_state`. It validates ordered revisions before writing. Unexpected
failure rolls back entities, metadata, conflicts, and cursor. Replaying a page
at or behind the durable cursor is idempotent.

When an incoming entity intersects `pending`, `in_flight`, or already
`conflicted` local work, the candidate is not applied. The transaction persists
`SameBaseConcurrentEdit`, `DeleteVsUpdate`, or
`ImmutableDailyLogConflict`, marks the whole local mutation conflicted, and
retains the remote snapshot. Focus, RoutineLog, and DailyLog uniqueness failures
produce `DuplicateUniqueInvariant`. Non-conflicting records in the page may
apply atomically with those conflict candidates.

## Bootstrap state

- `clean`: no cloud baseline is required for an empty owner;
- `requires_bootstrap`: Domain data exists without a complete formal journal,
  including every Version 1–8 upgrade and every Replace Restore;
- `bootstrapped`: Phase 3.2 has established an acknowledged cloud baseline and
  cursor.

Version 9 never synthesizes historical mutations. Restore clears Mutation
Records, metadata, conflicts, and pull position, preserves the current device
identity and commit-order monotonicity, then writes `requires_bootstrap`.

Portable Backup v1 continues to contain Domain history only. Mutation snapshots,
Ack results, cursor, conflicts, bootstrap state, sync metadata, and device state
remain deliberately non-portable.

# Phase 3.2 Cloud Foundation Contract

The tracked Supabase migration provisions the seven canonical entity tables,
owner revision state, mutation receipts/results, ordered changes, device
cursors, conflict quarantine, and isolated bootstrap staging. Projects remain
local-only. Canonical primary keys are `(user_id, id)` and owner revisions are
allocated only while holding `sync_user_state` for update.

`apply_sync_mutation_v1` is the only ordinary canonical write boundary. It
derives the owner from `auth.uid()`, hashes canonical `jsonb`, locks the mutation
receipt, validates every base revision, allocates one revision per changed
entity, and stores per-entity results. An identical retry returns its durable
result; a changed payload with the same UUID raises `MutationIdReuse`. Any
exception rolls back receipt, entities, revisions, and `sync_changes`.
Stale `baseServerRevision` is exposed as `PT409` at the public RPC boundary so
PostgREST returns an immediate conflict instead of retrying SQLSTATE `40001`;
the underlying transaction still rolls back without consuming a revision.

Bootstrap is a separate state machine:

```text
begin(id, manifest, chunk count)
  -> idempotent staging chunks
  -> atomic commit into an empty canonical workspace
  -> durable replayable acknowledgement
```

Staged chunks never appear in canonical queries. Commit takes one owner lock,
requires every chunk, revalidates canonical emptiness, and applies all snapshots
in one server transaction. Phase 3.2 UI performs discovery only: empty/empty,
local/cloud, cloud/local, or both-with-explicit-choice. It never rewrites
`local-user` or starts background synchronization.

Pull read contracts expose ordered `sync_changes` after a revision cursor, but
Phase 3.2 contains no polling or Push/Pull engine. Realtime is disabled.

# Phase 3.3 Initial Bootstrap Contract

`BootstrapCoordinator` is the only feature boundary combining authenticated
identity, local/cloud inspection, safety backup, ownership changes, bootstrap
RPCs, and local sync initialization. UI components never call Dexie or
Supabase directly.

| Local | Cloud | Allowed result |
| --- | --- | --- |
| empty | empty | initialize the authenticated owner and cursor |
| data | empty | safety backup, checkpointed ownership migration, snapshot upload, commit |
| empty | data | download the revision snapshot and atomically install it locally |
| data | data | stop; MVP permits only Cancel or confirmed Use Cloud |

Bootstrap snapshots contain all authoritative Domain rows, including
tombstones, Activity payloads, and immutable DailyLog snapshots. They exclude
device identity, mutation transport state, cursors, diagnostics, tokens, and UI
preferences. Entity order is type-then-ID, chunk size is centrally fixed, and
chunk UUIDs are deterministically derived from bootstrap ID, index, and
payload. Historical data never enters the ordinary Outbox.

Dexie Version 10 persists one progress record per authenticated owner and a
pre-commit ownership checkpoint. Restart resumes the same bootstrap ID and next
chunk. Ownership can return to `local-user` only before server commit. After
commit, local finalization installs per-entity server metadata and advances the
device cursor to the returned high watermark atomically.

Cloud restore reads the durable revision feed from zero, retains the newest
record per entity, validates the complete owner snapshot, and atomically
replaces local Domain and transport state. It creates no Activity or mutation.
Phase 3.3 still has no recurring Push/Pull scheduler or Realtime listener.
