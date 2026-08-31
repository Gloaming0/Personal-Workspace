# Daily Work OS Architecture

Version: 1.0


# Architecture Philosophy


Daily Work OS follows:

Local-first architecture.

The application should feel instant,
while cloud services provide persistence and synchronization.


Core principle:


User interaction
      ↓
Local update
      ↓
UI update immediately
      ↓
Background synchronization
      ↓
Cloud persistence
      ↓
Other devices update



The user should never wait for the server to use the application.


---

# Technology Stack


## Frontend


Framework:

React


Language:

TypeScript


Build:

Vite



## Styling


Tailwind CSS


Component System:

shadcn/ui


Icons:

Lucide



## State Management


Zustand



## Local Database


IndexedDB


Wrapper:

Dexie.js



## Cloud Backend


Supabase


Including:

- Authentication
- PostgreSQL Database
- Realtime
- Row Level Security



## PWA


vite-plugin-pwa



---

# High Level Architecture


The application consists of:


Presentation Layer
↓
Feature Layer
↓
State Layer
↓
Repository Layer
↓
Data Layer
↓
Sync Layer
↓
Cloud Layer


Each layer has clear responsibility.



---

# Project Structure


Recommended structure:


src/
app/
components/
features/
  today/
  tasks/
  waiting/
  routines/
  memos/
  inbox/
  projects/
  daily-log/
  search/
  settings/
db/
repositories/
sync/
stores/
hooks/
lib/
types/
styles/


---

# Architecture Rules


## Rule 1

Components must not directly access databases.


Wrong:


Component
↓
Supabase


Correct:


Component
↓
Hook
↓
Store
↓
Repository
↓
Database



---

## Rule 2

Business logic should not live inside UI.


Wrong:


