# Daily Work OS Design System

Version: 1.0


# Overview

Daily Work OS is a personal digital workspace.

The interface should feel like:

"My own desk."

The design should create a feeling of:

- Calm
- Focus
- Trust
- Personal ownership
- Long-term usability


The product is designed for daily use.

Users may keep the app open for several hours every day.

Therefore:

Visual fatigue must be minimized.

Information should be clear but not overwhelming.


---

# Design Principles


## 1. Calm over flashy

The interface should avoid unnecessary visual stimulation.

Prefer:

- Soft contrast
- Clear hierarchy
- Subtle borders
- Gentle animation


Avoid:

- Large gradients
- Excessive shadows
- Loud colors
- Heavy cards
- Marketing-style layouts


---

## 2. Content over decoration

The user's work content is the focus.

The UI should support information.

The UI should not compete with information.


Priority:

1. Content
2. Structure
3. Interaction
4. Decoration


---

## 3. Desktop workspace feeling

The application should feel closer to:

- A personal desk
- A notebook
- A workspace


Not:

- Enterprise dashboard
- Admin panel
- CRM


---

# Visual References

The design direction can be inspired by:

- Linear
- Things
- Craft
- Notion
- Raycast


However:

Do not copy any specific product.

The final feeling should be unique.


---

# Layout Philosophy


## Desktop

Desktop uses a workspace layout.

Structure:

Sidebar
-
Main Workspace
-
Utility Panel


The interface should feel like a desktop application.


---

## Mobile

Mobile is not a compressed desktop.

Mobile focuses on:

- Capture
- Review
- Quick action


Mobile structure:

Top Header
Content
Bottom Navigation


---

# Spacing System


Use consistent spacing tokens.

Recommended scale:

4px
8px
12px
16px
24px
32px
48px
64px


Rules:

Small spacing:

icons and text.

Medium spacing:

components.

Large spacing:

sections.


Avoid random spacing values.


---

# Typography


Typography should prioritize readability.

Recommended:

System fonts.

Example:

-apple-system
BlinkMacSystemFont
Segoe UI
Inter
Roboto


Hierarchy:


## Page Title

Large.

Used for:

Today
Projects


## Section Title

Medium.

Used for:

Tasks
Waiting
Check-in


## Body

Primary information.


## Secondary Text

Metadata:

- Date
- Time
- Status


Avoid excessive font sizes.


---

# Color System


All colors must use design tokens.

Never hardcode colors inside components.


Example:

Wrong:

