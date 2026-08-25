# Daily Work OS

## Product Definition

Daily Work OS is a personal work operating system.

It is a lightweight digital workspace designed for individuals to manage daily work, capture thoughts, track responsibilities, and maintain personal work memory.

It is not a traditional task manager.

It is not:

- Enterprise OA
- Project management software
- Team collaboration platform
- Jira replacement
- Complex productivity system

The product should feel like:

"My personal digital desk."

A place that users open every day before starting work.

---

# Product Vision

Modern work contains many fragmented responsibilities:

- Things I need to do
- Things I already finished
- Things waiting for others
- Things I should remember
- Things I need to follow up later

Most productivity tools focus only on:

"What do I need to do?"

Daily Work OS focuses on:

"What is happening in my work?"

The system helps users:

- Capture information quickly
- Organize responsibilities
- Remember commitments
- Review progress
- Build personal work history

---

# Core Philosophy

## Reduce cognitive load

The product should reduce the user's mental burden.

Users should not spend more energy managing the tool than doing their actual work.

---

## Capture first, organize later

When users have an idea or task, recording it should take seconds.

The system should allow:

Capture now.

Organize later.

---

## Personal responsibility tracking

Traditional Todo apps only track:

"I need to do something."

Daily Work OS also tracks:

"I am waiting for something."

This creates a complete responsibility map.

---

# Target Users

Primary users:

Individual professionals who manage daily knowledge work.

Examples:

- Product managers
- Designers
- Developers
- Operations specialists
- Freelancers
- Entrepreneurs
- Researchers

Especially suitable for people who:

- Handle many small tasks
- Need frequent follow-ups
- Work across multiple projects
- Need daily summaries
- Need personal work memory

---

# Core User Scenario

## Morning

User opens Daily Work OS.

The system shows:

- Today's focus
- Important tasks
- Waiting items
- Daily routines
- Previous unfinished work


User decides:

"What matters today?"

---

## During Work

User continuously captures:

Tasks:

"Update event configuration"

Waiting:

"Waiting for designer to confirm UI"

Memo:

"Remember to check AB test data"

The system records work naturally.

---

## End of Day

User reviews:

- Completed work
- Remaining tasks
- Waiting items
- Notes

The system creates a daily work record.

---

# Core Modules

---

# 1. Today Dashboard

The primary workspace.

Purpose:

Answer one question:

"What should I pay attention to today?"

Contains:

- Focus items
- Today's tasks
- Waiting items
- Daily check-ins
- Quick notes
- Upcoming reminders
- Recent activity

Today is not a database view.

It is a curated workspace.

Focus is not a separate content type. It is an ordered projection of at most
three Tasks selected for a specific local date. The same Task may appear in
Focus and Today's Tasks while retaining one identity and one status.

---

# 2. Tasks

Purpose:

Manage personal actions.

A Task represents:

"Something I need to do."

Examples:

- Write proposal
- Review data
- Prepare meeting
- Update document


Task supports:

- Status
- Priority
- Due date
- Project context
- Notes
- Focus selection

---

# 3. Waiting / Confirmation

This is a core differentiating feature.

A Waiting item represents:

"Something I have done my part, but another person needs to respond."

Examples:

- Waiting for design approval
- Waiting for development estimate
- Waiting for manager decision


Waiting helps users answer:

"What responsibilities are currently outside my control?"

Waiting stores only `waiting`, `confirmed`, or `closed`. “Needs Follow-up” is
attention derived from an open Waiting item's follow-up date and the current
local date; it is not a separate persisted lifecycle state.

---

# 4. Daily Check-in

Purpose:

Track recurring work routines.

Examples:

- Check data dashboard
- Review user feedback
- Check production status
- Write daily report


The goal is not habit building.

The goal is:

"Make sure important recurring work is not forgotten."

---

# 5. Memo

Purpose:

Provide instant personal notes.

Examples:

- Temporary thoughts
- Meeting conclusions
- Ideas
- Important links
- Short reminders


Memo should feel like:

Digital sticky notes.

---

# 6. Inbox

Purpose:

Capture things before deciding where they belong.

Everything can enter Inbox first.

Later convert into:

- Task
- Waiting
- Memo
- Project item

---

# 7. Daily Log

Purpose:

Create personal work memory.

A Daily Log records:

- Completed tasks
- Waiting items
- Important memos
- Completed recurring work

End Day finalization stores an immutable snapshot of the day's relevant work.
Later edits or deletion of live Tasks, Waiting items, or Memos must not rewrite
the user's historical Daily Log.

End Day is a four-step close-out: review today's work, resolve every unfinished
Task as Tomorrow/Later/Keep/Delete, add an optional raw-text summary, and
finalize. Task decisions finish before the Daily Log is written. A user can
finalize a date only once; reopening or replacing a finalized day requires a
future explicit flow and is not available in Phase 1.8.
- Important notes
- Personal summary


Users should be able to answer:

"What did I do last Tuesday?"

---

# 8. Projects

Projects provide context.

Projects are lightweight containers.

They connect:

- Tasks
- Waiting
- Memo
- Activity


Projects are NOT:

- Kanban boards
- Sprint management
- Enterprise project systems

---

# Work Context

Daily Work OS supports switching work context.

Examples:

- All Work
- Project A
- Project B
- Personal


Changing context filters:

- Tasks
- Waiting
- Notes
- Activity


The feeling should be:

"Switching desks."

---

# User Experience Principles

## Fast

Common actions should require minimal interaction.

Examples:

Create task:

1 click + typing.

Create memo:

instant input.

---

## Calm

Avoid:

- Excessive notifications
- Visual noise
- Complex dashboards
- Too many badges

---

## Persistent

User data should always be safe.

The product should support:

- Local storage
- Cloud sync
- Offline usage
- Multiple devices

---

## Personalizable

Users can customize:

- Theme
- Appearance
- Density
- Layout preferences

---

# Multi-device Experience

Daily Work OS supports:

- Desktop browser
- Mobile browser
- Installed PWA


User experience:

Same account.

Same data.

Different interaction style.

Desktop:

Management and review.

Mobile:

Capture and quick actions.

---

# What Daily Work OS Should NOT Become

Avoid becoming:

## A project management system

Do not add:

- Sprint
- Epic
- Story points
- Complex workflows


## A social collaboration platform

Do not add:

- Team chat
- Comments
- Mentions


## A heavy knowledge base

Do not add:

- Complex wiki
- Document hierarchy
- Knowledge graph


## A gamified habit tracker

Do not add:

- Levels
- Rewards
- Streak pressure

---

# Future Possibilities

Potential future extensions:

- AI daily summary
- Automatic work report
- Calendar integration
- Email integration
- Smart follow-up reminders
- Voice capture
- Work analytics


These should not affect MVP architecture.

---

# Product Success Criteria

The product succeeds if users can:

1. Open the app and immediately understand today's priorities.

2. Capture a thought within seconds.

3. Never forget pending responsibilities.

4. Easily review previous work.

5. Feel that the tool helps rather than creates management overhead.

---

# Final Product Statement

Daily Work OS is not a place where users manage tasks.

It is a personal workspace that quietly helps users manage their working life.