```tsx
if(task.status==="done"){
...
}
inside components.
Correct:
Business rules belong to:
features/
or
lib/
Rule 3
Every feature owns its logic.
Example:
Tasks:
features/tasks/

components

hooks

store

types

repository

Avoid:
One giant global file.
Feature Architecture
Each feature should follow:
feature/


components/

hooks/

store/

types.ts

repository.ts

service.ts
Example:
features/tasks/


TaskCard.tsx

useTasks.ts

taskStore.ts

taskRepository.ts

types.ts
Data Architecture
The application has two databases.
Local Database
Purpose:
Fast interaction.
Technology:
Dexie + IndexedDB
Cloud Database
Purpose:
Persistence and synchronization.
Technology:
Supabase PostgreSQL
Data Flow
Creating a Task:
User

↓

Task Input

↓

Task Store

↓

Local Repository

↓

IndexedDB

↓

Sync Queue

↓

Supabase

↓

Realtime

↓

Other Devices
Database Design
All entities share common fields.
Required fields:
id

userId

createdAt

updatedAt

deletedAt

version
Core Entities
Task
Task

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
Confirmation
Confirmation

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
Memo
Memo

id

userId

content

pinned

projectId

createdAt

updatedAt

deletedAt

version
Routine
Routine

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
Routine Log
RoutineLog

id

userId

routineId

date

completedAt

createdAt

updatedAt

deletedAt

version
Project
Project

id

userId

name

icon

status

createdAt

updatedAt

deletedAt

version
Daily Log
DailyLog

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
Activity
Activity

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
Repository Pattern
All database operations go through repositories.
Examples:
TaskRepository


getById()

find()

save()

UI never knows:
- IndexedDB
- Supabase
- SQL
Sync Architecture
Sync is an independent system.
Structure:
sync/


sync-engine.ts

sync-queue.ts

sync-worker.ts

conflict-handler.ts

network-manager.ts

realtime-handler.ts
Sync Principles
Local is primary interaction layer
When user changes data:
Step 1:
Update local database.
Step 2:
Update UI.
Step 3:
Create sync job.
Step 4:
Upload to cloud.
Sync Queue
Every local modification creates:
SyncJob


id

entityType

entityId

operation

createdAt

status

retryCount
Operations:
create

update

delete
Sync Status
Every entity can have:
synced

pending

error
Normally hidden.
Only show when necessary.
Conflict Resolution
Version 1:
Use:
Last Write Wins.
Compare:
updatedAt
Future:
Field-level merge.
Soft Delete
Never immediately remove synced data.
Use:
deletedAt
Reason:
Other devices need to know deletion happened.
Realtime Synchronization
Supabase Realtime listens for:
- Insert
- Update
- Delete
Flow:
Cloud Change

↓

Realtime Event

↓

Validate User

↓

Update Local Database

↓

Refresh UI
Offline Strategy
When offline:
Allowed:
- Create Task
- Complete Task
- Add Memo
- Update Waiting
- Complete Routine
Changes enter:
Sync Queue
When online:
Automatically retry.
Network Handling
Detect:
online

offline
When offline:
Show:
"Offline. Changes will sync later."
Do not block usage.
Authentication Architecture
Use:
Supabase Auth
Supported:
- Email Magic Link
- Google Login
Every record must contain:
userId
Database Security
Supabase Row Level Security required.
Rule:
Users can only access:
userId === auth.uid()
Theme Architecture
Theme is not component logic.
Structure:
styles/


tokens.css


themes/

minimal-light.css

minimal-dark.css

warm-paper.css

nordic-blue.css

sakura.css

forest.css
Components use:
var(--color-token)
Never:
#ffffff
Language Architecture
Supported languages:
- English (en)
- Simplified Chinese (zh-CN)
Structure:
features/settings/

language/

messages.ts

useTranslations.ts

LanguageSwitcher.tsx

All user-facing copy must use typed message keys.
Components must not contain parallel hardcoded translations.
The selected language is stored with user preferences and updates the document language.
State Management
Use Zustand for:
- UI state
- Temporary state
- User preferences
- Cached feature state
Do not use global state for everything.
Date Handling
Use:
date-fns
All dates should consider:
- User timezone
- Locale
Store:
UTC timestamp.
Display:
Local timezone.
Error Handling
Errors should be:
- Recoverable
- User friendly
- Logged
Never expose:
- Database errors
- Stack traces
- Technical messages
Performance Rules
Target:
Initial local load:
<500ms
Interaction response:
<100ms
Quick Capture:
Instant.
Testing Architecture
Required:
Unit Tests
For:
- Business rules
- Date logic
- Sync logic
- Status transitions
Integration Tests
For:
- Database operations
- Repository behavior
- Sync flow
E2E Tests
For:
- Daily workflow
- Offline workflow
- Multi-device workflow
Deployment
Recommended:
Frontend:
Vercel
Backend:
Supabase
Domain:
Custom domain later.
Development Rule
When adding a new feature:
Always consider:
1.
Data model
2.
Local storage
3.
Cloud sync
4.
Mobile layout
5.
Theme support
6.
Testing
A feature is incomplete until all six are considered.
Architecture Final Statement
Daily Work OS should be built as:
A local-first personal application with cloud synchronization.
The architecture should support:
- Fast interaction
- Data safety
- Multi-device usage
- Long-term maintainability
Avoid shortcuts that create future technical debt.


---

# Phase 0.5 Application Foundation

## App Shell

The shell owns navigation, the workspace header, the main content outlet, and
the utility surface. Feature pages render inside the outlet and must not
recreate shell layout.

Responsive contract:

- Desktop (>=1200px): expanded or collapsed sidebar, main workspace, and
  persistent utility panel.
- Tablet (768px–1199px): fixed 72px sidebar, main workspace, and utility drawer.
- Mobile (<768px): main workspace, bottom navigation, and utility drawer.

## Settings Architecture

Settings is organized as independent sections and preference fields. Appearance
and Workspace contain Phase 0.5 controls. Account, Data, Keyboard, and About are
reserved section boundaries for future features.

## Preferences Architecture

`UserPreferences` is the single typed preference contract. The local Zustand
store persists a versioned, validated subset and migrates the legacy appearance
key. Document-level effects (language, resolved theme, density, color scheme,
and browser theme color) are applied through one adapter.

The current model includes language, theme, density, sidebar mode, week start,
and quick-capture default. A future repository may synchronize this same model
without coupling UI components to storage or cloud APIs.


---

# Phase 1.2B Domain and Data Contracts

## Domain Boundary

Domain Entities are `Task`, `Waiting`, `Routine`, `RoutineLog`, `Memo`,
`Project`, `DailyLog`, and `Activity`. They use raw user text and storage-neutral
values. User-authored content must never use `LocalizedText`; UI language
support must not change a user's Task title, Project name, Waiting person, or
Memo content into `{ en, zh-CN }` data.

System copy belongs in typed i18n messages. Dates, relative time, follow-up
labels, Activity sentences, Project display names, counts, Loading, and Empty
states belong to View Models or presentation.

## State Contracts

- Task: `todo | doing | done | later | archived`.
- Waiting: `waiting | confirmed | closed`. `needsFollowUp` is derived from
  `followUpDate` for an open Waiting item and is never persisted.
- Routine: `active | paused | archived`.
- Project: `active | paused | completed | archived`.
- Routine completion is represented by one `RoutineLog` per routine and local
  date.

Legal transitions are defined as compile-time contracts under `src/domain/`.
Feature services validate transitions before repositories persist entities.
The allowed edges are:

- Task: `todo → doing | done | later | archived`; `doing → todo | done | later |
  archived`; `later → todo | doing | done | archived`; `done → todo | archived`;
  `archived → todo`.
- Waiting: `waiting → confirmed | closed`; `confirmed → waiting | closed`;
  `closed → waiting`.
- Routine: `active → paused | archived`; `paused → active | archived`;
  `archived → active`.
- Project: `active → paused | completed | archived`; `paused → active |
  completed | archived`; `completed → active | archived`; `archived → active`.

Self-transitions and every edge not listed above are illegal.

## Repository Ports

Repository interfaces live under `src/repositories/` and expose Domain Entities
only. They do not format UI strings, derive Today sections, validate component
state, or expose Dexie/Supabase types. Optimistic concurrency uses entity
`version` and optional `expectedVersion` write options.

Every Repository read and write is explicitly scoped by `userId`. A caller
must supply the current user for `getById`, query/list, save, append, and
finalize operations. Reads return only entities owned by that user; a write is
rejected when the supplied owner differs from `entity.userId`. Ownership is a
Repository contract and never relies on the local database containing only one
user.

Persisted entities pass lightweight runtime validation when they cross the
Repository boundary. The baseline validates identifiers, ownership, version,
UTC ISO timestamps, strict `LocalDate`, enums, and entity-specific nullable
timestamps. Invalid stored records fail the query instead of silently entering
the Domain layer. In-memory and Dexie adapters share the same create-at-v1,
strict-version-increment, optimistic-concurrency, soft-delete, and ownership
contract.

No database adapter is part of Phase 1.2B.

## Today Query Boundary

```text
Repository Ports
      ↓
