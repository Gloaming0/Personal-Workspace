# Daily Work OS Database Schema

Version: 1.5


# Purpose


This document defines the data model for Daily Work OS.

The database design must support:


- Local-first architecture
- Offline usage
- Multi-device synchronization
- Future scalability
- Data ownership


The same logical data model should exist in:


1. Local Database

Dexie / IndexedDB


2. Cloud Database

Supabase PostgreSQL



---

# Database Principles


## User owns all data


Every user-created entity must contain:


userId


Users can only access their own data.


---

## Soft Delete


Never immediately remove synchronized data.


Use:


deletedAt


Reason:


Other devices need to know that deletion occurred.



---

## Sync Friendly


Every synchronized entity must contain:


id
userId
createdAt
updatedAt
deletedAt
version


---

# ID Strategy


Use UUID.


Example:


550e8400-e29b-41d4-a716-446655440000


IDs are generated locally first.


Reason:


Offline creation requires independent ID generation.


---

# Timestamp Strategy


Store:


UTC timestamp.


Example:


2026-08-24T10:00:00Z


Display:


Converted to user's local timezone.



---

# Core Entities


# User


Managed by:

Supabase Auth


Fields:


id
email
createdAt
updatedAt


---

# User Preferences


Stores personal settings.


Table:


user_preferences


Fields:


id
userId
theme
density
sidebarMode
quickCaptureDefault
language
weekStartsOn
createdAt
updatedAt

Preference contracts:

- `theme`: system or one of the named themes
- `density`: comfortable | compact
- `sidebarMode`: expanded | collapsed
- `quickCaptureDefault`: inbox | task | waiting | memo
- `language`: en | zh-CN
- `weekStartsOn`: 0 (Sunday) | 1 (Monday)

Local preferences are versioned and validated before use. Cloud persistence
must preserve the same enum contract when the preferences repository is added.


Language:


en
zh-CN



---

# Task


Purpose:


A personal action item.



Table:


tasks


Fields:


id
userId
title
status
priority
plannedDate
dueAt
projectId
notes
focusDate
focusOrder
createdAt
updatedAt
completedAt
deletedAt
version



Status:


todo
doing
done
later
archived



Priority:


P1
P2
P3

## Local IndexedDB Implementation

Phase 1.4 stores only `Task` in Dexie/IndexedDB. Database name:
`daily-work-os`; schema version: `1`; table: `tasks`; primary key: `id`.

The table persists every Task Domain field without UI-specific fields. It
defines indexes for `userId`, `status`, `priority`, `plannedDate`, `dueAt`,
`projectId`, `focusDate`, `completedAt`, `deletedAt`, and `updatedAt`, plus
compound indexes for `[userId+plannedDate]`, `[userId+focusDate]`, and
`[userId+status]`.

- `id` is a locally generated UUID.
- `createdAt`, `updatedAt`, `completedAt`, and `deletedAt` are UTC ISO 8601
  timestamps.
- `plannedDate` and `focusDate` retain `LocalDate` (`YYYY-MM-DD`) semantics and
  are not converted to UTC instants.
- Deletion is soft: the row remains stored with `deletedAt`, while repository
  reads exclude it by default.
- A create starts at `version = 1`. Each update, including soft deletion,
  persists exactly the previous version plus one. Stale or skipped-version
  writes are rejected inside the Dexie transaction.

Dexie schema versions are append-only. Future migrations add a new
`database.version(n)` declaration and retain earlier declarations so existing
local databases can upgrade in place. Version 1 is the migration baseline and
requires no data transform.



---

# Confirmation / Waiting


Purpose:


Track responsibilities currently waiting on others.



Table:


confirmations


Fields:


id
userId
title
status
person
projectId
sourceTaskId
sentAt
followUpDate
notes
createdAt
updatedAt
confirmedAt
closedAt
deletedAt
version



Status:


waiting
confirmed
closed

`need_followup` is not persisted. The Today query derives `needsFollowUp` when
the base status is `waiting` and `followUpDate` is on or before the requested
local date.

## Local IndexedDB Implementation

Phase 1.5 adds the `confirmations` table in IndexedDB schema Version 2 while
retaining the Version 1 `tasks` table declaration and all existing Task data.
The primary key is `id`.

Indexes cover `userId`, `status`, `person`, `projectId`, `sourceTaskId`,
`sentAt`, `followUpDate`, `confirmedAt`, `closedAt`, `deletedAt`, and
`updatedAt`, plus `[userId+status]`, `[userId+followUpDate]`, and
`[userId+projectId]`.

