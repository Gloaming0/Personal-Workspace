# Daily Work OS Database Schema

Version: 1.0


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
sentAt
followUpDate
notes
createdAt
updatedAt
completedAt
deletedAt
version



Status:


waiting
need_followup
confirmed
closed



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
active
repeatRule
sortOrder
createdAt
updatedAt



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
createdAt
updatedAt



---

# Activity


Purpose:


Timeline and history.


Table:


activities


Fields:


id
userId
type
entityType
entityId
metadata
deviceId
createdAt



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