Feature Queries
      ↓
TodayDashboardQuery
      ↓
TodayDashboardViewModelAssembler
      ↓
TodayDashboardViewModel
      ↓
Widgets
```

`TodayDashboardQuery` accepts an explicit user, local date, and timezone. It gathers Tasks,
Waiting items, Routines and Logs, Memos, Projects, and Activity through
repository ports. The assembler performs all Today-specific selection,
ordering, project resolution, follow-up derivation, and View Model mapping.

Focus is a maximum-three ordered projection of Tasks using `focusDate` and
`focusOrder`; it is not a repository or entity of its own.

## Daily Log Finalization

End Day creates a `DailyLog` with an immutable snapshot of completed Tasks, open
Tasks, Waiting items, Memos, and completed Routines. Daily Log rendering uses
the snapshot so later entity edits, soft deletion, or synchronization cannot
rewrite work history.

## Responsive Aggregation

The same Today View Model feeds every viewport. Desktop places Check-in and
Quick Memo in the persistent utility panel. Mobile renders those two core
modules inline and reserves the Utility Drawer for secondary Recent Activity
and Upcoming context. Responsive layout never changes Domain queries or entity
identity.


---

# Phase 1.3 Task Vertical Slice

Phase 1.3 activates only the Task path. `InMemoryTaskRepository` implements the
existing storage-neutral `TaskRepository` port and is created once per running
application session. It does not persist across reloads and contains no Dexie,
Supabase, sync, or browser-storage dependency.

Task mutations follow this path:

```text
Today command callback
      ↓
TaskService
      ↓
Task Domain rules
      ↓
TaskRepository port
      ↓
InMemoryTaskRepository
```

The UI never receives a repository. `TaskService` owns Create, Complete,
Reopen, Set Focus, and Remove Focus use cases. Single-entity transition rules
remain pure Domain functions; the service owns the cross-entity maximum-three
Focus invariant and optimistic version hand-off.

Today reads follow this path:

```text
InMemoryTaskRepository ─┐
                       ├→ TodayDashboardQuery
Mock supporting source ┘          ↓
                         View Model Assembler
                                  ↓
                    TodayDashboardViewModel → Widgets
```

Only `plannedTasks` and `focusTasks` are backed by Domain entities in this
phase. Waiting, Routine/Check-in, Memo, and Activity remain behind the explicit
`TodaySupportingViewModelSource` mock boundary. This source is transitional:
future vertical slices replace each supporting View Model fragment with
repository-backed feature queries without changing Widget inputs.

Focus is derived from eligible `todo` or `doing` Tasks. Completing a Task sets
`completedAt` and clears `focusDate`/`focusOrder`; reopening returns it to
`todo` and clears `completedAt`. Moving to `later` or `archived` uses the same
Domain normalization and cannot preserve Focus.

At Phase 1.3 the maximum-three check was sufficient for one application
command runtime. Phase 2.1B subsequently moved Focus allocation into an atomic
Unit of Work, and Phase 2.1D verifies that invariant with separate Dexie
connections.


---

# Phase 1.4 Task Local Persistence

Phase 1.4 replaces only the production Task adapter. `Task`, its Domain
transitions, `TaskService`, `TaskRepository`, `TodayDashboardQuery`, the View
Model Assembler, and Widget inputs are unchanged. `InMemoryTaskRepository`
remains available for isolated Domain and UI tests.

```text
TaskService / TodayDashboardQuery
              ↓
       TaskRepository port
              ↓
       DexieTaskRepository
              ↓