- Creates start with `status = waiting`, `version = 1`, a local UUID, and UTC
  `sentAt/createdAt/updatedAt` timestamps.
- Confirm writes `confirmedAt`; Close writes `closedAt`.
- Reopen returns to `waiting` and clears both `confirmedAt` and `closedAt` for
  the new lifecycle.
- Every update persists exactly the previous version plus one inside a Dexie
  transaction.
- Soft-deleted rows remain stored but all business queries exclude
  `deletedAt != null`.
- `sourceTaskId` is stored unchanged and preserves the optional Task origin.
- `needsFollowUp` is not part of the table or Domain Entity. It is derived from
  the requested Today `LocalDate` after reading persisted data.

The Version 1 → Version 2 migration is additive and requires no Task data
transform. Future migrations must preserve both earlier version declarations.

All user-authored `title`, `notes`, `person`, `name`, `summary`, and `content`
fields store the original string. They must not use `LocalizedText` or persist
UI translations.



---

# Memo


Purpose:


Quick personal notes.


Table:


memos


Fields:


id
userId
content
pinned
projectId
createdAt
updatedAt
deletedAt
version

## Local IndexedDB Implementation

Phase 1.6 adds `memos` in IndexedDB Version 3. Indexes cover `userId`,
`pinned`, `projectId`, `updatedAt`, and `deletedAt`, plus `[userId+pinned]`,
`[userId+updatedAt]`, and `[userId+projectId]`.

Memo creation starts at Version 1 with a local UUID and UTC timestamps. Edit,
Pin, Unpin, and Soft Delete each write exactly the previous version plus one in
a transaction. Business reads always exclude `deletedAt != null`.

The Today Quick Memo query selects the most recently updated pinned Memo. If
there is no pinned Memo, it selects the most recently updated Memo whose
`updatedAt` falls on the requested local date in the requested timezone. Memo
content remains original user text and is never localized in storage.



---

# Inbox Item


Purpose:


Temporary capture location.


Table:


inbox_items


Fields:


id
userId
content
processed
convertedType
convertedId
createdAt
updatedAt
deletedAt
version



Converted Type:


task
confirmation
memo
project



---

# Routine


Purpose:


Daily recurring work.


Table:


routines


Fields:


id
userId
title
status
schedule
timezone
sortOrder
createdAt
updatedAt
deletedAt
version

Status:

active
paused
archived

## Schedule MVP

`schedule` is a structured Domain value supporting:

- `{ frequency: "daily" }`
- `{ frequency: "weekdays" }`
- `{ frequency: "weekly", daysOfWeek: number[] }`

`daysOfWeek` uses JavaScript weekday numbers (`0 = Sunday` through
`6 = Saturday`), contains unique values, and must contain at least one day for
a weekly schedule. Today evaluates the schedule against its requested
`LocalDate`; that date is already resolved in the Today query timezone.



---

# Routine Log


Purpose:


Daily completion record.


Table:


routine_logs


Fields:


id
userId
routineId
date
completedAt
createdAt
updatedAt
deletedAt
version

Constraint:

unique(userId, routineId, date)

## Local IndexedDB Implementation

Phase 1.6 adds `routines` and `routine_logs` in IndexedDB Version 4. Routine
indexes cover status, timezone, order, soft deletion, and `[userId+status]`.
Routine Log indexes cover `routineId`, `date`, completion and deletion
timestamps, plus `[routineId+date]`, `[userId+routineId+date]`, and
`[userId+date]`.

A completed check-in is represented only by an effective RoutineLog row.
Incomplete state does not persist `completed: false`. Undo soft-deletes the
effective log. The repository transaction rejects a second non-deleted row for
the same `[userId+routineId+date]`; multiple historical soft-deleted rows are
allowed so Complete can follow Undo without physical deletion.

Only active, non-deleted Routines whose schedule matches the requested date
enter Today. Paused and archived Routines are excluded. Daily Check-in View
Models are produced by left-joining scheduled Routines with effective logs for
that date.

Schema declarations are append-only: Version 1 creates `tasks`, Version 2 adds
`confirmations`, Version 3 adds `memos`, and Version 4 adds `routines` plus
`routine_logs`. The v2 → v3 → v4 migrations are additive and do not transform
or remove existing Task, Waiting, or Memo rows.



---

# Project


