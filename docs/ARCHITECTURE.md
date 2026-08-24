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

`TodayDashboardQuery` accepts a local date and timezone. It gathers Tasks,
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