DailyWorkDatabase.tasks (IndexedDB)
```

`DailyWorkDatabase` uses the stable name `daily-work-os`. Schema version 1
creates only the `tasks` table and its Task query indexes. Version declarations
are append-only: a future migration adds a higher version and optional upgrade
function without editing or removing version 1.

The production Task Runtime is shared for the application session, explicitly
opens the database, and exposes only the repository port, `TaskService`, and an
initialization promise to the Today container. Initialization and storage
failures are translated into a localized UI error; UI components never import
Dexie or the database class.

Writes run inside a Dexie read-write transaction. Existing rows require the
caller's `expectedVersion` to match and the persisted entity version to equal
the previous version plus one. New rows start at version 1. UUID generation and
UTC timestamps remain TaskService/Domain responsibilities, while `plannedDate`
and `focusDate` remain local calendar dates.

Soft-deleted Task rows remain in IndexedDB for future recovery/sync semantics,
but `getById` and every `find` query exclude `deletedAt != null`. No physical
delete is exposed by the Task Repository port.

This section describes the Phase 1.4 boundary. Phase 2.1B subsequently made the
Focus query/write/Activity sequence atomic, and Phase 2.1D added local
cross-tab invalidation without moving the rule into Widgets.

Waiting, Memo, Routine, Activity, cloud sync, realtime, and sync queues remain
outside this phase. The existing supporting Mock View Model source is
unchanged.


---

# Phase 1.5 Waiting Vertical Slice

Phase 1.5 activates Waiting without changing the stable Task Domain,
TaskService, TaskRepository, Task projection, or Task Widget boundaries.

```text
Waiting UI command
      ↓
WaitingService
      ↓
Waiting Domain rules
      ↓
WaitingRepository port
      ↓
DexieWaitingRepository
      ↓
DailyWorkDatabase.confirmations

TaskRepository + WaitingRepository + ProjectNameResolver
      ↓
TodayDashboardQuery
      ↓
TodayDashboardViewModelAssembler
      ↓
Waiting View Model → Waiting Widget
```

`DailyWorkDatabase` retains Version 1 unchanged and appends Version 2 with the
`confirmations` table. Opening an existing Version 1 database performs an
additive schema upgrade; Task rows need no transform and remain intact.

Waiting persists only `waiting | confirmed | closed`. Confirm writes
`confirmedAt`; Close writes `closedAt`; Reopen starts a new waiting lifecycle
and clears both lifecycle timestamps. Create and edit preserve raw user text,
optional `projectId`, and optional `sourceTaskId`. Soft-deleted entities remain
stored but are invisible to repository business reads.

`TodayDashboardQuery` reads `waiting` and `confirmed` entities; closed items do
not appear on Today. The assembler resolves project display names through the
aggregation-level `TodayProjectNameResolver`, derives `needsFollowUp` from the
requested local date, and orders due follow-ups first. Neither the Domain nor
IndexedDB stores `needsFollowUp`.

Create, edit, follow-up date changes, Confirm, Close, and Reopen are owned by
`WaitingService`. The Widget receives only Waiting View Models plus command
callbacks and never imports a repository or Dexie.

Memo, Routine/Check-in, and Activity remain in the supporting Mock View Model
source. No independent Waiting page, Supabase, realtime, sync queue, or cloud
adapter is part of this phase.


---

# Phase 1.6 Memo and Routine Vertical Slices

Phase 1.6 removes Memo and Check-in from the supporting Mock boundary. Activity
is now the only fragment supplied by `TodaySupportingViewModelSource`.

```text
Memo UI command                    Routine UI command
      ↓                                  ↓
MemoService                       RoutineService
      ↓                                  ↓
Memo Domain rules          Routine / RoutineLog rules
      ↓                                  ↓
MemoRepository ports       RoutineRepository + RoutineLogRepository
      ↓                                  ↓
DexieMemoRepository        DexieRoutineRepository / DexieRoutineLogRepository
      └──────────────────┬───────────────┘
                         ↓
                TodayDashboardQuery
                         ↓
          TodayDashboardViewModelAssembler
                         ↓
            Quick Memo / Check-in Widgets
```

`DailyWorkDatabase` preserves Versions 1 and 2, appends Version 3 for `memos`,
and appends Version 4 for `routines` and `routine_logs`. All upgrades are
additive. Task and Waiting adapters, ports, Domain rules, and Widget projections
are unchanged.

Memo Create, Edit, Pin, Unpin, and Soft Delete belong to `MemoService`. The
Quick Memo selection boundary belongs to Today aggregation: the newest pinned
Memo wins; otherwise the newest Memo updated on the requested local date wins.
The assembler resolves its optional Project display name without storing it on
the Memo entity.

Routine lifecycle commands belong to `RoutineService`. Only `active` Routines
are queried for Today, and the query applies `daily`, `weekdays`, or `weekly +
daysOfWeek` schedule rules to the requested `LocalDate`. The input date is the
calendar date in the supplied Today timezone, so schedule evaluation does not
depend on the browser's UTC day.

Routine completion is modeled as an independent `RoutineLog`. Complete is
idempotent for an existing effective log. Undo soft-deletes that log; no
`completed: false` record exists. The RoutineLog adapter enforces at most one
non-deleted log per `[userId+routineId+date]` inside its write transaction.
Today left-joins scheduled Routines and that date's effective logs to produce
Check-in View Models.

`TodayWorkspaceProvider` owns the shared query state and command callbacks for
both the main Today workspace and the App Shell utility panel. Desktop and
Mobile therefore consume the same repository-backed View Model and refresh
after the same Service commands. Widgets still receive only View Models and
callbacks; no component imports Dexie or a Repository.

No independent Notes or Routine management page, Activity persistence,
DailyLog, End Day, Supabase, realtime, or sync queue is introduced in this
phase.


---

# Phase 1.7 Activity and Today Full Real Data

Phase 1.7 removes `TodaySupportingViewModelSource` and the final Activity Mock.
Every Today section now originates from a Domain Entity through a Repository
port.

```text
Task / Waiting / Memo / Routine UI commands
                  ↓
             Feature Services
             ↙            ↘