Purpose:


Lightweight context container.


Table:


projects


Fields:


id
userId
name
icon
status
createdAt
updatedAt
deletedAt
version



Status:


active
paused
completed
archived



---

# Daily Log


Purpose:


Personal work history.


Table:


daily_logs


Fields:


id
userId
date
finalizeTimezone
summary
finalizedAt
snapshot
createdAt
updatedAt
deletedAt
version

Snapshot contains immutable end-of-day copies of completed tasks, open tasks,
Waiting items, Memos, and all scheduled Routine results, including the labels and context
needed to render history without joining mutable entities. Historical rendering
must use this snapshot rather than mutable live entities.

Phase 1.8 local implementation adds `database.version(6)` and the
`daily_logs` store with:

```text
id, userId, date, finalizedAt, deletedAt,
[userId+date], [userId+finalizedAt]
```

`[userId+date]` is checked inside the same Dexie transaction as insertion.
The adapter exposes `finalize`, not a general-purpose update/save operation,
and rejects a second effective Daily Log for the date. Snapshot JSON contains
raw user-authored strings and entity identifiers plus the display context
captured at finalization; it does not contain `LocalizedText` or references
that must be joined later. Versions 1–5 remain declared unchanged.

Phase 2.1C adds `database.version(7)` while preserving every Version 1–6
declaration. Version 7 adds the required `finalizeTimezone` field to DailyLog;
the store indexes remain unchanged. New logs store the explicit IANA timezone
used by End Day. Existing v6 rows are migrated to `finalizeTimezone: "UTC"` as
a deterministic legacy fallback because the original zone cannot be recovered
from the old record. Task, Waiting, Memo, Routine, RoutineLog, Activity, and
DailyLog snapshot content are otherwise unchanged.

Repository validation rejects missing or invalid IANA timezones and deeply
validates every Snapshot item before a DailyLog enters Domain code.



---

# Activity


Purpose:


Timeline and history.


Table:


activities


Fields:


id
userId
eventType
entityType
entityId
payload
deviceId
occurredAt
createdAt
updatedAt
deletedAt
version



Example:


task_completed
task
xxxx
{
 title:"Finish proposal"
}

## Local IndexedDB Implementation

Phase 1.7 adds `activities` in IndexedDB Version 5 while preserving every
Version 1–4 declaration. Indexes cover `userId`, `eventType`, `entityType`,
`entityId`, `occurredAt`, and `deviceId`, plus `[userId+occurredAt]`,
`[entityType+entityId]`, and `[userId+eventType]`.

Activity is append-only. `ActivityRepository` exposes `append` and `find`; it
does not expose update, save, soft delete, or physical delete. A duplicate
Activity `id` is rejected. Events start and remain at Version 1 with
`deletedAt = null`; `createdAt`, `updatedAt`, and `occurredAt` are fixed at the
append instant.

All Activity reads are explicitly scoped by `userId` and exclude
`deletedAt != null`. The tombstone field is retained for future synchronization
compatibility only; local business APIs still provide no Activity update or
delete command.

Phase 1.7 records these minimum event types:

- Task: `task_created`, `task_completed`, `task_reopened`, `task_focus_set`,
  `task_focus_removed`
- Waiting: `waiting_created`, `waiting_confirmed`, `waiting_closed`,
  `waiting_reopened`, `waiting_followup_changed`
- Memo: `memo_created`, `memo_updated`, `memo_pinned`, `memo_unpinned`
- Routine: `routine_completed`, `routine_completion_undone`

`payload` stores only the original snapshot fields needed for later rendering:
`title`, `entityId`, and optional `projectId`. It never stores a translated
sentence, language code, or `{ en, zh-CN }` content. Today sorts by
`occurredAt` descending and reads at most the newest 10 events. The View Model
Assembler combines `eventType`, raw payload, and current UI i18n messages.

The Version 4 → Version 5 migration is additive. Existing Task, Waiting, Memo,
Routine, and RoutineLog rows require no transform and remain unchanged.

## Phase 2.1A Repository Storage Contract

At Phase 2.1A schema version remained 6; ownership hardening itself required no
IndexedDB migration. Phase 2.1C subsequently advances the schema to Version 7
for `DailyLog.finalizeTimezone` only.
Every Repository read includes an explicit calling `userId`. `getById` returns
null for another owner's id, list/query operations return only the requested
owner's effective rows, and every write rejects an entity whose `userId` does
not match the caller.

