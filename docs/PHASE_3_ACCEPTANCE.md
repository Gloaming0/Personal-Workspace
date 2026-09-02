# Phase 3 Acceptance Report

- Status: complete for personal beta
- Acceptance date: 2026-09-02
- Branch: `develop`
- Local database: Dexie Version 11
- Cloud target: isolated Supabase development project

This report is the release gate for Phase 3.6. It distinguishes tests that ran
against the real development project from local automation and manual browser
checks. It contains no credentials, account identifiers, user content, or
diagnostic payloads.

## Acceptance Summary

| Area | Evidence | Result |
| --- | --- | --- |
| Local quality gate | Format, TypeScript, ESLint, Vitest, production build, `git diff --check` | Passed |
| Unit/integration tests | 53 files passed, 1 optional file skipped; 214 tests passed, 1 optional test skipped | Passed |
| Cloud/Auth/RLS/RPC | Real Supabase development project, two authenticated owners | 25/25 passed, 0 skipped |
| Bootstrap | Empty/local/cloud/both paths plus resumability and idempotency | 5/5 passed |
| Incremental cross-device sync | Two independent authenticated device harnesses | 12/12 passed |
| Realtime invalidation | Owner filtering, reconnect catch-up, dedupe, cursor convergence | 4/4 passed |
| Conflict convergence | Stale edit, delete/update, Focus, RoutineLog, immutable DailyLog | 5/5 passed |
| PostgreSQL lint | Linked development database, warning level | No schema errors |
| Security dependencies | `npm audit --omit=dev` | 0 vulnerabilities |
| Desktop browser | 1440 × 900, themes, diagnostics, reload persistence | Passed |
| Mobile browser | 390 × 844, navigation, touch targets, overflow, console | Passed |
| Physical phone | Requires a human-operated device outside this workspace | Not executed; P2 manual follow-up |

The final cross-device runner completed all four real-cloud suites with 26
passed scenarios, zero failures, and zero skips. The separate cloud foundation
suite completed 25 real Auth/RLS/RPC scenarios with zero skips.

## Cross-device and Offline Scenarios

The two-device acceptance covers Task create, Focus, complete/reopen, Waiting
follow-up and confirm, Memo pin/edit, Routine complete/undo, immutable End Day,
tombstones, Activity idempotency, offline causal edits, cursor convergence, and
unique-invariant conflicts. It verifies both directions between independent
local device states and the shared authenticated cloud owner.

Unknown mutation results use the original `mutationId`: the client queries the
durable receipt and retries the identical payload only when needed. Restarted
`in_flight` mutations remain retryable; causal successors remain blocked behind
a conflicted predecessor. Realtime loss is non-fatal because foreground,
lifecycle, reconnect, and manual triggers all use revision Pull as the
correctness path.

## Authentication and Account Switching

Two real Auth owners passed row isolation, spoof rejection, sign-out access
revocation, direct-DML rejection, RPC ownership, session restore, and mutation
idempotency checks. A Phase 3.6 race fix ensures that an Auth event occurring
during session restore wins over the stale restore result.

`SyncEngine` single-flight is now owner-aware. Runs for the same owner coalesce;
an account switch waits for the old run to settle and starts a distinct run for
the new owner. React invalidates old-owner results and conflicts, closes the old
Realtime subscription, and never renders one owner's result under another
identity.

## Backup, Restore, Bootstrap, and Migration

Portable Backup continues to exclude session tokens, device identity, Outbox,
cursor, conflicts, and resolution receipts. Replace Restore preserves the
current device identity and commit-order monotonicity, clears transport state,
resets the Pull cursor, and marks the workspace `requires_bootstrap`.

After Restore, discovery refuses a silent merge when both local and cloud data
exist. The user must make the existing explicit bootstrap choice. Safety Backup
and rollback tests verify that failed Restore or bootstrap operations do not
leave partial Domain data.

Migration fixtures cover every historical Dexie source version through Version
11, including Version 1–8 upgrades to the formal journal model, Version 9 to
bootstrap recovery, and Version 10 to conflict-resolution receipts. Fixtures
include Unicode, nullable values, tombstones, Activity payloads, DailyLog
snapshots, and transport-state boundaries.