Entity Domain + Repository   ActivityService
                                  ↓
                         ActivityRepository.append
                                  ↓
                    DexieActivityRepository (v5)

Task + Waiting + Memo + Routine + RoutineLog + Activity Repositories
                                  ↓
                         TodayDashboardQuery
                                  ↓
                 TodayDashboardViewModelAssembler
                                  ↓
                             Today Widgets
```

Services emit Activity only after the primary entity write succeeds. The UI
never receives `ActivityRepository` and does not construct events. Production
wiring shares one `ActivityService` across Task, Waiting, Memo, and Routine
services.

Activity is an immutable, append-only event. The port intentionally has no
update or delete method, and adapters reject duplicate IDs. Payload stores raw
historical snapshot fields (`title`, `entityId`, and optional `projectId`) but
never a translated sentence. Activity entities retain their original user text
when UI language changes.

`TodayDashboardQuery` requests the newest 10 events ordered by `occurredAt`.
The View Model Assembler maps `eventType` to a typed i18n message, interpolates
the raw payload for the requested language, and returns final display text to
the Recent Activity Widget. The Widget handles icon and relative-time
presentation only; it does not translate or interpret event payloads.

`DailyWorkDatabase` appends Version 5 with `activities`, retaining Versions
1–4 unchanged. The upgrade is additive and preserves Task, Waiting, Memo,
Routine, and RoutineLog data.

Activity persistence completes the local real-data path for Today. DailyLog,
End Day, Supabase, realtime, sync queues, and cloud synchronization remain
outside this phase.

---

# Phase 1.8 End Day and Daily Log

End Day adds a separate close-out query and orchestration boundary without
changing `TodayDashboardQuery` or Widget data access:

```text
EndDayFlow
    ↓ preview / finalize command
EndDayService ──→ TaskService (Tomorrow / Later / Delete)
    ↓                         ↓
EndDayQuery             TaskRepository
    ↓
Task / Waiting / Memo / Routine / RoutineLog repository ports
    ↓ snapshot assembler after successful Task commands
DailyLogRepository.finalize
    ↓
DexieDailyLogRepository (database.version(6))
```

`EndDayQuery` collects live data only while preparing finalization. The Service
copies raw titles/content, statuses, people, dates, Project display names, and
scheduled Routine completion results into `DailyLogSnapshot`. Historical
consumers read this snapshot directly and never reassemble it from mutable
entities.

The `DailyLogRepository` port intentionally exposes only `findByDate` and
`finalize`. Both in-memory and Dexie adapters clone values at the boundary and
reject a second finalized log for `[userId+date]`; no reopen/update contract is
present. End Day preflights that uniqueness before Task commands, runs every
Tomorrow/Later/Delete mutation through `TaskService`, and writes the log only
after those commands succeed. A failure can leave already successful Task
commands visible, but it cannot create a partial Daily Log; cross-repository
rollback is deferred until a future Unit of Work is justified.

After finalization the Service records `daily_log_finalized` through
`ActivityService`. Activity is secondary to the authoritative immutable log,
so an Activity write failure does not misreport the completed finalization.
Supabase, realtime, sync queues, Morning Review, and log replacement remain
outside Phase 1.8.

# Phase 2.1A Ownership and Repository Contract Hardening

All local Repository ports are user-scoped. Services and feature queries carry
the calling `userId` from the use-case input through to every Repository call;
Today, End Day, and Morning Review never query globally and filter afterward.
Writes validate both the entity and `entity.userId === callingUserId` before
persisting. An existing row with the same id but another owner cannot be read or
overwritten.

`src/repositories/validation.ts` is the lightweight storage-boundary validator.
It deliberately avoids a framework dependency and rejects malformed persisted
identifiers, versions, UTC timestamps, local dates, enums, schedules, and
entity-specific timestamp fields. Services continue to generate UUIDs for new
production entities; the validator also accepts non-empty stable legacy/test
identifiers so existing Phase 1 fixtures remain readable.

The shared Repository contract suite runs the same ownership, version,
optimistic concurrency, soft-delete, and visibility cases against In-memory and
Dexie Task, Waiting, Memo, Routine, and RoutineLog adapters. DailyLog retains
its immutable finalize-only contract. Activity remains append-only, exposes no
ordinary update/delete method, and excludes `deletedAt != null` from business
queries; the tombstone field is retained only for future synchronization
compatibility.

This hardening does not introduce a Unit of Work, cross-store transactions,
multi-tab observation, cloud persistence, or synchronization.

# Phase 2.1B Atomic Command Boundaries

`UnitOfWork` is a storage-neutral application port. A Feature Service declares
the stores required by one command and receives transaction-scoped Repository
ports; Domain code and UI code never import Dexie or a transaction type from a
storage library.

```text
UI command
    ↓
