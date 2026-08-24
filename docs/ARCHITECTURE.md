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

date

dueDate

projectId

notes

isFocus

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

sentAt

followUpDate

notes

createdAt

updatedAt

completedAt

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

active

repeatRule

sortOrder

createdAt

updatedAt
Routine Log
RoutineLog

id

userId

routineId

date

completedAt
Project
Project

id

userId

name

icon

status

createdAt

updatedAt
Daily Log
DailyLog

id

userId

date

summary

createdAt

updatedAt
Activity
Activity

id

userId

type

entityType

entityId

metadata

deviceId

createdAt
Repository Pattern
All database operations go through repositories.
Example:
taskRepository.ts


createTask()

updateTask()

deleteTask()

getTodayTasks()

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