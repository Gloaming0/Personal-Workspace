# Daily Work OS Database Schema

Version: 1.1


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