Feature Service
    ↓ execute([stores], command)
UnitOfWorkTransaction ──→ transaction-scoped Repository ports
    ├─ DexieUnitOfWork: one IndexedDB read-write transaction
    └─ InMemoryUnitOfWork: serialized command + snapshot rollback
```

The supported scope includes Task, Waiting, Memo, Routine, RoutineLog,
DailyLog, and Activity. A Service participating in an existing Unit of Work
must reuse its transaction token; it must not open a nested transaction or use
the runtime Repository instance directly. Dexie creates scoped Repository
adapters over the active transaction tables. The In-memory adapter serializes
commands and restores all participating Repository snapshots on failure so its
observable commit/rollback behavior matches production.

Every existing command that produces Activity now saves the Entity and appends
the event in one atomic boundary. Activity failure rejects the command and
rolls back the Entity. Focus assignment reads all active Focus Tasks, selects a
free order from 1–3, saves the Task with `expectedVersion`, and appends Activity
inside one Task/Activity transaction. Concurrent local commands therefore
cannot claim the same order or exceed three Focus Tasks.

End Day finalization is one transaction covering its live snapshot reads, all
Tomorrow/Later/Delete Task decisions, immutable DailyLog insertion, and the
`daily_log_finalized` Activity. This supersedes the Phase 1.8 temporary
partial-success behavior: any Task, DailyLog, Activity, or version failure now
rolls back the entire finalize command. The four-step UI remains preparatory
and performs no Task writes before Finalize.

`FinalizeEndDayInput.commandId` is the local idempotency key and is also the new
DailyLog id. Retrying the same command for the same user/date returns the
existing log before applying decisions or appending Activity. A different
command for an already-finalized user/date is rejected. This reuses the v6
DailyLog schema and `[userId+date]` uniqueness contract, so no Dexie schema
version is added.

This phase does not add multi-tab observation, cloud sync, Realtime, Sync
Queue, or a new date policy.

# Phase 2.1C Database Recovery and Date Policy

Each `DailyWorkDatabase` owns an observable `DatabaseRuntimeState` with six
states: `opening`, `ready`, `blocked`, `unavailable`, `recovery-required`, and
`read-only`. Database bootstrap, Dexie `blocked`/`versionchange` events, and
storage errors update this state before the Today UI decides what to render.
Today never converts a rejected Query into an empty View Model: unavailable
states render a localized recovery panel and Retry action. Quota exhaustion
enters read-only recovery mode, where valid data remains visible but mutation
controls are disabled.

Diagnostics contain only `databaseVersion`, `storeName`, `errorCategory`, and
UTC `timestamp`. They never include Entity values, user text, stack traces, or
raw error messages. Repository list boundaries validate rows individually;
malformed rows are excluded and recorded as `corrupt-record`, while valid rows
from the same query continue into Domain aggregation. Direct Entity reads and
writes still reject structurally invalid values.

The Date Policy is defined by `src/domain/time.ts`:

- `Instant` is a canonical UTC ISO timestamp.
- `LocalDate` is a calendar-valid `YYYY-MM-DD` string. Addition, comparison,
  weekday, and difference operations use UTC calendar components and never
  parse a LocalDate in the host timezone.
- `Instant → LocalDate` always requires an explicit IANA timezone.
- Routine schedule membership and RoutineLog date use each Routine's stored
  timezone. Travel or a different device timezone does not silently move the
  Routine calendar day.
- Morning Review derives the user's current LocalDate from its explicit
  timezone and computes yesterday with pure LocalDate arithmetic.
- End Day filters completion Instants using its explicit finalize timezone.

Dexie Version 7 preserves Versions 1–6 and adds `DailyLog.finalizeTimezone`.
New logs persist the End Day timezone. The v6 → v7 migration assigns `UTC` to
legacy rows because their original timezone was never stored; this deterministic
fallback avoids guessing from the upgrading device. No other store or index is
changed.

This phase does not add cloud recovery, Supabase, Sync Queue, Realtime,
multi-tab observation, or cloud revisions.

# Phase 2.1D Multi-tab and Migration Hardening

Each `DailyWorkDatabase` owns a `LocalChangeCoordinator`. Repository adapters
report committed mutations as content-free invalidations containing only
`store`, `entityId`, `entityVersion`, and a locally generated `revision`.
`BroadcastChannel` transports those invalidations between tabs for Task,
Waiting, Memo, Routine, RoutineLog, Activity, and DailyLog. A per-tab source id
and seen-revision set prevent self-echo and rebroadcast loops.

Transaction-scoped repositories collect invalidations during a Unit of Work;
`DexieUnitOfWork` publishes them only after the IndexedDB transaction commits.
A rollback therefore produces neither durable data nor a misleading broadcast.
The application-level Today container subscribes to the coordinator, debounces
bursts, and reruns `TodayDashboardQuery`. Widgets and UI components do not know
about BroadcastChannel, Dexie, or repository types.

Editable Today View Models carry the source entity version. UI commands pass
that version to the Feature Service, which compares it after loading the
current entity. A stale command raises `RepositoryVersionConflictError`; the
container reloads the latest View Model and shows localized safe copy. Fields
are never auto-merged or silently overwritten.

Startup integrity checking validates all rows and then checks effective
cross-row invariants: unique Focus slots with at most three entries per
user/date, one non-deleted RoutineLog per user/routine/date, and one
non-deleted DailyLog per user/date. Corrupt individual rows are isolated and
diagnosed; invariant violations enter `recovery-required`. Neither path makes a
destructive repair.

The migration fixture suite opens realistic Version 1–6 databases and upgrades
each directly to Version 7. Fixtures cover multiple records, Unicode, nulls,
tombstones, Activity payloads, and immutable DailyLog snapshots. Upgrade
failure, blocked upgrade recovery, and versionchange closure are tested. Phase
2.1D changes no persisted field or index, so the current schema remains Version
7 and no new Dexie version is declared.

# Phase 2.2 Backup, Export, and Restore

Portable backup uses a dedicated storage-neutral boundary:

```text
Settings Data UI
      ↓
