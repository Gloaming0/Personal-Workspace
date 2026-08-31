# Daily Work OS Development Rules

Version: 1.0


# Purpose

This document defines development rules for AI coding agents and human developers working on Daily Work OS.

The goal is:

- Maintain product consistency
- Preserve architecture quality
- Avoid unnecessary complexity
- Keep the codebase maintainable long-term


---

# Core Development Philosophy


## Build a product, not a demo


Daily Work OS is intended to become a long-term product.

Do not optimize for:

- Fastest implementation
- Shortest code
- Temporary solutions


Optimize for:

- Maintainability
- User experience
- Clear architecture
- Future scalability


---

# Before Writing Code


Before implementing any feature, the developer must:


## Step 1

Read:


PRODUCT.md
DESIGN_SYSTEM.md
ARCHITECTURE.md


Understand:

- Why this feature exists
- How it fits the product
- How it should look
- How it affects architecture


---

## Step 2

Analyze the request.


Answer:


1. Does this feature match the product vision?


2. Does this reduce user effort?


3. Does this introduce unnecessary complexity?


4. Does this affect existing architecture?


5. Does this require database changes?


6. Does this affect synchronization?


---

## Step 3

Create an implementation plan.


Before coding, explain:


- Data changes
- UI changes
- Component changes
- Architecture impact
- Testing plan


Do not immediately modify files.


---

# Feature Development Rules


Every feature must consider:


## 1. Data Model


Questions:


- Does this require a new entity?
- Does existing data structure support it?
- Does it need synchronization?


---

## 2. Local Database


If data changes:


Update:

Dexie schema
Repository
Migration


---

## 3. Cloud Database


If synchronized:


Update:

Supabase schema
RLS policy
Sync handler


---

## 4. UI


Every UI feature must support:


- Desktop
- Mobile
- All themes
- Loading state
- Empty state
- Error state


---

## 5. Testing


Every feature requires:


- Unit test consideration
- Integration test consideration


---

# Do Not Break Existing Principles


Never violate:


## Product


Daily Work OS should remain:


- Personal
- Lightweight
- Calm


Do not turn it into:

- Enterprise software
- Complex PM tool
- Collaboration platform


---

## Design


Never:


- Hardcode colors
- Create one-off styles
- Ignore theme system


Always:


Use:

Design Tokens
Reusable Components
Existing Patterns


---

## Architecture


Never:


Create:

Component
   |
   |
Direct Database Call


Do:


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

# Dependency Rules


Before adding a dependency:


Explain:


1. Why it is needed


2. Why existing tools cannot solve it


3. Maintenance cost


Avoid unnecessary packages.


---

# Component Rules


Before creating a new component:


Check:


"Does a similar component already exist?"


Prefer:

Extending existing components.


Avoid:

TaskCardNew
TaskCardFinal
TaskCardV2


---

# Naming Rules


Use clear names.


Good:


TaskCard
WaitingItem
DailyLogEntry


Bad:


Box
Thing
Item2
NewComponent


---

# File Organization


Keep features isolated.


Example:


features/tasks/
components/
hooks/
repository.ts
types.ts


Do not place feature logic randomly.


---

# State Management Rules


Use Zustand only for:


- Shared application state
- UI state
- User preferences


Do not:


Store every piece of data globally.


Prefer:


Local feature state.


---

# Database Rules


Never modify database structure casually.


Before changing:


Check:

- Migration impact
- Sync impact
- Existing users


---

# Sync Rules


Sync is critical.


Never:


Directly write cloud data from UI.


Always:


Local Update
↓
Sync Queue
↓
Cloud


---

# Offline Rules


Offline support is a core feature.


Never create features that only work online.


Every data operation should consider:


- Offline creation
- Offline editing
- Sync recovery


---

# UI Quality Rules


Every page must include:


## Loading State


Example:


Skeleton or local loading.


---

## Empty State


Explain:

- What this page is
- What user can do


---

## Error State


Provide:

- Explanation
- Recovery action


---

# Responsive Rules


Every component must be tested:


Desktop:

1200px+


Tablet:

768px-1199px


Mobile:

<768px


---

# Mobile Rules


Never rely on:


- Hover
- Right click
- Keyboard only


Important actions need:


- Visible buttons
- Touch friendly targets


---

# Accessibility Rules


Every interactive element needs:


- Keyboard support
- Focus state
- aria-label when needed


---

# Theme Rules


All UI must support:


minimal-light
minimal-dark
warm-paper
nordic-blue
sakura
forest


Never:

Create a component that only works in one theme.


---

# Animation Rules


Animation should communicate change.


Good:


- Task completed
- Modal opening
- Theme transition


Bad:


- Decorative movement
- Excessive effects


---

# Git Rules


Use feature branches.


Example:


main
develop
feature/task-module
feature/theme-system


---

# Commit Rules


Use conventional commits.


Format:


type: description


Examples:


feat: add task repository
feat: implement today dashboard
fix: resolve sync conflict
refactor: simplify theme tokens


Avoid:


update
fix stuff
changes


---

# Pull Request Rules


Every PR should include:


## Summary


What changed.


## Reason


Why this change exists.


## Testing


How it was verified.


## Screenshots


Required for UI changes.


---

# Code Review Checklist


Before merging:


Check:


## Product


- Does this match PRODUCT.md?


## Design


- Does this follow DESIGN_SYSTEM.md?


## Architecture


- Does this follow ARCHITECTURE.md?


## Quality


- Is code maintainable?


- Is there unnecessary complexity?


---

# Handling Ambiguous Requests


If requirements are unclear:


Do not guess silently.


Instead:


1. Explain possible interpretations.


2. Recommend one option.


3. Ask for confirmation if the decision affects architecture.


---

# Handling New Feature Requests


Before adding:


Ask:


Does this:


1. Solve a real user problem?


2. Reduce work?


3. Fit the product philosophy?


If not:


Do not add it.


---

# Avoid Over Engineering


Do not build future systems before they are needed.


Examples:


Do not create:


- Complex plugin architecture
- Enterprise permission system
- Advanced analytics
- AI framework


unless required.


---

# AI Specific Rules


When modifying existing code:


First inspect:

- Existing implementation
- Related components
- Data flow


Do not rewrite large areas without reason.


---

# Prefer Small Changes


Make changes:


- Focused
- Reviewable
- Reversible


Avoid:


Large unrelated refactors.


---

# Documentation Rules


When architecture changes:


Update:

ARCHITECTURE.md


When product behavior changes:


Update:

PRODUCT.md


When UI changes:


Update:

DESIGN_SYSTEM.md


When development process changes:


Update:

DEVELOPMENT_RULES.md


---

# Repository Contract

- Every read and write method must take the calling `userId` explicitly.
- A Repository must never depend on the database containing only one user.
- `getById` must not reveal another user's entity, including through an error
  that exposes its content.
- Writes must reject `entity.userId !== callingUserId` and must not overwrite
  an existing id owned by another user.
- Creates start at Version 1. Updates are exactly the stored version plus one.
  A stale `expectedVersion` is rejected.
- Effective business reads exclude `deletedAt != null` unless a separate,
  explicitly named tombstone/sync API is introduced.
- Persisted records are runtime-validated before entering the Domain layer.
- Every new Adapter must run the shared Repository contract suite. In-memory
  test adapters and production adapters must have identical semantics.
- Activity remains append-only: no normal update/delete port is allowed, and
  business queries hide tombstones.


---

# Atomic Command Contract

- Cross-Repository business commands must declare their complete store set to
  the storage-neutral `UnitOfWork` port.
- Code inside a Unit of Work must use only the transaction-scoped Repository
  ports supplied by `UnitOfWorkTransaction`.
- Feature Services must not import or call `Dexie.transaction()` and must reuse
  an existing transaction token when one command composes another Service.
- An Entity mutation and its Activity append are one commit. Activity failure
  must reject the command and roll back the Entity mutation.
- Focus allocation must read, validate, allocate order 1–3, save with
  `expectedVersion`, and append Activity in one Task/Activity transaction.
- End Day must not persist Task decisions during the review steps. Finalize
  atomically applies every Task decision, inserts the immutable DailyLog, and
  appends `daily_log_finalized`.
- Retryable finalize commands require a stable `commandId`. The same id must
  return the existing result without duplicate Entity changes or Activity; a
  different id for the finalized user/date must fail.
- In-memory transactional adapters must serialize overlapping commands and
  restore every participating store after an exception. Tests must verify the
  same all-or-nothing behavior expected from Dexie.
- New atomic commands require failure-injection coverage at each meaningful
  write boundary and an `expectedVersion` conflict case.


---

# Database Recovery Contract

- Query failure and a successful empty collection are different states. Never
  manufacture an Empty View Model after a storage rejection.
- Database open, upgrade, blocked, versionchange, quota, transaction abort,
  and corrupt-record paths must be classified into the shared runtime state.
- User-facing recovery UI must use localized safe copy and must not expose raw
  errors, stack traces, database keys, or Entity content.
- Diagnostics may contain only database version, store name, error category,
  and UTC timestamp.
- List queries isolate malformed persisted rows and continue with valid rows;
  every isolated row emits a content-free `corrupt-record` diagnostic.
- Read-only recovery mode permits reads and disables all mutation controls.
- Every recoverable unavailable state must expose Retry.


---

# Date Policy

- Persisted `Instant` values are canonical UTC ISO timestamps.
- `LocalDate` values are strict calendar-valid `YYYY-MM-DD` strings.
- Calendar addition, subtraction, comparison, weekday, and difference must use
  the shared pure LocalDate helpers. Do not parse LocalDate in the host timezone.