```css
color:#333;
Correct:
color:var(--text-primary);
Color Tokens
Background
--bg-primary

--bg-secondary

--surface

--surface-hover
Text
--text-primary

--text-secondary

--text-muted
Border
--border

--border-hover
Accent
--accent

--accent-hover

--accent-soft
Status
Success:
--success
Warning:
--warning
Danger:
--danger
Border
Default:
Subtle.
Use borders to:
- Separate sections
- Define cards
- Create hierarchy
Avoid:
Heavy borders everywhere.
Radius System
Use limited radius values.
--radius-sm

--radius-md

--radius-lg
Recommended:
Buttons:
small
Cards:
medium
Large containers:
large
Avoid:
Every element having different radius.
Shadow System
Shadows should be subtle.
Tokens:
--shadow-sm

--shadow-md

--shadow-lg
Use mainly for:
- Popover
- Modal
- Floating panel
Avoid:
Card everywhere with shadow.
Animation System
Animations exist only for feedback.
Examples:
Task completed:
checkbox transition
Modal:
fade + slight movement
Theme switching:
smooth transition
Duration:
Fast:
100-150ms
Normal:
200-250ms
Slow:
300-400ms
Avoid:
- Bounce
- Large movement
- Decorative animation
Component Principles
Every component must:
1. Support all themes.
2. Support responsive layout.
3. Use design tokens.
4. Have clear states.
Component States
Every interactive component needs:
Default
Hover
Active
Focus
Disabled
Loading
Error
Core Components
Button
Variants:
Primary

Secondary

Ghost

Danger
Rules:
Avoid excessive button styles.
Input
Must support:
- Default
- Focus
- Error
- Disabled
Input should feel lightweight.
Checkbox
Important component.
Used for:
- Tasks
- Routine
Animation:
Small and satisfying.
Card
Cards should group information.
Not every item needs a card.
Prefer:
flat layout.
Use cards only when needed.
Widget
Dashboard modules.
Examples:
- Today Tasks
- Waiting
- Check-in
Widget structure:
Header

Content

Optional Footer
Theme System
Themes are a first-class feature.
Theme changes should affect:
- Background
- Surface
- Text
- Border
- Accent
- Components
- Sidebar
- Widgets
All themes must share the same component system.
Built-in Themes
1. Minimal Light
Mood:
Clean productivity.
Characteristics:
- White background
- Neutral gray
- High readability
- Professional
Feeling:
Focused office desk.
2. Minimal Dark
Mood:
Night workspace.
Characteristics:
- Dark gray background
- Soft contrast
- Comfortable for long sessions
Avoid pure black.
3. Warm Paper
Mood:
Notebook + wooden desk.
Characteristics:
- Warm cream background
- Soft brown accent
- Paper feeling
- Slightly nostalgic
Target feeling:
Quiet personal studio.
4. Nordic Blue
Mood:
Scandinavian calm.
Characteristics:
- Cool gray
- Soft blue
- Clean spacing
Feeling:
Modern calm workspace.
5. Sakura
Mood:
Japanese soft minimalism.
Characteristics:
- Warm white
- Soft pink accent
- Gentle atmosphere
Avoid:
Cute / childish style.
6. Forest
Mood:
Natural workspace.
Characteristics:
- Warm neutral background
- Sage green
- Forest accent
Feeling:
Nature + concentration.
Theme Implementation
Theme files:
styles/

themes/

minimal-light.css

minimal-dark.css

warm-paper.css

nordic-blue.css

sakura.css

forest.css
Themes should only modify tokens.
Components should not know about themes.
Density System
Support:
Comfortable
Default.
More whitespace.
Better readability.
Compact
For power users.
Higher information density.
Stored in:
UserPreferences.density

Phase 0.5 token contract:

- Typography: `--font-size-*` and `--line-height-*`
- Geometry: `--radius-*`, including pill and circle
- Layout: sidebar, utility panel, header, and mobile navigation dimensions
- Interaction: control and minimum touch-target heights
- Layering: `--z-*`
- Density: content padding, section gap, and row padding

Components consume semantic tokens only. Theme files own color values, while
global tokens own scale, geometry, layout, interaction, layering, and density.
Icon System
Use:
Lucide Icons
Rules:
- Consistent stroke width
- Avoid decorative icons
- Icons support meaning
Empty State Design
Empty states should guide users.
Example:
Waiting:
Nothing waiting.

Track things that are currently
in someone else's hands.
Avoid:
Generic:
"No data"
Notification Design
Notifications should be calm.
Prefer:
Small toast.
Inline message.
Avoid:
Large modal interruption.
Mobile Design Rules
Touch target:
minimum:
44px
Avoid:
Hover dependent interaction.
All important actions must have visible alternatives.
Accessibility
Support:
- Keyboard navigation
- Screen readers
- Focus states
- Reduced motion
Respect:
prefers-reduced-motion
Design Quality Checklist
Before merging UI changes:
Check:
- Does it work in all themes?
- Does it work on mobile?
- Are tokens used?
- Are states complete?
- Is the interface calmer or noisier?
- Does it reduce user effort?
Final Design Statement
Daily Work OS should feel like:
A quiet personal desk.
A place where work becomes organized naturally.
The interface should disappear.
The user's work should remain visible.
