# Personal Beta Feedback — Refinement 1

- Date: 2026-09-02
- Status: A items implemented; B items proposed only

## Feedback and Root Causes

1. Waiting actions occupied the content column. Three full-width labels were
   rendered beside every item. The action cluster now keeps one visible Edit
   action and places secondary state changes in an accessible overflow menu.
2. Routine titles could shrink the action cluster because the title and buttons
   shared an unconstrained flex row. The title now owns the flexible,
   breakable column and the action cluster is `flex-shrink: 0`.
3. Waiting creation exposed `sourceTaskId` as a UUID input. Task-to-Waiting
   conversion/picking is not yet a complete user feature, so ordinary capture
   hides the technical field while the Domain field remains available.
4. Quick Memo exposed `projectId` as a UUID input. Project persistence and
   selection are deferred, so ordinary capture hides the technical field and
   continues to pass `null`.
5. Backup/Restore content could be squeezed by a nested grid and intrinsic
   control sizing. Content columns now have `min-width: 0`, text can wrap at
   safe boundaries, file controls are bounded, and mobile stacks naturally.
6. An unconfigured cloud showed status only. Account & cloud now has an
   in-app bilingual Cloud Setup Guide covering Supabase, browser-safe keys,
   developer environment variables, Magic Link, redirect URLs, and security.

## Final UX Decisions

Waiting secondary actions use native `details/summary`, preserving keyboard
discovery and a 44px touch target. Long content uses safe wrapping rather than
compressing controls. No user-facing screen asks for a Task or Project UUID.

The Cloud Setup Guide is educational only. It does not write environment files,
collect secrets, or change Auth state.

## B1 — Custom Dashboard Widgets Proposal

Widgets are Workspace UI modules, not Domain entities. A registry would expose:

```ts
interface WidgetDefinition {
  id: string
  type: 'date' | 'clock' | 'weather'
  messageKey: string
  supportedSizes: Array<'small' | 'medium' | 'large'>
  defaultSize: 'small' | 'medium' | 'large'
  capabilities: Array<'local-only' | 'network' | 'permission'>
}

interface WidgetInstance {
  id: string
  widgetType: WidgetDefinition['type']
  order: number
  size: WidgetDefinition['defaultSize']
  settings: Record<string, string | number | boolean | null>
  visible: boolean
}
```

Date renders the current LocalDate and weekday using the preference timezone and
language. Clock owns an isolated timer hook so each tick does not rerender the
whole dashboard. Weather remains design-only until a safe backend/provider,
manual city or explicit permission, cache/refresh policy, and offline state are
approved. No fake weather data should ship. Layout is a UI preference; whether
it syncs across devices is a product choice and should default to local-only.

## B2 — Custom Sidebar Proposal

Navigation is a separate registry from widgets and Domain modules:

```ts
interface WorkspaceModuleDefinition {
  id: string
  icon: string
  labelMessageKey: string
  route: string
  availability: 'enabled' | 'coming-soon' | 'experimental'
  defaultVisible: boolean
  order: number
  capabilities?: string[]
}
```

User preference stores visible module IDs and order. Core Today and Settings
remain required. Desktop can show the configured list; Mobile keeps a bounded
primary navigation and places additional modules under More / Modules. A module
registry must not become a generic plugin system and must not own business
repositories.

## B3 — Accounting MVP Proposal

The first slice should be local-first capture and review only: `Transaction`
with UUID, owner, `expense | income`, integer minor units (never float), ISO
4217 currency, category, note, occurred Instant, timestamps, tombstone, and
local version. Account, budgets, recurring rules, tax reporting, and complex
statistics are out of scope. Amount validation, privacy, backup, and future
sync contracts must be decided before a schema migration. Activity should record
capture/edit/delete only after the user-facing workflow is approved.

## B4 — Weight Tracking MVP Proposal

The first slice should capture a `WeightEntry` with UUID, owner, explicit
LocalDate plus measured Instant, integer/decimal fixed-precision value, `kg | lb`,
optional note, timestamps, tombstone, and local version. Decide whether multiple
measurements per LocalDate are allowed before adding a uniqueness rule. Unit
conversion must be deterministic and preserve the original value/unit. Trends,
goals, reminders, and medical interpretation are out of scope. Privacy,
backup, timezone, and future sync semantics require review before schema work.

## Recommended Phase 4 Decomposition

- Phase 4.1: registry contracts and local preference model; no new Domain tables.
- Phase 4.2: Date and Clock widgets, responsive placement and accessibility.
- Phase 4.3: Sidebar registry with bounded Mobile More navigation.
- Phase 4.4: Weather provider/security decision, then implementation only if a
  safe backend and privacy policy are approved.
- Phase 4.5: Accounting domain/data contract review, followed by a separately
  approved vertical slice.
- Phase 4.6: Weight domain/data contract review, followed by a separately
  approved vertical slice.

This decomposition is a proposal, not an authorization to start Phase 4.
