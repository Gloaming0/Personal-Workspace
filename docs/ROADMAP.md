# Daily Work OS Roadmap

Version: 1.0


# Roadmap Philosophy


Daily Work OS should be developed incrementally.

The priority is not:

"Build every possible feature."

The priority is:

"Create a product users want to open every day."


Development order:


1. Core daily workflow

2. Data persistence

3. Multi-device experience

4. Product polish

5. Intelligence features



---

# Development Principles


## Validate before expanding


Every phase should answer:


"Would users naturally use this every day?"


If not:

Do not add complexity.


---

## Build foundations before features


Important foundations:

- Data model
- Design system
- Architecture
- Sync system


should be stable before adding advanced features.


---

# Phase 0

# Project Foundation


Status:

Initial


Goal:

Create a stable development foundation.


---

## Tasks


### Repository Setup


Create:


README.md
docs/
src/
public/


---

### Documentation


Complete:


PRODUCT.md
DESIGN_SYSTEM.md
ARCHITECTURE.md
DEVELOPMENT_RULES.md
ROADMAP.md


---

### Development Environment


Setup:


- React
- TypeScript
- Vite
- Tailwind
- shadcn/ui
- ESLint
- Prettier


---

### Theme Foundation


Implement:


- Design tokens
- Theme switching system
- Basic theme files


Available themes:


- Minimal Light
- Minimal Dark
- Warm Paper
- Nordic Blue
- Sakura
- Forest



---

# Phase 1

# Desktop Workspace MVP


Status:

Complete — local-first MVP accepted through Phase 1.9

Priority: Highest


Goal:

Create a usable personal work desk.


---

## Core Features


### Application Layout


Implement:


- Sidebar
- Main workspace
- Utility panel


Support:


- Desktop layout
- Basic responsive behavior


---

### Today Dashboard


Implement:


- Date display
- Focus area
- Today's tasks
- Waiting section
- Daily check-in
- Quick memo

Current implementation status:

- Task, Waiting, Memo, Routine, and Activity use real local Domain/Repository
  data.
- IndexedDB migrations are implemented and fixture-tested through schema
  Version 7.
- Recent Activity is append-only and localized from raw event payloads at the
  View Model boundary.
- End Day persists immutable DailyLog snapshots, and Morning Review handles the
  previous local date's effective unfinished Tasks without duplication.
- Supabase, Realtime, Sync Queue, and the remaining standalone module pages are
  not part of Phase 1.


---

### Task Module


Support:


- Create task
- Complete task
- Edit task
- Delete task
- Priority
- Due date
- Focus selection


---

### Waiting Module


Support:


- Create waiting item
- Update status
- Follow-up date
- Complete confirmation


---

### Memo Module


Support:


- Quick notes
- Auto save
- Pin
- Delete


---

### Daily Check-in


Support:


- Create routines
- Complete routines
- View completion status


---

# Phase 1 Success Criteria


User can:


1.

Open the application.


2.

Understand today's priorities within 3 seconds.


3.

Create a task within 10 seconds.


4.

Create a memo within 5 seconds.


5.

Track waiting responsibilities.


6.

Finish daily review.


---

# Phase 2

# Local First Application


Status:

After MVP


Goal:

Make the app reliable as a personal tool.


---

## Implement


### Local Database


Add:


- IndexedDB
- Dexie.js


---

### Data Layer


Create:


- Repository pattern
- Local persistence
- Data migrations


---

### Offline Capability


Support:


- Create data offline
- Modify data offline
- Delete data offline


---

### Data Export


Implement:


Export JSON


Purpose:


Users own their data.


---

# Phase 2 Success Criteria


User can:


- Close browser
- Reopen later
- Keep all data


User can:

- Work without internet
- Export personal data


---

# Phase 3

# Account and Cloud Storage


Status:

After local reliability


Goal:

Enable multi-device usage.


---

## Implement


### Authentication


Support:


- Email login
- Google login


---

### Cloud Database


Implement:


Supabase PostgreSQL


Tables:


- Tasks
- Waiting
- Memo
- Routine
- Projects
- Daily Logs
- Activity


---

### Security


Implement:


- Row Level Security
- User isolation


---

# Phase 4

# Multi-device Synchronization


Status:

Major milestone


Goal:

Same experience across devices.


---

## Implement


### Sync Engine


Support:


- Local changes queue
- Upload
- Download
- Retry


---

### Realtime


Support:


Computer changes:

↓

Phone updates


Phone changes:

↓

Computer updates


---

### Conflict Handling


Version 1:


Last Write Wins


Based on:


updatedAt


---

### Sync Status


Support:


- synced
- pending
- error


---

# Phase 4 Success Criteria


Scenario:


Computer:

Create task.


Phone:

Receives task.


Phone:

Completes task.


Computer:

Receives completion.



---

# Phase 5

# Mobile and PWA Experience


Status:

After synchronization


Goal:

Make Daily Work OS feel like a real application.


---

## Implement


### PWA


Support:


- Install on desktop
- Add to home screen
- Standalone mode
- Offline shell


---

### Mobile Navigation


Implement:


Bottom navigation:


Today
Inbox
-
Notes
More


---

