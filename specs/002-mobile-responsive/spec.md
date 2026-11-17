# Feature Specification: Mobile Responsive UX

**Feature Branch**: `002-mobile-responsive`

**Created**: 2026-11-17

**Status**: Draft

**Input**: User description: "the UX is not responsive on a mobile app. make it responsive and adapt to mobile usage as necessary for the mobile view. e.g. double tap and hold is painful on a mobile."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Readable layout on a phone screen (Priority: P1)

A user opens the app on a phone (portrait or landscape, ~360–430 px wide) and
sees the story text at a readable size, filling the available width instead of
a desktop layout shrunk to fit. The bottom status tray, gesture legend dialog,
and launch dialog all fit within the viewport without horizontal scrolling or
clipped content. Everything still works when the device rotates or the browser
chrome shows and hides.

**Why this priority**: Today the page has no viewport declaration, so mobile
browsers lay out a ~980 px desktop page and scale it down — text is tiny,
the 14 px knobs become ~5 px effective targets, and the fixed tray overflows.
Nothing else matters until the page is actually usable at phone width.

**Independent Test**: Open the app at a 390×844 viewport with touch emulation;
verify the text column fills the width, all text is legible at 100% zoom, no
element requires horizontal page scrolling, and rotating to landscape re-lays
out correctly.

**Acceptance Scenarios**:

1. **Given** a phone-width viewport, **When** the page loads, **Then** the
   text renders at its intended size (no whole-page zoom-out) and the column
   width adapts to the screen instead of reserving desktop-sized side gutters.
2. **Given** a phone-width viewport, **When** the status tray renders its
   fields, **Then** all tray content fits within the screen width (wrapping,
   condensing, or scrolling as appropriate) with no clipped or overflowing
   controls.
3. **Given** a narrow viewport, **When** the page is scrolled, **Then** no
   decorative layer (ruler, pinned-knob gutters, links) causes horizontal
   overflow or extends beyond the screen edges.
4. **Given** the app is open, **When** the device rotates or the viewport
   resizes, **Then** the text reflows, the caret/knob position stays valid,
   and the reading position is preserved.
5. **Given** a very short landscape viewport, **When** content scrolls, **Then**
   the fixed tray does not cover the line being read.

---

### User Story 2 - Every gesture has a touch-friendly path (Priority: P1)

A touch user can perform every interaction the desktop offers without
precision targeting or multi-step timing tricks: scrub the main knob, expand
and collapse attention, spawn and steer future knobs, create attention boxes
from text, move and delete boxes and knobs, pull the text toward the finger,
and nudge/expand via on-screen controls where no keyboard exists. No gesture
requires double-tap-and-hold, sub-8 px precision, or a hover state to discover.

**Why this priority**: The app's entire value is its gesture vocabulary.
Today only knob dragging and tray taps function on touch; press-pull steering
is explicitly disabled for touch pointers, the fan-menu spawn requires two
taps within 400 ms plus a ~500 ms perfectly still hold on a 14 px target,
attention boxes cannot be created from selected text (the modifier key does
not exist), and there is no on-screen equivalent of the arrow-key nudge.

**Independent Test**: Using only touch input (no mouse, keyboard, or hover)
at phone width, drive the simulator through every gesture listed in the legend
and verify each produces the same end state as its desktop counterpart.

**Acceptance Scenarios**:

1. **Given** a touch device, **When** the user drags the main knob, **Then**
   the text scrubs forward and backward exactly as with a mouse, and the knob
   presents an adequate touch target (visually or via an invisible larger hit
   area).
2. **Given** a touch device, **When** the user performs the gesture that
   expands/collapses attention highlights on desktop, **Then** the same state
   change occurs — either double-tap is made reliable on touch or an
   equivalent single-tap/tap-hold path exists.
3. **Given** a touch device, **When** the user wants to spawn a future knob,
   **Then** a comfortable gesture (e.g. a single long-press, or a visible
   affordance) replaces the desktop double-click-and-hold sequence; accidental
   native long-press selection/callout does not interfere.
4. **Given** a touch device, **When** the user presses and drags in the
   "ahead" region past the caret, **Then** the press-pull steering effect
   engages just as it does for a mouse — the feature is not touch-excluded —
   with a visible affordance showing where the gesture applies.
5. **Given** a touch device, **When** the user selects text and commits it,
   **Then** there is a path to turn the selection into an attention box
   (e.g. selection followed by a control or confirm gesture), since the
   desktop's modifier-key requirement cannot be met.