- Every `Instant → LocalDate` conversion must pass an explicit IANA timezone.
- Do not compare calendar dates with `instant.slice(0, 10)`.
- Routine schedule and RoutineLog dates use the Routine's stored timezone.
- DailyLog persists the End Day `finalizeTimezone`.
- Morning Review yesterday uses the user's explicit timezone and LocalDate
  arithmetic. End Day completion filtering uses its explicit timezone.
- Date tests must cover UTC-12, UTC+14, DST, midnight boundaries, and differing
  device/user/Routine timezones.


---

# Multi-tab and Migration Contract

- Cross-tab notifications belong to the local change coordinator, never a UI
  component. Broadcast only store name, entity id, entity version, revision,
  and transport source id; never broadcast titles, memo content, snapshot data,
  or other user-authored values.
- Repository writes notify only after commit. A Unit of Work collects changes
  and publishes them after the whole transaction succeeds; rollback must emit
  nothing.
- Remote invalidation reloads the relevant application View Model. It must not
  invoke another write or rebroadcast the received revision.
- Editable View Models carry the entity version used to render the action.
  Feature Services compare it with the freshly read entity and raise
  `RepositoryVersionConflictError` on mismatch. The UI reloads and explains the
  conflict; it never silently overwrites or auto-merges.
- Concurrency tests that protect a cross-row invariant must use independent
  Dexie connections, not two repositories sharing one connection.
- Every retained historical database version needs a realistic upgrade fixture
  to the current version. Fixtures include multiple records, Unicode, nulls,
  tombstones, and any JSON payload/snapshot available at that version.
- Migration failure tests must prove the old data can be reopened. Blocked and
  versionchange tests must prove safe close, Retry, and recovery to `ready`.
- Startup integrity checks are diagnostic and non-destructive. Do not silently
  renumber Focus, delete duplicate logs, or rewrite malformed records.


---

# Portable Backup Contract

- Treat `docs/BACKUP_FORMAT.md` as a versioned public data contract. Never dump
  IndexedDB or expose Dexie store/index metadata as the backup format.
- Backup UI calls `BackupService`; it must not read or write Dexie directly.
- Export includes tombstones and immutable history but excludes preferences,
  transient state, diagnostics, credentials, and Morning Review markers.
- Import validates the whole document, ownership, entities, references, and
  invariants before opening a write transaction.
- Restore uses replace semantics only. It must create a successful safety
  backup before one all-store transaction and must never silently rewrite
  `userId` or merge fields.
- Restore invalidations publish only after commit and contain no user content.
- An unsupported format version is rejected explicitly. Breaking changes
  require a new format version and importer; do not change Version 1 semantics.


---

# Sync Readiness Contract

- One logical command has one UUID `mutationId`. Retries reuse it; UI or
  transport retries must not generate a replacement id.
- Device identity is browser-profile metadata. Domain entities, portable
  backup, and ownership migration must never overwrite or transport it.
- Business writes continue through Feature Service → Unit of Work. A future
  Sync Engine may use only `SyncRepository`; neither layer may access Dexie
  tables directly.
- Entity, Activity, SyncMetadata, LocalMutationRecord, device commit sequence,
  and bootstrap marker belong to the same transaction. A rollback must leave no
  journal snapshot, consumed commit order, or partial revision state.
- Entity `version` is local optimistic concurrency. Never compare it with or
  assign it as a remote server revision.
- Version 9 Mutation Records contain the immutable raw Domain snapshot required
  to replay that exact logical command. Never reconstruct an older mutation from
  the current entity. Snapshots may contain user-authored Domain content but
  never translated UI sentences, component state, credentials, or diagnostics.
- `commitOrder` is allocated transactionally per user/device and is the only
  Push ordering authority. Do not order mutations by client timestamps.
- A successor mutation records its per-entity predecessor. Conflicted or
  permanently failed predecessors block automatic Push of their causal chain.
- Acknowledgement is per entity. A late acknowledgement may advance remote
  metadata but must not replace a newer `lastMutationId`, local version, or
  snapshot.
- Pull uses the atomic page port. Applying entities, metadata, conflicts, and
  cursor advancement in separate transactions is forbidden.
- Ordinary repositories hide tombstones. Sync ports and portable backup may
  intentionally read them with explicit ownership.
- Never physically delete a tombstone before remote acknowledgement and a
  documented retention policy.
- Remote apply must validate ownership, revision base, immutable history, and
  Focus/RoutineLog/DailyLog invariants before commit.
- DailyLog conflict, delete-versus-update, ownership conflict, and unique
  invariant conflict must never use silent Last Write Wins.
- Anonymous ownership migration requires a safety backup and explicit user
  confirmation. Do not silently rewrite `local-user`.
- Every schema addition keeps the full historical migration fixture matrix.
  Sync stores and backup exclusion/restore behavior require regression tests.


---

# Final Rule


Before every decision, ask:


"Does this make Daily Work OS a better personal workspace?"


If not:

Do not do it.