At the storage boundary, every persisted entity must have:

- a non-empty legal identifier and non-empty `userId`;
- integer `version >= 1`;
- UTC ISO 8601 `createdAt`, `updatedAt`, and nullable entity timestamps;
- strict, calendar-valid `YYYY-MM-DD` values for every `LocalDate`;
- a valid Domain enum and entity-specific structure.

Creates must persist Version 1. Updates must persist exactly the current
version plus one, and a supplied `expectedVersion` must match the stored
version. These rules are identical in In-memory and Dexie adapters. Business
reads exclude soft-deleted entities by default; tombstones remain stored.

## Phase 2.1D Migration and Integrity Contract

Phase 2.1D does not change the persisted schema; `currentDatabaseVersion`
remains 7. Versions 1–7 stay append-only and Version 7 continues to perform the
only data transform: legacy Version 6 DailyLogs receive
`finalizeTimezone: "UTC"`.

The migration fixture matrix verifies every supported starting point from
Version 1 through Version 6. Each fixture includes multiple rows for every
store available at that version, including Unicode text, nullable fields,
soft-delete tombstones, Activity payload JSON, and DailyLog snapshot JSON.
After upgrade, raw values and entity versions must be preserved, tombstones
must remain hidden from business queries, and the documented timezone fallback
must be the only transformed value.

On startup, storage-boundary validation checks id/user/version, Instant,
LocalDate, enum, schedule, payload, and snapshot structure. The integrity pass
also detects, without auto-repair:

- duplicate or more-than-three effective Focus slots per `[userId+focusDate]`;
- more than one effective RoutineLog per `[userId+routineId+date]`;
- more than one effective DailyLog per `[userId+date]`.

Individual malformed rows are isolated with a content-free diagnostic. A
cross-row invariant failure moves the database runtime to
`recovery-required`. These checks are application invariants, not new IndexedDB
unique indexes, so they require no Version 8 schema.



---

# Sync Queue


Local only.


Purpose:


Store pending changes.


Table:


sync_queue



Fields:


id
entityType
entityId
operation
payload
status
retryCount
createdAt
updatedAt



Operation:


create
update
delete



Status:


pending
processing
success
error



---

# Entity Relationships


User
 |
 ├── Tasks
 |
 ├── Confirmations
 |
 ├── Memo
 |
 ├── Projects
 |
 ├── Routines
 |
 └── Daily Logs



Projects:


Project
   |
   ├── Tasks
   ├── Confirmations
   └── Memo



---

# Index Strategy


Important indexes:


Tasks:


userId
date
status
projectId
updatedAt



Confirmation:


userId
status
followUpDate



Memo:


userId
createdAt



Activity:


userId
createdAt



---

# Migration Rules


Database changes require:


1.

Update schema


2.

Create migration


3.

Update repositories


4.

Test offline


5.

Test sync


Never directly modify production schema.



---

# Data Validation


Validation happens in:


- Frontend
- Repository layer
- Database constraints


Never trust UI input only.



---

# Future Expansion Reserved


Possible future entities:


calendar_events
attachments
ai_summaries
integrations
notifications



Do not create until required.



---

# Final Database Principle


The database should represent:

"What happened in the user's work life."


Not only:

"What tasks exist."


The system should preserve:

- Actions
- Responsibilities
- Memories
- Context

---

# Phase 2.2 Portable Backup Storage Boundary

Backup/restore introduces no new table, index, field, or Dexie migration. The
local schema remains Version 7.

The portable format maps the `confirmations` store to the Domain name
`data.waiting`, `routine_logs` to `data.routineLogs`, and `daily_logs` to
`data.dailyLogs`. These mappings keep the external contract independent from
physical store naming. Export includes all current-user rows, including
`deletedAt != null`; ordinary Repository queries continue to hide tombstones.

Replace restore executes current-user deletion, insertion, and transaction
readback validation across all seven stores in one IndexedDB transaction. It
does not clear the whole database and does not touch another user's rows.
Portable format changes are governed by `docs/BACKUP_FORMAT.md`, not by Dexie
schema numbering.

# Phase 2.3 Sync Readiness Stores

Dexie Version 8 preserves every Version 1–7 declaration and adds two stores.
The v7 → v8 migration is additive and performs no business-row transform.

## local_changes

Indexes:

```text
id
mutationId
userId
entityType
entityId
operation
status
occurredAt
[userId+status]
[userId+mutationId]
[userId+entityType]
[entityType+entityId]
```

