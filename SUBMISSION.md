# Submission

Keep this tight. Bullet points are fine. We read this before we read your code,
and a clear account of your reasoning carries real weight — including where you
chose not to do something.

## Video walkthrough

Paste your Loom (or equivalent) link here. 5–10 minutes.

**Link:**

---

## How to run it

`npm install && npm run dev` is all that's needed — no extra setup, env vars, or
seed step. `npm run dev` runs the mock API (`server/index.mjs`) and Vite
concurrently. Chaos and latency are both on by default; set `CHAOS=0` and/or
`LATENCY=0` as env vars if you want a clean run while reviewing.

## Time spent

Roughly, and how you split it.

---

## Baseline defects found

| # | Defect | Where | Fixed / left / out of scope |
| --- | --- | --- | --- |
| 1 | Bulk update sends >50 ids in one call | `App.tsx` | Fixed — chunked into <=50-id batches, bounded concurrency (3). Optimistic UI + per-id failure handling comes with Task 3. |
| 2 | Every keystroke fires a request immediately — no debounce or cancellation | `useAssets.ts` | Fixed — `q` debounced 300ms; TanStack Query cancels the in-flight request via the AbortSignal passed to `queryFn` whenever the query key changes. |
| 3 | No request-ordering guard — a slow response from an older query can overwrite a newer one's results | `useAssets.ts` | Fixed — everything the response depends on is in `queryKey`; TanStack Query only commits results for the current key, so there's no manual staleness bookkeeping to get wrong. |
| 4 | `nextCursor` is stored but never used — only the first 24 assets ever load | `useAssets.ts` | Fixed — `useAssets` now uses `useInfiniteQuery`; scrolling near the bottom triggers `fetchNextPage`. |
| 5 | Entire asset list rendered via `.map`, no virtualization | `AssetGrid.tsx` | Fixed — row-based virtualization via `@tanstack/react-virtual`; only rows near the viewport are in the DOM. |
| 6 | Saving in the detail panel doesn't update the grid — `onSaved` is a no-op | `App.tsx` | Fixed — `useUpdateAssetMutation` writes optimistically into the shared TanStack Query cache the grid reads from; `onSaved` is now just a user-facing confirmation, not a sync mechanism. |
| 7 | Errors flattened to a string; callers can't branch on `error.code` | `client.ts` | Fixed — `request()` now throws a typed `ApiError` (`status`, `code`, `retryAfterSeconds`, `requestId`) with an `isRetryable` getter encoding API.md's retry matrix. Consumed by the retry layer in Task 4. |
| 8 | No retry/backoff/dedup — any transient 503/429/500 is a hard failure | `client.ts` | Fixed — exponential backoff with full jitter (no Retry-After) or Retry-After-as-floor-plus-jitter (when given), capped at 3 attempts; offline detection via TanStack Query's built-in onlineManager, surfaced with a UI banner; error boundary added; user-facing copy no longer leaks raw server strings. |
| 9 | Toggling one card's selection re-renders the entire grid | `AssetGrid.tsx` | Fixed — extracted a memoized `AssetCard`; `onToggleSelect`/`onOpen` made stable (`useCallback`/state setter) so the memo comparison actually bails out. Verify via Profiler: before/after render count on a single toggle. |
| 10 | Cards are unreachable by keyboard — `div` + `onClick`, no `tabIndex`, no key handlers | `AssetGrid.tsx` | Fixed — roving tabindex (tracked by flat index, not DOM position, since virtualized rows mount/unmount); Arrow/Enter/Space/Shift+Arrow per the keyboard model below. |
| 11 | Opening/closing the detail panel doesn't manage focus; no Escape handling | `AssetDetail.tsx` | Fixed — opening moves focus to the Close button; closing (button or Escape) restores focus to the card that opened it; Escape closes. |
| 12 | Missing thumbnails aren't checked via `hasThumbnail` before requesting — renders a broken-image icon | `AssetGrid.tsx`, `AssetDetail.tsx` | Fixed — shared `AssetThumbnail` component skips the request when `hasThumbnail` is false, and falls back to the same placeholder on a real request failure. |
| 13 | Error and empty states collapse into each other — a fetch failure shows "Nothing matches" underneath the error banner | `App.tsx` / `AssetGrid.tsx` | TODO |
| 14 | No live region — bulk outcomes and errors are silent to a screen reader | `App.tsx` | Fixed — `.notice`/`.error` given `role="status"`/`role="alert"`; a separate visually-hidden live region announces result counts, debounced to fire only once a fetch settles, not per keystroke. |
| 15 | Filter/search state lives only in React state, not the URL — reload loses it | `App.tsx` | Fixed — `q`/`status`/`sort` sync to the URL via `history.replaceState` (no history entry per keystroke); `popstate` restores state on back/forward. `kind`/`tag` aren't in the UI yet, so not yet in the URL either. |

