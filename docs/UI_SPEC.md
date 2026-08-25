# Daily Work OS UI Specification

Version: 1.0


# Purpose


This document defines the user interface structure and interaction behavior of Daily Work OS.


The goal:

Create a personal digital workspace that feels like:

"My own desk."


The UI should prioritize:


- Fast information access
- Low interaction cost
- Clear daily focus
- Calm visual experience


---

# Global Layout


Daily Work OS has three responsive layouts:


1. Desktop Workspace

2. Tablet Workspace

3. Mobile Workspace



---

# Desktop Layout


Breakpoint:


>=1200px



Structure:


┌──────────────┬──────────────────────────┬───────────────┐
│              │                          │               │
│  Sidebar     │   Main Workspace         │ Utility Panel  │
│              │                          │               │
│              │                          │               │
└──────────────┴──────────────────────────┴───────────────┘


---

# Sidebar


Purpose:


Navigation and context switching.


Width:


Default:

240px


Collapsed:

72px



Contents:


Today
Inbox
Tasks
Waiting
Notes
Projects
Archive
Settings


---

## Sidebar Behavior


Support:


- Expand
- Collapse
- Active state
- Keyboard navigation


Active item should use:

- Accent background
- Clear text contrast


Avoid:

Large colorful blocks.


---

# Main Workspace


The main area displays the current working context.


Default page:

Today Dashboard


The workspace should have:


- Clear title
- Section hierarchy
- Comfortable spacing


---

# Utility Panel


Purpose:


Small frequently used tools.


Default widgets:


Daily Check-in
Quick Memo
Upcoming
Recent Activity


Desktop only.

On smaller screens:

Convert into drawer.

Mobile exception:

- Daily Check-in and Quick Memo remain inline in Today as core modules.
- The Utility Drawer contains only secondary context such as Recent Activity
  and Upcoming.
- Tablet may continue to show all utility widgets in its drawer.


---

# Today Dashboard


The most important screen.


Purpose:


Answer:


"What matters today?"


---

# Today Layout


Desktop:


Today
Focus
Today's Tasks
Waiting
Daily Check-in
Quick Notes


---

# Today Header


Contains:


Date:


Example:


Monday
August 24


Optional:


Greeting:


Good morning.


Stats:


5 Tasks
2 Waiting
3 Check-ins


Stats should be subtle.

Not dashboard KPI style.



---

# Focus Section


Purpose:


Show today's three most important items.


Maximum:


3 items.

Focus items are ordered Task projections, not independent records. Completing
or updating a Focus item updates the same Task shown elsewhere.


Example:


TODAY FOCUS
① Finish event proposal
② Confirm UI flow
③ Review analytics


Interaction:


Click:

Open task.


Complete:

Task completed.


---

# Task Widget


Purpose:


Show today's actions.


Example:


TODAY TASKS
□ Review player data
□ Update event configuration
✓ Finish proposal


---

# Task Item


Structure:


Checkbox
Title
Metadata
Actions


Metadata:


Optional:


- Project
- Due date
- Priority


---

# Task Interaction


Click title:


Open detail.


Checkbox:


Complete.


More:


Edit
Move tomorrow
Set priority
Set project
Delete


---

# Waiting Widget


Purpose:


Show responsibilities outside the user's control.


Example:


WAITING
⏳ UI confirmation
Follow up tomorrow
⏳ Backend estimate
Waiting 2 days


---

# Waiting Item


Display:


Status icon
Title
Person
Follow-up date

“Needs Follow-up” is derived when an open Waiting item's follow-up date is due
or overdue. It is attention metadata, not a persisted status.


---

# Waiting Actions


Menu:


Follow up
Confirmed
Edit
Convert to Task
Archive


---

# Daily Check-in Widget


Example:


DAILY CHECK-IN
✓ Check analytics
✓ Review feedback
○ Update report


Interaction:


Single click toggle.


---

# Quick Memo Widget


Purpose:


Instant capture.


Example:


Quick memo...


Behavior:


Auto save.


No save button.


---

# Inbox


Purpose:


Capture everything quickly.


Layout:


Inbox
- Add
Item
Item
Item


Each item can convert:


Task
Waiting
Memo
Project


---

# Quick Capture


Global action.


Trigger:


Keyboard:


Cmd/Ctrl + Shift + Space


Mobile:


Floating + Button.



---

# Quick Capture UI


Overlay:


What do you want to capture?
Task
Waiting
Memo
Inbox


Default:

Inbox.


---

# Command Palette


Trigger:


Cmd/Ctrl + K


Purpose:


Global command system.


---

# Commands


Support:


Create Task
Create Memo
Create Waiting
Search
Go Today
Change Theme
End Day
Settings


---

# Search UI


Search everything:


Tasks
Waiting
Memo
Projects
Daily Logs


Results:


Grouped by type.


---

# Task Detail


Open:


Side panel.


Contains:


Title
Status
Priority
Project
Notes
Dates
Activity


Avoid full page navigation for simple editing.



---

# Waiting Detail


Contains:


Title
Person
Status
Follow-up date
Notes
History


---

# Memo Detail


Contains:


Content
Created time
Project
Actions


---

# Project Page


Purpose:


Context view.


Layout:


Project Name
Tasks
Waiting
Notes
Recent Activity


Do not include:


- Kanban
- Sprint
- Complex workflow



---

# Daily Log Page


Purpose:


Review history.


Layout:


August 24
Completed
Waiting
Notes
Summary


---

# End Day Flow


Trigger:


Button:

End Day


---

# End Day Screen


Display:


TODAY REVIEW
Completed
5 tasks
Still open
3 tasks
Waiting
2 items


---

# Unfinished Task Actions


Each item:


