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

No Supabase, cloud Realtime, Sync Queue, or new business feature is included.

## Phase 2.2 — Backup / Export / Restore Complete

- Versioned, Dexie-independent UTF-8 JSON Backup Format v1.
- Full current-user export including tombstones, Activity payloads, RoutineLog,
  and immutable DailyLog snapshots.
- Parse/validate/summary/explicit-confirm restore UX in Settings → Data.
- Automatic safety backup followed by atomic seven-store replace and integrity
  readback.
- Ownership rejection, failure rollback, local query refresh, and multi-tab
  invalidation coverage.

## Phase 2.3 — Sync Readiness Foundation Complete

- Stable browser-profile UUID device identity, excluded from backup and
  preserved by restore.
- One UUID mutation identity per logical Unit of Work, Activity device
  provenance, retry rejection, and End Day command/mutation alignment.
- Separate local optimistic version and future remote revision metadata.
- Dexie Version 8 additive `local_changes` outbox and `sync_metadata` stores.
- Atomic Entity + Activity + revision metadata + journal commit and rollback.
- Storage-neutral pending-change, tombstone, deleted-entity, remote-apply, and
  acknowledgement ports.
- Conflict taxonomy and explicit anonymous-to-authenticated migration proposal.
- Version 1–7 → Version 8 fixture matrix and Backup/Restore regression coverage.

## Phase 3.0 — Supabase Cloud Architecture Review Complete

Phase 3.0 defines, without connecting a cloud service:

- composite-owner canonical tables and server-enforced entity invariants;
- separate local version, remote row version, and owner-scoped ordered server
  revision semantics;
- idempotent mutation receipts and per-entity acknowledgement results;
- explicit four-case bootstrap and reversible local-owner adoption flow;
- cursor-based pull, exact-snapshot Outbox push, conflict quarantine, and
  tombstone retention;
- RLS/RPC authorization, retry taxonomy, and Realtime-as-invalidation boundary.

The review identified a Phase 3.1 P0 prerequisite: Version 8 Outbox identifiers
alone cannot faithfully replay successive offline entity states. Network work
must wait for immutable Outbox snapshots, durable commit order, causal
predecessors, per-entity acknowledgements, and atomic pull cursor advancement.

## Phase 3.1 — Local Sync Contract Hardening Complete

- Additive Dexie Version 9 formalizes immutable Mutation Record snapshots,
  device-scoped commit order, per-entity causal predecessors, five transport
  states, and per-entity acknowledgement results.
- `applyRemotePage` atomically applies remote candidates, revision metadata,
  conflict quarantine, and cursor advancement without exposing Dexie.
- Version 1–8 migration marks known owners `requires_bootstrap` and never
  fabricates history from the incomplete Version 8 Outbox.
- Replace Restore preserves device identity/commit monotonicity, clears
  non-portable transport state, and requires explicit future bootstrap.
- Offline chains, rollback, restart, late Ack, crash recovery, intersection,
  tombstone, invariant, migration, End Day, and Backup regressions are covered
  without network code.

## Phase 3.2 — Supabase Schema, Auth, and Bootstrap

Implementation and Phase 3.2B cloud acceptance are complete in the linked
development Supabase project.

- Version-controlled canonical/sync/bootstrap schema, Focus/RoutineLog/DailyLog
  invariants, immutable Activity/DailyLog guards, RLS, and restricted grants.
- Email Magic Link session foundation with bilingual, token-based responsive
  Settings UI and explicit anonymous/authenticated identity boundary.
- Four-case bootstrap discovery without automatic ownership migration or data
  movement.
- Idempotent mutation RPC v1, per-entity server revisions/results, ordered
  change feed, and replay-safe atomic bootstrap staging/commit.
- Storage-neutral cloud ports and conditional two-user/pgTAP integration suites.
- Remote migrations `20260831000100`–`20260831000300` deployed and idempotent
  deployment dry-run verified; linked database lint reports no schema errors.
- Real Auth/RLS/RPC/revision/invariant/bootstrap acceptance: 25 passed, 0
  failed, 0 skipped. Temporary test identities were removed after the run.
- Remote pgTAP transaction suite: 31 passed, with rollback and strict
  `finish()` failure propagation through the Management API.

Background Push/Pull, Realtime, merge UI, project sync, and tombstone cleanup
remain out of scope.

## Phase 3.3 — Initial Bootstrap and Ownership Migration Complete

- Storage-neutral Bootstrap Coordinator implements all four local/cloud cases
  without exposing Dexie or Supabase to UI.
