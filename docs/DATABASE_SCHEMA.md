# Daily Work OS Database Schema

Version: 1.4


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
summary
finalizedAt
snapshot
createdAt
updatedAt
deletedAt
version

Snapshot contains immutable end-of-day copies of completed tasks, open tasks,
Waiting items, Memos, and completed Routines, including the labels and context
needed to render history without joining mutable entities. Historical rendering
must use this snapshot rather than mutable live entities.



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