Tomorrow
Later
Keep
Delete


---

# Summary Input


Final:


How was today?


Save:


Create Daily Log.

## Phase 1.8 Interaction Contract

The Today header exposes the End Day entry without changing the App Shell.
Desktop presents the four steps in a centered workspace dialog. Mobile uses
the same information order and View Model in a full-height sheet. Step 1 shows
Completed Tasks, Still Open Tasks, Waiting, Check-in completion, and Notes.
Step 2 requires an explicit Tomorrow/Later/Keep/Delete value for every open
Task (Keep is the initial safe selection). Step 3 accepts an optional summary;
Step 4 is the explicit irreversible confirmation.

The flow has Loading and Error states, translated labels, visible focus styles,
native keyboard controls, Back/Next navigation, and Escape-to-close. Finalize
is disabled while saving. On failure the dialog remains open and explains that
no Daily Log was finalized. Theme styling uses existing semantic Design Tokens
only; no theme-specific colors are embedded in the feature.

When a Daily Log already exists, the same entry becomes a minimal read-only
snapshot view showing its counts, summary, and finalization time. It does not
offer edit, reopen, or replacement controls.



---

# Morning Review


Shown when:


Previous day has unfinished items.


Example:


Yesterday
4 unfinished items
Move all to today?


Actions:


Move
Later
Done
Delete
Skip

Phase 1.9 interaction contract:

- The review appears only when effective `todo`/`doing` Tasks remain on the
  previous local date and today's device-local seen marker is absent.
- Desktop and Tablet use a lightweight centered Dialog. Mobile uses the same
  content order in a full-height Sheet.
- Each row offers Move to Today, Later, Done, and Delete. The footer offers
  Skip and Move All to Today.
- Escape is equivalent to Skip, focus is trapped within the modal, all actions
  use native buttons with token-based touch targets, and an inline error leaves
  Skip available so Today is never permanently blocked.
- User-authored Task titles remain raw text across language changes. All system
  labels support English and Chinese and inherit all six Design Token themes.
- With no carry-over Tasks, no Morning Review surface is rendered.


---

# Tablet Layout


Breakpoint:


768px–1199px


---

# Tablet Contract

- Keep a 72px icon sidebar.
- Give the main workspace the remaining width.
- Convert the utility panel into an on-demand drawer.
- Preserve accessible navigation names when visual labels are clipped.

---

# Mobile Layout


Breakpoint:


<768px


---

# Mobile Navigation


Bottom bar:


Today
Inbox
-
Notes
More


---

# Mobile Today


Order:


Date
Focus
Tasks
Waiting
Check-in
Memo

Daily Check-in and Quick Memo are inline core modules on Mobile Today. Recent
Activity and Upcoming remain in the Utility Drawer.


Prioritize:


Quick visibility.


---

# Mobile Quick Add


Floating button:


Bottom center.


Actions:


Task
Memo
Waiting
Check-in


---

# Mobile Task Interaction


Support:


Tap:

Complete.


Swipe:


Right:

Complete


Left:

More


But:

Never depend only on swipe.


---

# Settings Page


Sections:


Appearance
Theme
Density
Account
Data
Keyboard
About

Phase 0.5 provides the section structure and preference controls only. Account,
Data, Keyboard, and About remain explicit extension slots until their product
requirements are approved.


---

# Appearance


Options:


Theme:


System
Minimal Light
Minimal Dark
Warm Paper
Nordic Blue
Sakura
Forest


---

# Language


Options:


English
中文（简体）


Behavior:


- Default to the browser language when no preference exists.
- Apply language changes immediately without reloading.
- Persist the user's selection.
- Update accessibility labels and the document language.


---

# Density


Options:


Comfortable
Compact


---

# Empty States


Every page requires empty state.


Example:


Waiting:


Nothing waiting.
Track things that are currently
in someone else's hands.


Button:


- Add Waiting


---

# Loading States


Because of Local First:


Loading should be minimal.


Use:


- Skeleton
- Local placeholder


Avoid:


Full screen loading.



---

# Error States


Errors should provide:


1.

What happened.


2.

What user can do.


Example:


Sync paused.
Changes will retry automatically.


---

# Toast Messages


Use for:


- Saved
- Completed
- Synced


Duration:


2-3 seconds.


---

# Animation Specification


Purpose:


Communicate change.


Examples:


Task complete:

Checkbox animation.


Theme switch:

Smooth transition.


Modal:

Fade.


Duration:


100-300ms.


---

# Responsive Rules


Every component must support:


Desktop

Tablet

Mobile


Never create desktop-only important functions.


---

# Local Database Recovery State

Today distinguishes storage failure from Empty State at the page level.

- `opening`: retain the existing loading skeletons.
- `blocked`, `unavailable`, `recovery-required`: replace the data workspace
  with a localized recovery panel and Retry button; do not render empty Widgets.
- `read-only`: keep valid Today data visible, show a persistent recovery banner,
  and hide or disable all mutation and End Day controls.
- `ready`: render normal Loading/Success/Empty Widget states.

Recovery copy must be calm and non-technical. Never show stack traces, browser
storage terminology, raw migration errors, database keys, or user content.
The panel and Retry action must remain keyboard accessible and fit Desktop,
Tablet, and Mobile widths without horizontal overflow.



---

# UI Acceptance Checklist


Before releasing UI:


Check:


## Layout

- Desktop works

- Mobile works


## Theme

- All themes work


## Interaction

- Loading exists

- Empty state exists

- Error state exists


## Accessibility

- Keyboard works

- Focus visible


## Product

Does this make daily work easier?



---

# Final UI Statement


Daily Work OS should not feel like software users need to operate.


It should feel like a personal workspace that is always ready.