BackupService ──→ Backup Format v1 validator
      ↓
BackupRepository port
      ↓
DexieBackupRepository
      ↓
one current-user read / one seven-store replace transaction
```

`BackupRepository.readAll(userId)` is the only local read path that intentionally
includes tombstones. It returns Domain-shaped collections and never leaks Dexie
store names into the portable contract. `BackupService` validates those values,
adds format metadata, serializes UTF-8 JSON, and never mutates an Entity.

Import parsing, ownership, entity, reference, snapshot, payload, and cross-row
invariant validation run before any write. Restore first sends a newly exported
current-state backup to the safety-download sink. Only after that succeeds does
`replaceAll` open one Dexie transaction across Task, Waiting, Memo, Routine,
RoutineLog, Activity, and DailyLog. It removes and replaces only the requested
user's rows, validates the transaction readback, and commits all stores or none.

After commit the adapter publishes one content-free invalidation per affected
store. Today and other live queries refresh through the existing Phase 2.1D
coordinator, including other tabs. Failed restores publish nothing. Backup
downloads, recent-export device metadata, and selected files remain outside the
Domain and are never included in another backup.

The long-term wire contract is maintained independently in
`docs/BACKUP_FORMAT.md`. Phase 2.2 does not change IndexedDB schema Version 7.

# Phase 2.3 Sync Readiness Foundation

Sync readiness adds no network path. `DeviceIdentityStore` owns one UUID per
browser profile outside Domain data. `UnitOfWorkTransaction.mutation(userId)`
provides one stable command identity and device provenance to Activity creation
and the durable journal. `executeMutation` lets a future application command
provide the same UUID again on retry without exposing storage details.

Dexie Version 8 preserves Versions 1–7 and adds `local_changes` plus
`sync_metadata`. Every transaction-scoped Repository reports its committed
entity operation to `DexieUnitOfWork`. Before commit, the Unit of Work writes:

```text
Domain Entity mutation
  + Activity append (when defined)
  + SyncMetadata update
  + LocalMutationChange append
```

All four effects commit or roll back together. Multi-tab invalidation still
publishes only after commit and remains distinct from the durable journal.
In-memory Unit of Work uses snapshot diffing and an optional mutation journal
to test the same atomic/idempotent behavior.

`SyncRepository` is the only future Sync Engine storage boundary. Its Dexie
adapter can list pending changes and tombstones, read deleted entities, inspect
revision metadata, acknowledge a mutation, and apply a validated remote change.
Remote apply enforces ownership, remote-base checks, immutable DailyLog rules,
and Focus/RoutineLog/DailyLog invariants; it never silently applies Last Write
Wins.

Portable Backup v1 intentionally excludes device identity, mutation journal,
and sync metadata. Replace restore clears the current user's non-portable sync
state inside the same restore transaction while retaining the browser profile's
device identity. The complete protocol, conflict taxonomy, and anonymous owner
migration proposal live in `docs/SYNC_PROTOCOL.md`.

# Phase 3.0 Supabase Cloud Architecture Review

Phase 3.0 adds a reviewed cloud boundary only. It does not add a Supabase SDK,
authentication, HTTP traffic, Realtime subscription, or change any local
business behavior.

The future runtime keeps Dexie as the UI-facing source of truth:

```text
UI / Feature Services
        ↓
Local Domain + UnitOfWork
        ↓
Dexie entities + Activity + Outbox
        ↓
storage-neutral Sync Engine
        ↓
versioned Supabase RPC
        ↓