---

## Key decisions

For each significant choice: what you did, what you rejected, and why. Three to
six of these is about right.

**Data fetching and caching**

TanStack Query, chosen over hand-rolling cache/cancellation/dedup logic.
`useAssets` currently uses `useQuery` (single page) rather than
`useInfiniteQuery` — pagination isn't wired up yet (Task 2), and building the
infinite-query shape before the grid actually consumes multiple pages would
be dead code. Search input is debounced 300ms via a small custom hook before
it enters the query key; status/sort changes are not debounced since they're
discrete selections, not continuous typing. `placeholderData` keeps the
previous page's rows visible during a refetch instead of flashing to empty —
surfaced to the UI as a separate `isFetching` flag so "updating in the
background" and "no data at all yet" read differently.

**Stale response handling**

Fixed structurally rather than with manual bookkeeping: every filter that
affects the response (`q`, `status`, `kind`, `tag`, `sort`, etc.) is part of
`queryKey`, and TanStack Query only ever commits the result belonging to the
*current* key, cancelling the previous key's in-flight request via the
`AbortSignal` passed into `queryFn`. There's no request-id counter or
"is this still the latest request" check to get wrong.

**Virtualization approach**

`@tanstack/react-virtual`, row-based rather than cell-based: each virtual
"row" holds however many cards fit an explicit column-count breakpoint
table (6 desktop / 4 laptop / 3 tablet-landscape / 2 tablet-portrait / 1
mobile), checked against the grid's own measured width via `ResizeObserver`
-- a container query in effect, not a viewport media query, so column
count responds correctly to the detail panel opening/closing and not just
window resizes. An earlier continuous "pack in whatever fits a 220px
minimum" version was replaced with these explicit breakpoints: auto-fit
gives an unpredictable column count and degrades to a single full-width
column the moment the container drops below 2x the minimum, which reads as
"broken" rather than "responsive." Row height is estimated from container
width (thumbnails are a fixed aspect ratio, so width determines height)
and then self-corrected per row via `measureElement`, since names can wrap
to a second line and a static estimate would drift. The width measurement
runs in `useLayoutEffect`, not `useEffect`, specifically to avoid a
first-frame flash at `containerWidth = 0` (which would otherwise force a
single full-width column for one frame on every mount). Considered
`react-window`'s `FixedSizeGrid` -- rejected because it wants a fixed row
height up front, which doesn't hold once variable-length names are in
play; would need `VariableSizeGrid` plus manual remeasurement to match
what `measureElement` gives for free. Infinite scroll's "load more"
trigger is driven off the virtualizer's own visible range (fetch when the
last rendered row is within 3 rows of the end) rather than a separate
`IntersectionObserver` sentinel, so there's one source of truth for "how
far has the user scrolled."

**Optimistic updates and rollback**