Rows contain UUID mutation/device identity, local and base-server revision
boundaries, operation, sequence, and acknowledgement status. They contain no
user-authored or localized display text. Pending rows are not physically
deleted in Phase 2.3.

## sync_metadata

Indexes:

```text
id
userId
entityType
entityId
localVersion
serverRevision
lastMutationId
[userId+entityType+entityId]
[userId+lastMutationId]
```

The deterministic primary key is `userId:entityType:entityId`.
`localVersion` mirrors the latest locally committed entity version.
`baseServerRevision` and `serverRevision` remain `null` until a future server
acknowledges a change; Phase 2.3 never synthesizes remote revisions.

Business stores remain the tombstone source of truth. Sync ports may enumerate
`deletedAt != null` rows and read them by id; ordinary repositories still hide
them. Replace restore clears current-user rows from both Phase 2.3 stores but
does not modify browser-local device identity.

# Proposed Supabase Schema (Phase 3.0 Review Only)

This section is a cloud contract proposal. No remote migration has been applied
and no Supabase project is connected.

## Common canonical columns

Every tenant-owned entity uses:

```sql
user_id uuid not null references auth.users(id)
id uuid not null
version bigint not null check (version >= 1)
server_revision bigint not null
last_mutation_id uuid not null
last_modified_by_device_id uuid not null
created_at timestamptz not null
updated_at timestamptz not null
server_changed_at timestamptz not null default now()
deleted_at timestamptz null
primary key (user_id, id)
```

`version` is the cloud row edit count; it is not a copied Dexie version.
`server_revision` is allocated by atomically advancing the owner's locked
`sync_user_state` row and is the incremental sync cursor. Domain timestamps are
preserved, while `server_changed_at` is server-owned. All ownership references
use composite `(user_id, id)` keys. Each canonical table additionally enforces
unique `(user_id, server_revision)`.

Every canonical table has `(user_id, server_revision)`. Active UI-query indexes
may use `where deleted_at is null`; tombstone synchronization must use the
unfiltered owner/revision index.

## Canonical tables

### tasks

Domain fields: `title`, `notes`, `status`, `priority`, `planned_date`, `due_at`,
`project_id`, `focus_date`, `focus_order`, and `completed_at`.

Constraints:

- task status and priority enums match the Domain contract;
- `focus_date` and `focus_order` are both null or both non-null;
- focused rows are `todo` or `doing`, with `focus_order` from 1 through 3;
- partial unique `(user_id, focus_date, focus_order)` where the row is active and
  focused.

### confirmations

This is the remote name for the Waiting entity. Domain fields include `title`,
`notes`, `status`, `person`, `project_id`, `source_task_id`, `sent_at`,
`follow_up_date`, `confirmed_at`, and `closed_at`. Status is only `waiting`,
`confirmed`, or `closed`. `needsFollowUp` is never stored.

### memos

Domain fields: raw `content`, `pinned`, and nullable `project_id`. User content is
stored once and is never localized by the persistence layer.

### routines

Domain fields: `title`, `status`, `schedule jsonb`, `timezone`, and `sort_order`.
The mutation RPC validates the schedule discriminated union and IANA timezone.

### routine_logs

Domain fields: `routine_id`, LocalDate `date`, and `completed_at`. A composite
foreign key points to `(user_id, routine_id)`. Partial unique
`(user_id, routine_id, date)` applies to active rows.

### activities

Domain fields: `event_type`, `entity_type`, `entity_id`, `payload jsonb`,
`device_id`, and `occurred_at`. Payload contains the minimum raw display
snapshot, never a translated sentence. Ordinary update/delete is unavailable;
the mutation RPC is the only append path.

### daily_logs

Domain fields: LocalDate `date`, `summary`, immutable `snapshot jsonb`,
`finalize_timezone`, and `finalized_at`. Partial unique `(user_id, date)` applies
to active rows. The cloud contract exposes no ordinary update or replacement.

### projects (deferred)

Project is currently a Domain reference but has no local Repository or Dexie
table. A future table may use the same common columns plus its eventual Domain
fields. Phase 3 must not enforce project foreign keys or synchronize projects
until that local vertical slice exists.

## Synchronization control tables

### sync_user_state

```text
user_id primary key
last_revision bigint check (last_revision >= 0)
updated_at timestamptz
```

The mutation RPC locks this row and reserves an ordered range for all results in
one mutation. Allocation is isolated per owner and rolls back with the mutation.