## Integrity Audit and Recovery

The read-only integrity audit reports aggregate, content-free issue codes for:

- invalid or cross-owner records;
- Focus count/order violations;
- duplicate RoutineLog and DailyLog invariants;
- broken Domain references;
- invalid sync metadata and cursor ordering;
- orphaned mutations, causal cycles, acknowledgement mismatches, and orphaned
  conflicts.

It never mutates data or returns Task, Memo, Activity, or Snapshot content.
Corrupt records remain isolated by repository validation, while unrecoverable
global invariants lead to structured recovery state rather than an Empty State.

Settings exposes bilingual Sync Health Diagnostics. The copyable report contains
only status, counts, cursor/high-watermark data, abbreviated device identity,
safe error categories, protocol/schema versions, and integrity issue codes. It
excludes tokens, user IDs, titles, notes, Activity payloads, and stack traces.

## Failure and Conflict UX

The sync indicator now explains whether local work is safe, whether cloud
confirmation is pending, and what action is required. It distinguishes offline,
authentication, retryable failure, permanent failure, blocked causal work,
conflict, pending, and synchronized states. When Realtime is reconnecting or
unavailable, the UI exposes the ordinary Pull fallback instead of presenting a
false fatal state.

Version conflicts reload the newest data and explain that another window or
device changed it. Quarantined conflicts remain explicit; immutable DailyLog,
delete/update, ownership, Focus, RoutineLog, and DailyLog uniqueness never use
silent Last Write Wins.

## Performance and Dependency Review

The production build completed without the 500 kB chunk warning:

| Chunk | Raw | Gzip |
| --- | ---: | ---: |
| CSS | 48.13 kB | 9.05 kB |
| Dexie | 95.18 kB | 31.31 kB |
| React | 189.59 kB | 59.61 kB |
| Supabase | 208.64 kB | 53.98 kB |
| Main | 283.57 kB | 75.52 kB |

Recent Activity now reads the existing owner/time index in descending order
with a limit. Pending Outbox reads use compound status/order indexes and fetch
only referenced predecessors instead of scanning mutation history.

`@supabase/ssr` was removed because this application is a client-only Vite SPA
and did not import it. Auth remains implemented by `@supabase/supabase-js`.
Package inspection found no production dependency vulnerability.

## Security Review

- Browser configuration contains only the Supabase URL and anon/publishable
  key; no service-role secret is bundled or backed up.
- All exposed tables use RLS, and cloud authority is `auth.uid()`.
- Business-table browser DML is denied; versioned RPCs own mutation and revision
  transactions.
- Security-definer functions use a safe search path, qualified objects, and
  minimal execute grants.
- Activity remains append-only and DailyLog remains immutable.
- Linked database lint returned no schema errors.

The pgTAP file still declares and last passed all 31 database assertions during
the Phase 3.2B/3.5 acceptance. A fresh Phase 3.6 invocation was attempted but
the host execution-approval system rejected the remote database command; it was
not bypassed and is not reported as rerun. Current real-cloud acceptance (25/25
foundation plus 26/26 cross-device scenarios) and linked database lint passed.
This is a P2 verification limitation, not evidence of a product defect.

## Remaining Risks

### P0

None known.

### P1

None known for the personal-beta scope.

### P2

- Repeat the 31-case pgTAP suite when remote database-query approval is
  available.
- Complete a human-operated physical-phone pass for OS-level file download,
  file picker, Magic Link handoff, background suspension, and network switching.
- Supabase Dashboard advisor UI was not automated; linked database lint was used
  as the repeatable schema check.
- Realtime availability remains provider/network dependent by design; periodic
  revision Pull remains the correctness fallback.

## Final Gate

Phase 3 is complete for the approved scope. With no known P0 or P1 blocker, the
application is ready for a personal beta. Production rollout beyond a personal
beta should retain staged deployment, monitoring, safety-backup guidance, and
the P2 physical-device/database-test follow-ups above.