6. **Given** a touch device, **When** the user wants to nudge the caret or
   expand attention without a keyboard, **Then** on-screen controls provide
   those functions.
7. **Given** a touch device, **When** the user taps a future knob or
   attention box, **Then** the HUD/readout information a desktop user gets
   from hover is available at tap or drag time.

---

### User Story 3 - Touch-appropriate feedback and native-gesture harmony (Priority: P2)

A touch user gets feedback equivalent to the desktop's custom cursor,
proximity highlights, zone cue, and steering vector — expressed through
press states, touch highlights, and on-element affordances rather than a
hover-driven overlay. Native mobile behaviors that conflict (text-selection
callout, context menu, double-tap zoom) are suppressed only where the app's
own gestures need them, and scrolling still works wherever the app does not
claim the touch.

**Why this priority**: The desktop app hides the OS cursor and renders a
custom crosshair with brackets, tether lines, and readouts. Touch already
correctly disables this overlay, but nothing replaces its information — no
zone cue appears, no grabbable-box indication exists, and `touch-action: none`
on the text column silently kills page scrolling. Long-presses can trigger
native selection/callout with no `contextmenu`/`selectstart` handling.

**Independent Test**: On a touch viewport, perform each gesture and verify
the user receives equivalent state feedback (what is grabbed, what zone a
press is in, what a drag will do) without any hover or cursor.

**Acceptance Scenarios**:

1. **Given** a touch device, **When** a press lands in a gesture zone
   (ahead-of-caret, attention box, knob), **Then** the interface shows which
   action the press will perform before or as it begins.
2. **Given** a touch device, **When** the user long-presses text or drags on
   the page, **Then** native selection handles, the callout menu, and
   double-tap zoom do not fire in conflict with app gestures — and text
   remains selectable/copyable where selection is the intended outcome.
3. **Given** a touch device, **When** the page needs to scroll (e.g. beyond
   the reading window), **Then** touch scrolling works in regions the app has
   not claimed for gestures.
4. **Given** a touch device with a hardware keyboard or paired pointer,
   **When** a mouse/pen/keyboard is used, **Then** the existing desktop
   experience (custom cursor, hover states, keyboard shortcuts) is unchanged.

---

### Edge Cases

- Very small screens (≤320 px) or split-screen/browser-chrome-reduced
  heights: does the layout remain usable, or is a defined minimum acceptable?
- Landscape phones (~740×360): the fixed tray consumes a large fraction of
  height; the reading line must not be hidden behind it.
- Touch drag that starts on a knob but wanders — where does the gesture
  claim vs. release the touch (scroll vs. scrub vs. steer)?
- Rapid successive taps on the knob: expand/collapse and fan-spawn gestures
  must not be mutually ambiguous or accidentally trigger each other.
- Pinch-zoom: is zoom allowed (useful for readability) or suppressed? If
  allowed, does the layout survive the resulting viewport change?
- A future knob spawned near the screen edge: the fan HUD and drop zones must
  remain reachable within the viewport.
- Session restore on mobile: caret/boxes/knobs saved on desktop restore into a
  narrower layout — positions must re-anchor correctly.
- Mixed input: user starts a gesture with touch then continues with a paired
  mouse (or vice versa) mid-drag.
- The `extra/` sandbox pages: are they in scope for mobile adaptation or
  explicitly desktop-only?

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The page MUST declare a mobile-appropriate viewport so layout
  uses device width at a 100% initial scale rather than a scaled desktop
  canvas.
- **FR-002**: The text column MUST adapt its width to narrow viewports,
  relaxing the side-gutter reservation (used for the rail and pinned knobs)
  when the viewport cannot accommodate it, while preserving the desktop
  layout unchanged on wide screens.
- **FR-003**: Decorative side layers (ruler, links, pinned-knob labels,
  future-knob labels) MUST NOT cause horizontal overflow on narrow screens;
  they MUST hide, clamp, or relocate gracefully when space runs out.
- **FR-004**: The status tray and both dialogs MUST fit within narrow
  viewports without clipped controls or horizontal page scroll.
- **FR-005**: All interactive targets (knobs, tray controls, future knobs,
  attention boxes) MUST present an adequate touch target — either enlarged
  or backed by an invisible larger hit area — without changing the desktop
  visual design.