PostgreSQL canonical rows + receipts + revision feed
```

Cloud writes never bypass the RPC. The RPC validates authenticated ownership,
the exact base server revision, immutable history, and cross-row invariants,
then atomically commits canonical rows, mutation receipts, and change-feed
entries. PostgreSQL assigns owner-scoped ordered revisions by locking that
owner's revision-state row; local entity versions remain a separate device-local
optimistic-concurrency concept.

Pull applies an ordered revision page and advances its local cursor in one
transaction. Push groups durable journal records by logical `mutationId` and
acknowledges every resulting entity revision, rather than assigning one revision
to an entire multi-entity mutation. Realtime is only a content-free invalidation
hint that schedules the same cursor-based pull path.

Initial bootstrap is an explicit state machine. Local-to-account adoption uses
a verified safety backup, reversible local ownership checkpoint, server staging,
and an idempotent atomic server commit. When both local and cloud contain data,
the application stops for a user decision and does not merge automatically.

Phase 3.1 hardens the local Outbox with immutable post-mutation snapshots,
durable commit order, causal predecessor information, per-entity
acknowledgements, and an atomic pull-page/cursor port. These changes are sync
infrastructure only and use Dexie Version 9.

The normative protocol, schema constraints, conflict matrix, tombstone
lifecycle, RLS design, and retry taxonomy are in `docs/SYNC_PROTOCOL.md` and the
proposed cloud table details are in `docs/DATABASE_SCHEMA.md`.

# Phase 3.1 Local Sync Contract Hardening

The Unit of Work now records one `LocalMutationRecord` per logical command. Its
raw Domain snapshots are captured from committed Repository writes inside the
same transaction; later entity edits cannot mutate prior records. Multiple
writes to one entity in a Unit of Work collapse to its final snapshot while
preserving the earliest local base.

`sync_device_state` allocates a per-user/device `commitOrder` in that same Dexie
transaction. IndexedDB rollback restores both data and sequence state, and a
new connection resumes from the persisted counter. Push candidates are ordered
only by this value.

Each entity change links to the prior local mutation from `SyncMetadata`.
Consequently, a second offline edit is not Push-ready until its predecessor is
acknowledged. Conflict or permanent failure blocks the causal successor without
rewriting its snapshot.

Acknowledgements contain one remote revision/version per entity. They advance
remote metadata idempotently while preserving a later local version,
`lastMutationId`, and device provenance. A matching direct causal successor is
safely rebased to the acknowledged revision using its stored version edge. End
Day remains one record containing all Task decisions, immutable DailyLog, and
Activity snapshots.

`SyncRepository.applyRemotePage` is the sole Pull write boundary. One Dexie
transaction applies non-conflicting entities, updates sync metadata, persists
conflict candidates, and advances the device cursor. Unexpected failure rolls
back the page; expected intersections quarantine their candidate and may advance
the page safely. Page replay at an already committed revision is a no-op.

Version 9 adds `local_mutations`, `sync_device_state`, `sync_conflicts`, and
`sync_bootstrap`. Version 1–8 upgrades preserve all Domain data but never invent
snapshots for the incomplete Version 8 Outbox. Known owners become
`requires_bootstrap`. Replace Restore clears transport state, preserves device
identity and commit monotonicity, and also requires bootstrap.

Phase 3.1 contains no Supabase dependency, authentication, RPC, Realtime, or
network request. Dexie remains the only runtime persistence implementation.

# Phase 3.2 Supabase and Auth Foundation

The browser now has an optional cloud composition root. Missing Supabase
environment configuration leaves the local-first application fully usable.
When configured, `SupabaseAuthGateway` owns session restore, Magic Link, and
local sign-out; `AuthProvider` exposes identity state without adding Auth to the
Domain model. `RuntimeIdentity` distinguishes `local-anonymous` from
`authenticated`, and cloud ownership always comes from the active session.

Feature/UI code depends on `CloudSyncPort`, not the Supabase client. The adapter
offers discovery, watermark, page reads, mutation submission/result lookup, and
bootstrap begin/chunk/commit. It does not schedule synchronization. Bootstrap
Discovery reads local state as `local-user`, cloud state as the authenticated
owner, and the local bootstrap marker, then returns a decision without writes.

PostgreSQL is the canonical security/transaction boundary: business tables are
owner-selectable under RLS but deny browser DML. Versioned security-definer RPCs
use an empty search path, explicit qualified objects, authenticated-only grants,
payload/ownership checks, mutation locks, and per-user revision locking.
Optimistic base-revision conflicts are converted to PostgREST `PT409` only at
the public RPC boundary; entity, receipt, change-feed, and revision writes still
share one rollback boundary. Bootstrap commit checks every canonical store, not
only the change feed, before accepting an initial workspace.

# Phase 3.3 Bootstrap Composition

The cloud composition root supplies a storage-neutral `BootstrapCoordinator`.
It depends on `BootstrapLocalPort`, `CloudSyncPort`, `BackupService`, and
`DeviceIdentityProvider`; React depends only on the coordinator and its
decision/progress model.

`DexieBootstrapRepository` owns every destructive local boundary. Checkpoint
creation, Domain owner rewrite, and sync-metadata rewrite share one transaction.
Cloud replacement and server-result finalization are separate atomic
transactions. Cross-tab invalidation is published only after success.

```text
safety backup -> ownership checkpoint -> deterministic chunks
              -> server commit -> local metadata/cursor finalize
```

Before server commit an explicit cancel may restore the checkpoint exactly.
After commit rollback is forbidden; retry reuses the same durable bootstrap
session. Download restore uses the revision feed as a full authoritative
snapshot but does not start an incremental sync loop.