- Dexie Version 10 adds durable progress and ownership checkpoints; Version
  1–9 migration fixtures preserve all prior data and never fabricate progress.
- `local-user` ownership migration, pre-commit rollback, cloud replacement, and
  server metadata/cursor initialization are atomic local commands.
- Deterministic validated snapshots/chunks include tombstones, Activity, and
  DailyLog history while excluding device and transport state.
- Bilingual responsive Settings UX provides safe confirmation, retry, and a
  double-confirmed Use Cloud path; merge and Keep Local overwrite are absent.
- Real development-project acceptance: 5 passed, 0 failed, 0 skipped, covering
  two Auth owners, upload, restore feed, RLS, history, tombstones, revisions,
  idempotency, and the both-sides-blocked decision.

## Phase 3.4 — Incremental Push/Pull and Conflict Quarantine Complete

- Storage-neutral Sync Engine implements authenticated preflight, ordered Pull,
  immutable-snapshot Push, per-entity Ack, causal successor rebasing, offline
  recovery, and post-Push catch-up.
- App startup, Bootstrap completion, local commit, online, focus/visibility, and
  manual actions trigger one single-flight; Web Locks prevent competing tabs.
- Bilingual responsive status shows synced/syncing/offline/pending/auth/conflict
  states and safe conflict candidates without raw payloads or automatic merge.
- Existing Dexie Version 10 and Supabase migrations are sufficient; no new
  schema version was introduced.
- Real development-project two-device acceptance: 10 passed, 0 failed, 0
  skipped, including all Domain categories, End Day, tombstones, Activity,
  offline causal edits, revision pagination, and invariant conflicts.

## Phase 3.5 — Realtime Invalidation + Conflict Resolution UX Complete

- Content-free, owner-filtered Realtime invalidations wake the existing
  cursor-based SyncEngine; Realtime is not a correctness boundary.
- Lifecycle covers bootstrap gating, sign-out/account switching, reconnect
  catch-up, debounce, self-notification, and Web Lock leadership.
- Conflict Center provides bilingual, theme-safe, keyboard/mobile candidate
  review for stale edit, delete/update, Focus, RoutineLog, and DailyLog.
- Dexie Version 11 persists atomic/idempotent resolution receipts and causal
  successor disposition; Backup excludes transport state.
- Supabase migrations add RLS-protected minimal invalidations and an explicit
  idempotent DailyLog official-snapshot resolution command.
- Real development-project acceptance passed Realtime owner isolation,
  reconnect Pull, and five cloud conflict-resolution scenarios with zero skip.

Project sync and physical tombstone cleanup remain outside Phase 3.5.

## Phase 3.6 — Cross-device Acceptance + Production Hardening Complete

- Real development-project acceptance passed Bootstrap, two-device incremental
  sync, Realtime invalidation, and conflict convergence with 26 passed
  scenarios, zero failures, and zero skips.
- Account restore/switch races and owner-scoped single-flight behavior are
  hardened so stale Auth or sync results cannot cross identity boundaries.
- Read-only database integrity audit and content-free Sync Health Diagnostics
  provide support evidence without exposing user-authored data or credentials.
- Failure UX explains local safety, cloud confirmation, required action, and
  the Pull fallback when Realtime is unavailable.
- Indexed Activity and pending-Outbox reads avoid unbounded history scans; the
  production bundle remains split below the warning threshold.
- Backup/Restore, historical Dexie migrations, local anonymous mode, RLS/RPC,
  and cross-device invariants passed regression.
- The detailed evidence and remaining P2 manual follow-ups are recorded in
  `docs/PHASE_3_ACCEPTANCE.md`.

Phase 3 is closed for personal-beta scope. There are no known P0 or P1 release
blockers. Project sync, physical tombstone cleanup, and new business features
remain outside this gate.

## Personal Beta Refinement 1 — UX Complete, Extensions Proposed

- Waiting actions are compact and accessible; long Routine titles no longer
  change action dimensions.
- Technical Task and Project UUID fields are hidden from ordinary user flows
  while their nullable Domain relationships remain available for future
  pickers/conversion commands.
- Backup/Restore is responsive through 320px and does not expose intrinsic file
  input sizing; unconfigured cloud now links to an in-app bilingual setup guide.
- Custom Dashboard Widgets, Custom Sidebar Modules, Accounting, and Weight
  Tracking are proposals only. No new Domain table, sync contract, or business
  feature was added for them.
- Recommended future decomposition is recorded in
  `docs/PERSONAL_BETA_FEEDBACK.md`; Phase 4 requires explicit confirmation.


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
