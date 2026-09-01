# Supabase Development Setup

Phase 3.2 uses version-controlled SQL in `supabase/migrations`. Dashboard-only
schema changes are forbidden.

## Environments and secrets

Copy `.env.example` to an ignored `.env.local`. Browser code may receive only:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (or the project's browser-safe publishable key)
- `VITE_SUPABASE_AUTH_REDIRECT_URL`
- `VITE_APP_ENV=local|development|production|test`

Never prefix a service-role key, database password, access token, or test-user
password with `VITE_`. The browser bundle must never contain them. CLI-only
values (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, and
`SUPABASE_DB_PASSWORD`) belong in the shell or ignored environment files.
Production uses a distinct Supabase project and separate deployment secrets.

## Local workflow

Prerequisites: Node, npm, and a Docker-compatible runtime.

```sh
npm install
npm run supabase:start
npm run supabase:reset
npm run supabase:lint
npm run supabase:test
```

`supabase:reset` recreates the local database and applies every tracked
migration. Database tests live under `supabase/tests/database` and run in a
transaction. The committed `supabase/config.toml` enables Email Magic Link and
disables Realtime for this phase.

## Linked development project

Authenticate and link explicitly; never commit the project token or password:

```sh
npx supabase login
npx supabase link --project-ref "$SUPABASE_PROJECT_REF"
npx supabase db push --dry-run
npx supabase db push
```

Configure Auth → URL Configuration with the development Site URL and permitted
redirect URLs. Email Magic Link is the required provider; Google is optional.
Run remote integration tests only against an isolated development project:

```sh
SUPABASE_TEST_URL=... \
SUPABASE_TEST_ANON_KEY=... \
SUPABASE_TEST_USER_A_EMAIL=... \
SUPABASE_TEST_USER_A_PASSWORD=... \
SUPABASE_TEST_USER_B_EMAIL=... \
SUPABASE_TEST_USER_B_PASSWORD=... npm test
```

The two test users must be real Auth users with different UUIDs. These tests
verify session restore, owner isolation, direct-DML denial, and sign-out. Never
run destructive database tests against production.

The Phase 3.2B cloud gate has a dedicated real-environment runner. It resolves
the linked development project's keys in memory, creates isolated temporary
Auth users, removes them in `finally`, and never prints credentials:

```sh
node scripts/run-supabase-cloud-acceptance.mjs
```

The gate covers Auth/session restore/sign-out, anonymous denial, two-owner RLS,
direct-DML denial, mutation idempotency and rollback, revision concurrency,
Focus/RoutineLog/DailyLog/Activity invariants, and bootstrap staging/commit.
It must report zero skipped core checks. With a Docker-compatible runtime,
`supabase test db --linked` is the normal pgTAP entry point. A linked remote
project can run the same transaction-and-rollback suite without Docker through
the Management API:

```sh
npx supabase db query --linked --file supabase/tests/database/phase_3_2.sql
```

The test file converts `finish()` diagnostics into an exception, so a failing
assertion cannot be hidden when the API returns only the final result set.

Phase 3.3 initial-bootstrap acceptance uses two temporary real Auth owners and
removes them after the run:

```sh
node scripts/run-supabase-bootstrap-acceptance.mjs
```

It verifies local-history upload into an empty cloud workspace, idempotent chunk
and commit retry, revision-feed restore for a new device, owner RLS, tombstones,
Activity/DailyLog preservation, and the both-sides-data blocked decision. Core
checks must report zero skipped tests.

Phase 3.4 incremental two-device acceptance uses one temporary authenticated
owner with two independent device IDs, Outboxes, revision maps, and cursors:

```sh
node scripts/run-supabase-incremental-sync-acceptance.mjs
```

It exercises Task/Waiting/Memo/Routine exchange, RoutineLog, atomic End Day,
tombstones, Activity idempotency, sequential offline edits, stale edit and
delete/update conflicts, Focus/RoutineLog/DailyLog invariants, and revision
pagination. The temporary owner is deleted after the run. Core results must
report zero skipped tests.

## Migration and rollback discipline

1. Create a new timestamped migration; do not edit an already deployed file.
2. Reset locally, lint SQL, run pgTAP and application tests.
3. Review `db push --dry-run` against development.
4. Apply to development and run the two-user suite.
5. Promote the same migration artifact to production only after review.

Schema rollback is a new forward migration. Never rely on a Dashboard undo.

Phase 3.2B acceptance fixes are forward-only migrations: `20260831000200`
separates entity inserts from optimistic updates, and `20260831000300` maps a
deterministic stale-base failure to PostgREST `PT409`. Do not edit or squash
these files after deployment.

## Security boundary

Authenticated clients have owner-scoped SELECT only. Canonical writes and
bootstrap commits use explicitly granted, versioned RPCs. RPCs derive ownership
from `auth.uid()`, lock the per-user revision row, validate mutation receipts,
and commit entity rows, mutation results, and change feed atomically. Physical
tombstone cleanup remains disabled. Incremental Push/Pull uses only
authenticated RPCs and the durable revision feed.

## Phase 3.5 Realtime acceptance

Phase 3.5 adds `sync_invalidations` to the `supabase_realtime` publication. It
contains no Domain record or user text. The browser treats it only as a wake-up
and always performs revision Pull. Verify the linked development project with
temporary Auth owners (the runners remove them in `finally`):

```sh
node scripts/run-supabase-realtime-acceptance.mjs
node scripts/run-supabase-conflict-resolution-acceptance.mjs
```

The first runner checks owner isolation, minimal payload shape,
self-notification idempotency, and disconnect cursor catch-up. The second checks
mutable rebase, delete/update, Focus repair, RoutineLog uniqueness, and the
idempotent `resolve_daily_log_conflict_v1` receipt. Both must report zero skips.

Realtime is an optimization, not a correctness boundary. If WebSocket setup is
unavailable but authenticated Pull works, do not report total sync failure.