- **FR-006**: Touch input MUST support the main knob scrub gesture with
  equivalent scrub semantics (forward, backward/rewind, restore offer).
- **FR-007**: The expand/collapse-attention action MUST be reachable on touch
  without relying on double-click/double-tap timing.
- **FR-008**: Spawning a future knob MUST be possible on touch via a single
  comfortable gesture (e.g. long-press), replacing the double-tap-and-hold
  sequence; the fan/tune/drop flow that follows MUST remain operable by touch.
- **FR-009**: Press-pull steering MUST NOT exclude touch pointers; dragging
  from the ahead-of-caret zone MUST engage the same pull effect, with a
  visible touch affordance indicating the zone (analogous to the desktop
  zone cue and steering vector).
- **FR-010**: Attention-box creation from selected text MUST have a touch
  path that does not require a hardware modifier key.
- **FR-011**: Delete actions for attention boxes and future knobs MUST be
  reachable on touch (reliable double-tap or an equivalent affordance).
- **FR-012**: Keyboard-only functions (caret nudge, expand/collapse) MUST
  have an on-screen touch equivalent.
- **FR-013**: Information desktop users get from hover (fan HUD readouts,
  grabbable-box indication, zone state, tray button hints) MUST be available
  on touch at press/drag time.
- **FR-014**: The app MUST suppress or handle native long-press behaviors
  (selection callout, context menu, double-tap zoom) only where they conflict
  with app gestures, preserving normal text selection/copy where intended.
- **FR-015**: Touch scrolling MUST work in regions not claimed by gestures;
  the app's claimed gesture regions MUST be scoped so they do not silently
  dead-zone the page.
- **FR-016**: The layout MUST respond correctly to viewport changes
  (rotation, resize, browser chrome) by reflowing text and re-anchoring
  gesture targets.
- **FR-017**: Mouse, pen, and keyboard input MUST continue to produce the
  existing desktop experience unchanged; touch-specific adaptations MUST NOT
  regress desktop behavior.
- **FR-018**: The gesture legend (and any onboarding hints) MUST describe the
  touch gestures accurately when the user is on a touch device.
- **FR-019**: A touch-capable end-to-end test path MUST exist so mobile
  gestures can be verified in CI alongside the existing mouse-driven suite.

### Key Entities

- **Viewport / breakpoint context**: the screen size and input-modality
  state that determines which layout and gesture mapping is active.
- **Touch gesture mapping**: the correspondence between each desktop gesture
  and its touch equivalent (or shared implementation with adjusted
  thresholds).
- **Touch affordance layer**: transient visual feedback shown on press/drag
  for touch users, replacing hover/cursor information.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A first-time user on a 390×844 touch viewport can read the
  story text at intended size and perform the scrub gesture within 10 seconds
  of load, with no zoom or horizontal scrolling required.
- **SC-002**: 100% of gestures listed in the legend are completable using
  touch input alone at phone width, each in a single comfortable action or
  drag (no timed multi-press sequences).
- **SC-003**: No interactive target smaller than ~24×24 px effective hit
  area exists on touch viewports (WCAG 2.5.8 minimum target size).
- **SC-004**: Zero horizontal overflow or clipped controls at viewports from
  320 px to desktop width, in both orientations.
- **SC-005**: Desktop regression: the full existing e2e suite passes
  unchanged, and mouse/keyboard gestures behave identically to before.
- **SC-006**: Touch e2e coverage exercises at least the scrub, expand,
  fan-spawn, steering-pull, and box-create gestures on a mobile viewport.

## Assumptions

- "Mobile" means modern smartphone browsers (iOS Safari, Android Chrome)
  at ~320–430 px portrait width; tablets and foldables use the same
  responsive rules.
- The desktop experience is the reference: every desktop gesture keeps its
  meaning on touch, but the physical mapping may differ (e.g. long-press
  instead of double-click+hold).
- Pinch-zoom may remain enabled (it aids readability on small screens); the
  layout MUST survive the resulting viewport changes per FR-016.
- The `extra/` sandbox pages are secondary demonstrators; they SHOULD get a
  viewport declaration and basic non-broken layout, but full gesture parity
  is not required there.
- No new runtime dependencies are anticipated; the platform's built-in touch,
  gesture, and styling capabilities cover the requirements.
- Performance constraints from the constitution (16 ms frame budget,
  cancellation semantics) apply equally to touch-driven interactions.