### Mobile Quick Capture


Optimize:


- Create task
- Create memo
- Create waiting item


---

### Touch Optimization


Ensure:


- 44px touch targets
- Swipe support where useful
- No hover dependency


---

# Phase 5 Success Criteria


User can comfortably use the product:


- Desktop
- Laptop
- Tablet
- Mobile


---

# Phase 6

# Productivity Enhancement


Status:

Future


Goal:

Improve daily workflow.


---

## Features


### Command Palette


Support:


- Search
- Create
- Navigate
- Settings


Shortcut:


Cmd/Ctrl + K


---

### Keyboard Workflow


Support:


N
New Task
M
New Memo
W
New Waiting
E
End Day


---

### Better Timeline


Improve:


- Activity history
- Work review
- Search


---

### Widget Customization


Allow:


- Show/hide widgets
- Rearrange dashboard


Avoid:


Full dashboard builder.


---

# Phase 7

# AI Work Assistant


Status:

Future


Goal:

Use AI to reduce repetitive organization.


---

## AI Principles


AI should:


Organize existing work.


AI should not:


Become another task users manage.


---

## Potential Features


### Daily Summary


Generate:


- Completed work
- Pending work
- Tomorrow focus


---

### Automatic Work Report


Generate:


Daily report

Weekly report


---

### Smart Follow-up


Detect:


- Forgotten waiting items
- Overdue tasks
- Important notes


---

### Voice Capture


Convert:

Voice

↓

Memo

↓

Task


---

# Phase 8

# Advanced Integrations


Status:

Long term


Possible:


## Calendar


Integration with:

- Google Calendar
- Outlook Calendar


---

## Communication


Possible:


- Email
- Slack
- Teams


---

## External Tools


Possible:


- Jira
- Notion
- GitHub


---

# Features Explicitly Not Planned


Do not add unless product direction changes.


## Team Collaboration


Avoid:


- Team workspace
- Comments
- Mentions
- Chat


---

## Enterprise Features


Avoid:


- Permission management
- Admin dashboard
- Organization hierarchy


---

## Complex Project Management


Avoid:


- Sprint
- Epic
- Story points
- Velocity


---

## Gamification


Avoid:


- Levels
- Badges
- Rewards
- Streak pressure


---

# Current Development Priority

## Phase 1.8 — Complete

End Day now closes the local daily workflow through a four-step responsive
flow. Task carry-forward decisions use `TaskService`; Daily Logs are immutable
snapshots persisted by additive Dexie Version 6; duplicate finalization is
rejected; and the timeline receives `daily_log_finalized`. A minimal read
contract (`findByDate`) exists for necessary future viewing without introducing
a complex history dashboard.

Phase 1.8 does not include Morning Review, Supabase, Realtime, Sync Queue, or an
explicit reopen/replace workflow.

## Phase 1.9 — Complete

Phase 1 MVP acceptance verified the complete local Dexie workflow in a real
browser: Task/Focus/state changes, Waiting follow-up, pinned Memo, Routine
Check-in, localized Activity, End Day, immutable DailyLog, refresh persistence,
six themes, bilingual UI, responsive viewports, and keyboard focus behavior.

Morning Review now presents only yesterday's effective `todo`/`doing` Tasks,
supports Move to Today/Later/Done/Delete, Move All, and non-mutating Skip, and
uses a lightweight device-local seen-date marker instead of a new Domain
Entity. Date selection follows the active IANA timezone. Desktop/Tablet use a
centered Dialog and Mobile uses a full-screen Sheet. Phase 1 closes without
Supabase, Realtime, Sync Queue, or cloud synchronization.

## Phase 2.1 — Local Data Reliability Complete

- 2.1A: explicit user ownership, shared Repository contracts, validation, and
  Activity tombstone semantics.
- 2.1B: storage-neutral Unit of Work, atomic Entity/Activity writes, concurrent
  Focus allocation, atomic/idempotent End Day finalization, and failure
  injection.
- 2.1C: observable database runtime/recovery states, corrupt-row isolation,
  unified Instant/LocalDate/timezone policy, and schema Version 7
  `DailyLog.finalizeTimezone` migration.
- 2.1D: BroadcastChannel-based local invalidation, stale-version conflict
  recovery, two-connection invariant tests, Version 1–6 fixture upgrades to
  Version 7, migration failure/blocked recovery, and non-destructive startup
  integrity checks.

No Supabase, cloud Realtime, Sync Queue, backup/import, or new business feature
is included. Phase 2.2 remains unstarted.


Always prioritize:


1.

Daily workflow


2.

Data reliability


3.

Cross-device experience


4.

Interface polish


5.

Automation


6.

AI


---

# Definition of Done


A feature is complete only when:


## Product

It solves a real user problem.


## UX

It is simple and intuitive.


## Design

It supports all themes.


## Architecture

It follows system rules.


## Data

It works locally and syncs correctly.


## Mobile

It works on small screens.


## Testing

It has appropriate coverage.



---

# Final Roadmap Statement


Daily Work OS should grow from:

A simple personal work desk

↓

A reliable personal work memory system

↓

A smart personal work assistant


The product should evolve carefully.

Every addition should make daily work easier.