Both single-asset saves and bulk status changes write directly into the
shared TanStack Query cache via `setQueriesData` (matching on `queryKey:
['assets']`), rather than waiting for a refetch. Single-asset: snapshot the
prior object in `onMutate`, apply the patch immediately, roll back to the
exact snapshot in `onError`, replace with the server's real object (real
`version`) in `onSuccess`. Bulk is the same idea at the per-id level: every
selected id gets the optimistic status immediately; API.md's two distinct
per-id failure codes get different treatment rather than one "failed"
bucket -- `legal_hold` is deterministic and never retried, `conflict` is
random (~7%) and retried up to twice before giving up. Anything still
failing after that is rolled back to its real prior value and stays
selected (rather than being dropped from the selection), so the user can
see at a glance which ids need attention and act on them again without
re-selecting from scratch. 409 `version_conflict` on the single-asset path
is deliberately NOT retried with the same version -- API.md says refetch
first -- so the detail panel refetches the current version and asks the
user to reapply their edit rather than silently overwriting a concurrent
change.

**Retry and backoff policy**

Two distinct delay strategies depending on whether the server told us how
long to wait. When a response carries `Retry-After` (503 and 429 both do),
that value is treated as a floor, not a target — jitter is added only on
top of it (never below), since randomizing below an explicit server
instruction would defeat its purpose. When there's no `Retry-After` (a bare
network failure, for instance), it's exponential backoff with full jitter —
a random value between 0 and the exponential cap, not the cap itself —
because a fixed exponential curve with no randomness means every
simultaneously-failing request (e.g. a burst of thumbnails all hitting a
503 at once) retries in lockstep at exactly 1s, 2s, 4s..., which just
reproduces the thundering herd a moment later. Capped at 3 attempts total.
Offline handling is deliberately NOT hand-rolled: TanStack Query's
onlineManager already listens to the browser's online/offline events and
pauses queries/mutations rather than failing them, resuming automatically
on reconnect — `useOnlineStatus` only exists to surface that state in the
UI, since a silent pause looks identical to a hang. An error boundary
(`ErrorBoundary.tsx`) wraps the app so a render-time exception anywhere in
the tree shows a recoverable fallback instead of a blank screen. All
user-facing error copy is routed through `ApiError.userMessage`
(`describeErrorCode`), so no raw server string like `"429: Too many
requests"` reaches the UI.

**State placement and URL sync**

`q`, `status`, and `sort` live in `App`'s component state (source of truth for
rendering) and are mirrored to the URL via `history.replaceState`, not
`pushState` — filters change on every keystroke, and a history entry per
keystroke would make the back button useless. A `popstate` listener re-reads
the URL into state so back/forward still work. Considered a `useReducer` +
`URLSearchParams`-as-source-of-truth approach instead (URL always
authoritative, state derived from it) — rejected for now because it means
re-parsing the URL on every render path; may revisit if `kind`/`tag` filters
get added and the param surface grows enough to justify it.

---

## Performance

Fill in real measurements, not estimates. Say which machine and browser.

| Metric | Before | After | How measured |
| --- | --- | --- | --- |
| Rendered DOM nodes at 5,000 rows loaded | | | |
| Cards re-rendered when toggling one selection | | | |
| Longest task during sustained scroll | | | |
| Requests fired while typing a 6-character query | | | |
| Production bundle, gzipped | | | |

What was the actual bottleneck, and how did you find it?

---

## Accessibility

- **Keyboard model.** The grid uses a roving tabindex, not
  `aria-activedescendant` — the latter requires the referenced option to
  exist in the DOM at all times focus conceptually rests there, which
  can't hold once its row is virtualized away. Exactly one card has
  `tabIndex={0}` at a time, tracked by flat index into the loaded asset
  list rather than DOM position. Arrow keys move it (Up/Down by the
  current column count, Left/Right by one, wrapping to the next/previous
  row in reading order); Enter opens the detail panel; Space toggles
  selection; Shift+Arrow extends the selection using the same range logic
  as shift-click. Moving focus onto a currently-unmounted row calls the
  virtualizer's `scrollToIndex` to mount it, then a guarded effect
  focuses the real DOM node once it exists — guarded so it never steals
  focus back if the user has since moved it elsewhere (e.g. into the
  search box) for an unrelated reason. If a filter change removes the
  card that currently has focus, focus is reclaimed inside the grid
  (the next card at the same position, or the grid container itself if
  the result set is now empty) rather than silently dropping to `<body>`.
  The detail panel moves focus to its Close button on open, restores
  focus to whichever card opened it on close (via `Close` or Escape), and
  Escape closes it from anywhere.