### sync_mutations

```text
user_id
mutation_id
device_id
protocol_version
request_hash
status (applied | conflict | rejected)
result
created_at
committed_at
primary key (user_id, mutation_id)
```

The request hash prevents one UUID from being reused for different content. An
identical replay returns the stored structured result.

### sync_mutation_results

```text
user_id
mutation_id
sequence
entity_type
entity_id
operation
server_revision
server_changed_at
primary key (user_id, mutation_id, sequence)
```

This table provides per-entity acknowledgements for multi-entity commands.

### sync_changes

```text
user_id
change_revision bigint
entity_type
entity_id
operation
mutation_id
device_id
record jsonb
changed_at timestamptz
primary key (user_id, change_revision)
```

`change_revision` and the resulting row's `server_revision` are identical. The
immutable canonical record snapshot makes paginated pull deterministic.
Indexes: `(user_id, change_revision)` and `(user_id, entity_type,
change_revision)`.

### sync_device_cursors

```text
user_id
device_id
last_pulled_revision
last_seen_at
retired_at
primary key (user_id, device_id)
```

These rows gate eventual tombstone retention. A device is retired only through
an explicit account/device action.

### sync_conflicts (planned for conflict workflow)

Stores owner, conflict type, entity identity, base/current revisions,
mutation/device provenance, candidate snapshots, status, and resolution
timestamps. It is user data protected by RLS, not a diagnostic log.

## Local Version 9 — Sync Contract Hardening

Version 9 is additive and retains the empty legacy `local_changes` store only
for safe historical schema continuity. New local commands use these stores:

### local_mutations

```text
mutationId
userId
deviceId
commitOrder
occurredAt
entityKeys[]
changes[]
status
acknowledgedAt
entityResults[]
failureCode
[userId+status]
[userId+deviceId+commitOrder]
[userId+deviceId+status]
*entityKeys
```

Each `changes[]` entry preserves operation, local/server base, local result,
causal predecessor, and a complete immutable Domain/tombstone snapshot.

### sync_device_state

One deterministic `userId:deviceId` row stores `lastCommitOrder` and
`lastPulledRevision`. Commit order increments inside the Domain mutation
transaction; Pull cursor advances inside the remote-page transaction.

### sync_conflicts

Stores the conflict taxonomy, local mutation link when present, immutable remote
candidate, entity identity, and resolution status. Conflict records are local
sync state and are not portable backup data.

### sync_bootstrap

One owner row stores `clean`, `requires_bootstrap`, or `bootstrapped`. Version
1–8 data upgrades to `requires_bootstrap`; Restore also sets that state.

### Version 8 → 9 migration

Version 8 `local_changes` cannot be upgraded into formal Mutation Records
because it has no immutable snapshot or causal chain. Migration collects every
known owner, marks each `requires_bootstrap`, clears legacy Outbox and incomplete
sync metadata, and preserves all Domain stores unchanged. It never fabricates
history. The fixture matrix covers Versions 1–8 upgrading to Version 9.

Portable Backup excludes all Version 9 sync infrastructure and device identity.

# Supabase Phase 3.2 Schema

The normative DDL is
`supabase/migrations/20260831000100_phase_3_2_cloud_foundation.sql`.

Canonical tables are `tasks`, `confirmations`, `memos`, `routines`,
`routine_logs`, `activities`, and `daily_logs`. Every row has composite owner
identity, server row `version`, owner-scoped `server_revision`, mutation/device
provenance, entity timestamps, tombstone, and server change time. Projects are
intentionally absent. Focus slots, active RoutineLog day, and active DailyLog
day have partial unique indexes. Activity and DailyLog update/delete are
rejected by immutable triggers in addition to RPC/grant restrictions.

Sync control tables:

- `sync_user_state`: locked owner high-watermark;
- `sync_mutations` / `sync_mutation_results`: payload receipt and per-entity Ack;
- `sync_changes`: immutable ordered pull feed;
- `sync_device_cursors`: future device pull position;
- `sync_conflicts`: future owner-scoped quarantine;
- `sync_bootstrap_sessions` / `sync_bootstrap_chunks`: non-canonical staging.

All public tables enable RLS and expose owner-only SELECT to `authenticated`.
`anon` receives no table or RPC access. Authenticated clients receive no table
INSERT/UPDATE/DELETE grants; canonical writes use authenticated-only RPCs.