- **How tested.** Keyboard-only pass (mouse untouched) covering Tab order,
  arrow navigation, Space/Enter, Shift+Arrow range select, Escape, and
  focus behavior on filtering to zero results. Screen-reader pass with
  NVDA 2024.x + Chrome and Windows inbuilt Narrator, covering grid entry, 
  selection-state announcements, the debounced result-count live region, 
  bulk-action outcomes, and the detail panel's opening announcement.
- **Known gaps.**
  - In some interaction patterns, especially multi-select range behavior, `Shift+click` and `Shift+Arrow` selection can become inconsistent or feel glitchy in NVDA. The issue is not limited to one specific UI state; it appears when selection ranges are extended across cards and the virtualized grid updates focus or DOM order while the user is still navigating. Because the list is virtualized and focus is moved programmatically, the announced selection state can lag behind the actual selected range, making the range feel unpredictable and occasionally out of sync with what the user expects.
  - The asset card count announcement is inaccurate in some focus states: NVDA sometimes announces the wrong position within the grid, such as reporting an incorrect item number or an incorrect total count for the current selection. This appears to be caused by the roving focus model plus the virtualized row mount/unmount behavior, where the focused item is not always the same as the visible item being announced by assistive technology. In practice, the user may hear a card labelled as "item 12 of 8" or similar, which reduces trust in the grid and makes orientation harder.
  - While typing in the search/filter field, focus can jump unexpectedly after a word is entered. This interrupts keyboard flow and makes it difficult to continue typing naturally, especially when the user is working in a dense list and expects the caret to remain in place. From an accessibility perspective, this is a serious issue because it breaks standard text-entry behavior and creates a confusing sense that the application is taking control away from the user at exactly the point they are editing content.
  - Error and warning feedback is still not being announced clearly enough to screen reader users. At the moment, the app may show a failure or warning visually, but the associated message is not consistently surfaced as an accessible alert, status update, or user-notification pattern. A visual banner alone is not sufficient when the announcement is not tied to the correct live-region semantics; in a more robust version this should use explicit status/alert regions, snackbars, dialogs, or toast-like notifications with focus management so the user is informed without losing context.

---

## Interface decisions

Three or four sentences: what you were optimising for, and the decisions that
follow from it. Then briefly:

- **Visual system.** Your colour, spacing and type decisions, and where they live.
- **Status treatment.** How the four statuses read as a progression, and how they
  stay distinguishable without relying on colour.
- **States.** What you did with loading, empty, error, offline and partial
  failure.
- **Contrast.** What you checked against, and with what.
- **Copy.** Any user-facing message you rewrote and why.

Screenshots in the repo are welcome — link them here.

---

## Trade-offs and cuts

What you deliberately did not do, and what you would do with another day.

## Critique of the API

What you would change about the backend contract, and what it forced you to do in
the client that you would rather not have.

## Anything you would like us to look at

Code you are proud of, or a decision you are unsure about and want to discuss.

One thing to flag up front rather than let it look like a bug in the demo: on
every initial load in `npm run dev`, you'll see two requests in the network
tab for the same query, with the first cancelled. That's React 18
`StrictMode` (`main.tsx`) intentionally double-mounting components in
development to catch effects that don't clean up properly — the first
mount's request gets a real `AbortController` from TanStack Query, StrictMode
unmounts it immediately (aborting it), then mounts again for the request that
actually completes. It's dev-only diagnostic behavior; `vite build` doesn't
do it. Left `StrictMode` in deliberately rather than removing it to hide
this, since the clean cancellation is evidence the cancellation wiring
(Commit 4) works, not a symptom of it being broken.