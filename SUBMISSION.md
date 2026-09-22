# Submission

## At a glance

- **Project:** MediaVault, a resilient internal media-asset library.
- **Focus:** Making the existing workflow reliable under slow networks, large result sets, partial failures, keyboard-only use, and changing backend data.
- **Main outcomes:** Cursor-based infinite loading, row virtualization, debounced and cancellable search, typed API errors, retries with backoff and jitter, optimistic updates with rollback, recoverable bulk failures, URL-persisted filters, and accessible keyboard navigation.
- **User experience:** Clear loading, empty, error, offline, and partial-success states; stable thumbnail fallbacks; responsive cards and filters; and a detail panel that stays synchronized with the grid.
- **Evidence:** Performance measurements, accessibility testing notes, implementation trade-offs, and known limitations are documented below rather than presented as unsupported claims.
- **Approach:** I prioritized correctness and explainable decisions over adding every possible feature. Where behavior remains imperfect, I have called it out explicitly and described what I would improve next.

## Video walkthrough

- A 5–10 minute walkthrough should cover the main asset workflow, including search, infinite scrolling, keyboard navigation, detail-panel editing, optimistic bulk updates, partial failures, and recovery.
- **Link:** [Click to  view video](https://www.loom.com/share/8491b59174dd4107ad22237eca182c72)

---

## How to run it

- **Requirements:** Node.js `20.11+`.
- **Install and run:** `npm install && npm run dev`.
- **What starts:** The command runs the mock API (`server/index.mjs`) and Vite concurrently.
- **Default review mode:** Chaos and latency are enabled so resilience behavior can be exercised.
- **Clean review mode:** Set `CHAOS=0` and/or `LATENCY=0` when a deterministic, fast run is useful.
- **Extra setup:** No environment file, seed step, or external service is required.

## Time spent

Roughly 25–27 focused hours in total. I received the assessment message on September 14 around 5pm and saw it later that evening. On September 15, I spent around 2–3 hours reading the codebase, `README.md`, and `SUBMISSION.md` carefully to understand the requirements and plan the work.

- **September 16 — around 1 hour:** Initialized the repository, made the initial setup commit, and completed the first bulk-status work, including chunking requests to respect the API's 50-id limit.
- **September 17 — around 4–5 hours:** Replaced flattened string errors with typed `ApiError` handling and clearer user messages; added URL persistence for filters; introduced TanStack Query; and added debounced, trimmed search handling.
- **September 18 — around 3–4 hours:** Investigated query freshness and refetch behavior, documented the data-fetching decisions, added cursor-aware infinite scrolling and row virtualization with TanStack Virtual, and extracted shared and memoized asset components to improve rendering performance.
- **September 19 — around 2 hours:** Implemented optimistic bulk updates with per-asset rollback, retry handling for transient conflicts, range selection, select-all-loaded, optimistic single-asset updates, and `409 version_conflict` handling.
- **September 20 — around 2–3 hours:** Added the resilience layer with backoff and jitter, offline handling, an error boundary, clearer error copy, and further responsive improvements to the asset cards, grid, and filters.
- **September 21 — around 9–11 hours:** Completed the accessibility and interaction pass: added roving keyboard navigation for the virtualized grid, focus management for the detail panel, Escape handling, live-region announcements, and accessible labels. I also improved loading indicators, separated loading/error/empty states, made bulk failures recoverable with expandable details and retry behavior, added dismissible update notices, persisted the type filter in the URL, improved filter controls and responsive layouts, and fixed status synchronization between cards and the detail panel. I spent an additional 2–3 hours testing accessibility behavior, measuring the performance work, and documenting the decisions and results in `SUBMISSION.md`.

The actual time may have been higher because some of these areas were new to me and I spent additional time understanding the requirements, exploring implementation options, and validating the behavior. I put in the extra effort because this opportunity is important to me professionally, and I wanted to approach it with real commitment rather than only complete the minimum requirements. Several parts of the task were outside my strongest areas, but that became part of the motivation: I wanted to understand how these patterns work in practice and leave with stronger experience, not just a finished demo. I also used Claude, ChatGPT, and the VS Code AI agent tools for code reading, unfamiliar concepts, implementation feedback, and improving the submission notes. I remained responsible for the decisions, implementation, and validation throughout.

---

## Baseline defects found

| # | Defect | Where | Fixed / left / out of scope |
| --- | --- | --- | --- |
| 1 | Bulk update sends >50 ids in one call | `App.tsx` | Fixed — chunked into <=50-id batches with bounded concurrency (3), optimistic UI, and per-id failure handling. |
| 2 | Every keystroke fires a request immediately — no debounce or cancellation | `useAssets.ts` | Fixed — `q` debounced 300ms; TanStack Query cancels the in-flight request via the AbortSignal passed to `queryFn` whenever the query key changes. |
| 3 | No request-ordering guard — a slow response from an older query can overwrite a newer one's results | `useAssets.ts` | Fixed — everything the response depends on is in `queryKey`; TanStack Query only commits results for the current key, so there's no manual staleness bookkeeping to get wrong. |
| 4 | `nextCursor` is stored but never used — only the first 24 assets ever load | `useAssets.ts` | Fixed — `useAssets` now uses `useInfiniteQuery`; scrolling near the bottom triggers `fetchNextPage`. |
| 5 | Entire asset list rendered via `.map`, no virtualization | `AssetGrid.tsx` | Fixed — row-based virtualization via `@tanstack/react-virtual`; only rows near the viewport are in the DOM. |
| 6 | Saving in the detail panel doesn't update the grid — `onSaved` is a no-op | `App.tsx` | Fixed — `useUpdateAssetMutation` writes optimistically into the shared TanStack Query cache the grid reads from; `onSaved` is now just a user-facing confirmation, not a sync mechanism. |
| 7 | Errors flattened to a string; callers can't branch on `error.code` | `client.ts` | Fixed — `request()` now throws a typed `ApiError` (`status`, `code`, `retryAfterSeconds`, `requestId`) with an `isRetryable` getter encoding API.md's retry matrix. The query retry policy consumes that classification. |
| 8 | No retry/backoff/dedup — any transient 503/429/500 is a hard failure | `client.ts` | Fixed — exponential backoff with full jitter (no Retry-After) or Retry-After-as-floor-plus-jitter (when given), capped at 3 retries after the initial request; offline detection via TanStack Query's built-in onlineManager, surfaced with a UI banner; error boundary added; user-facing copy no longer leaks raw server strings. |
| 9 | Toggling one card's selection re-renders the entire grid | `AssetGrid.tsx` | Fixed — extracted a memoized `AssetCard`; `onToggleSelect`/`onOpen` made stable (`useCallback`/state setter) so the memo comparison actually bails out. Verify via Profiler: before/after render count on a single toggle. |
| 10 | Cards are unreachable by keyboard — `div` + `onClick`, no `tabIndex`, no key handlers | `AssetGrid.tsx` | Fixed — roving tabindex (tracked by flat index, not DOM position, since virtualized rows mount/unmount); Arrow/Enter/Space/Shift+Arrow per the keyboard model below. |
| 11 | Opening/closing the detail panel doesn't manage focus; no Escape handling | `AssetDetail.tsx` | Fixed — opening moves focus to the Close button; closing (button or Escape) restores focus to the card that opened it; Escape closes. |
| 12 | Missing thumbnails aren't checked via `hasThumbnail` before requesting — renders a broken-image icon | `AssetGrid.tsx`, `AssetDetail.tsx` | Fixed — shared `AssetThumbnail` component skips the request when `hasThumbnail` is false, and falls back to the same placeholder on a real request failure. |
| 13 | Error and empty states collapse into each other — a fetch failure shows "Nothing matches" underneath the error banner | `App.tsx` / `AssetGrid.tsx` | Fixed — mutually exclusive rendering: initial load shows the loading state, an initial fetch failure shows only the error state, a successful zero-result response shows "Nothing matches", and refetch errors preserve the existing assets while showing an alert. |
| 14 | No live region — bulk outcomes and errors are silent to a screen reader | `App.tsx` | Fixed — `.notice`/`.error` given `role="status"`/`role="alert"`; a separate visually-hidden live region announces result counts, debounced to fire only once a fetch settles, not per keystroke. |
| 15 | Filter/search state lives only in React state, not the URL — reload loses it | `App.tsx` | Fixed — `q`/`status`/`kind`/`sort` sync to the URL via `history.replaceState` (no history entry per keystroke); `popstate` restores state on back/forward. |

---

## Key decisions

For each significant choice: what you did, what you rejected, and why. Three to
six of these is about right.

**Data fetching and caching**

TanStack Query, chosen over hand-rolling cache/cancellation/dedup logic.
`useAssets` uses `useInfiniteQuery` with cursor pagination; each filter
combination gets its own query key and changing a filter starts a fresh page
sequence. Search input is debounced 300ms via a small custom hook before it
enters the query key; status, kind, and sort changes are not debounced since
they are discrete selections, not continuous typing. `placeholderData` keeps
the previous pages' rows visible during a refetch instead of flashing to empty
— surfaced to the UI as a separate `isFetching` flag so "updating in the
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
`version`) in `onSuccess`. Bulk is the same idea at the per-id level: each
selected id currently present in the cache gets the optimistic status
immediately; IDs not currently cached are sent to the API but are not shown
optimistically. The API's three per-id failure codes get different
treatment: `legal_hold` and `not_found` are deterministic terminal failures,
while `conflict` is random (~7%) and retried up to twice before giving up.
Anything still failing after that is rolled back to its real prior value and
stays selected (rather than being dropped from the selection), so the user
can see at a glance which ids need attention and act on them again without
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
reproduces the thundering herd a moment later. Capped at 3 retries after the
initial request.
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

**Machine / browser:** Windows 11 25H2, 13th Gen Intel Core i5-13500H, 16 GB RAM, Chrome 153.0.8010.48 (Official Build, 64-bit), Incognito, no CPU/network throttling. Both projects measured with `npm run dev`, so absolute timings include dev-mode overhead (StrictMode, unminified React) but the comparison is like-for-like. A slower device may show long tasks that this machine masks.

**Comparison method:** the original project only ever loads 24 assets (no pagination), so for
scale-dependent rows I raised its page size to 114 and compared it against the current project
with the same 114 items loaded. "Before" = original code, "After" = current code. Chaos and
latency were off (`CHAOS=0 LATENCY=0`) for both projects in the typing test.

| Metric | Before | After | How measured |
| --- | --- | --- | --- |
| Rendered DOM nodes at 114 rows loaded | 798 (all 114 cards mounted) | 206 (28 of 114 cards mounted) | Console: `document.querySelector('.grid').querySelectorAll('*').length`; 7 nodes per card in both |
| Cards re-rendered when toggling one selection | 24 (all loaded cards; cards are inline in AssetGrid's .map, no memo boundary) | 1 (of N mounted; only the toggled card re-rendered, reason: selected prop changed) | React DevTools Profiler, single checkbox toggle |
| Longest task during sustained scroll | 0 ms (no task >50ms) | 0 ms (no task >50ms) | PerformanceObserver (longtask), ~5s continuous scroll, N=~114 in both |
| Requests fired while typing a 6-character query | 6 (one request per keystroke, no debounce) | 1 (300ms debounce; typed "poster") | Chrome DevTools Network tab, Fetch/XHR filter, typed "poster" at normal speed; 2 runs each, identical counts |
| Production bundle, gzipped | 48.30 kB gzipped (original JS bundle, measured; matches the README's 48 kB) | 74.03 kB gzipped (+25.73 kB, about +53%) | npm run build, Vite output (gzip column), main JS chunk |

**Notes**
- **Re-renders:** in the original, cards are inline JSX in `AssetGrid`'s `.map`. The Profiler
  showed only `App` and `AssetGrid` rendering, so the "24" is inferred from that plus the code
  (all loaded cards re-render with their parent), not a per-card reading. It was taken at the
  original's default page size, not at 114.
- **Scroll:** no long tasks in either project at N=114, so I can't claim a scroll-smoothness win.
  Total scripting time was higher in the current project (736 ms vs 102 ms in the Performance
  summary), which is the cost of running the virtualizer during scroll.
- **DOM nodes:** the grid subtree grows linearly in the original (798 nodes at 114 cards) and
  stays bounded in the current project because only rows near the viewport are mounted.
- **Bundle:** larger because TanStack Query and TanStack Virtual add real weight (36 → 97
  modules). That is the cost of the caching, cancellation, retry, and virtualization behaviour.

**What was the actual bottleneck, and how did I find it?**
At this scale it wasn't scroll smoothness. The Performance panel and a `longtask` observer
showed no task over 50 ms in either project, so I can't claim a scroll win. The measured
problems were:
1. **Re-render scope:** the Profiler showed only `AssetGrid` re-rendering on a checkbox toggle,
   with no card boundary, so every card re-rendered with it. After extracting a memoized
   `AssetCard`, the Profiler showed 1 card rendering with "Props changed: selected".
2. **Request count:** the Network tab showed 6 `/api/assets` calls for a 6-character query,
   one per keystroke. Now 1.
3. **Unbounded DOM:** grid nodes scale linearly with loaded items in the original. Now bounded.
Jank from an un-virtualized grid would likely appear at larger N; I did not measure that.

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

I focused on making the asset workflow clear during slow, unsuccessful, and partial requests, while keeping the dense grid easy to scan. The interface now gives feedback close to the action: loading indicators show when the list or a status update is in progress, and the final result explains what succeeded and what needs attention. I also prioritized a stable responsive layout so asset names, controls, and filters remain usable instead of being clipped or hidden.

- **Visual system.** I kept the existing visual direction and improved the spacing, card layout, filter controls, and responsive behavior. Asset cards now reserve a reliable media area, show the name and status clearly, and remain readable when names wrap. The filter row uses consistent controls and adapts as the available width changes.
- **Status treatment.** The four statuses are shown with text labels and distinct visual treatments so they are not communicated by colour alone. Status buttons also show an inline loading indicator while an update is being saved, which makes it clear which action is in progress.
- **States and feedback.** I added proper loading, empty, error, offline, and partial-success states. Bulk updates report the number of successful and failed assets, provide a details toggle for the failed names and reasons, and keep unsuccessful assets selected with a red visual treatment so they can be reviewed or retried. Notices can be dismissed instead of remaining on screen until refresh. I chose a dismissible in-page notice for this submission; a snackbar or toast system would be a good next refinement.
- **Media fallback.** Missing thumbnails or invalid media URLs no longer display a broken-image state. Both the card and detail panel show a consistent grey `No preview` placeholder, preserving the layout and giving the user a clear explanation.
- **Contrast and accessibility.** I checked the interface with keyboard navigation and screen readers, including focus movement, selection announcements, status feedback, and the detail panel. Important feedback also uses status or alert semantics rather than relying only on colour or visual placement.
- **Copy.** I replaced vague or raw request errors with short user-facing messages, while keeping the useful detail available for partial bulk failures. The goal was to tell the user what happened and what action is possible next without exposing server implementation text.

---

## Trade-offs and cuts

- I focused on the main asset workflow: searching, filtering by status, scrolling through assets, selecting multiple assets, bulk status updates, and editing an asset from the detail panel.
- Asset IDs are useful internally, but there is no need to show them to users in the main UI. They add visual noise without helping most users recognize an asset, so the interface should prioritize meaningful information such as the name, thumbnail, status, and tags.
- I chose retrying failed bulk updates instead of implementing an undo action. Failed assets remain selected so the user can retry them, while successful updates are kept.
- I did not reorder selected assets to the top of the grid. That would be a useful interaction for bulk work: selecting an asset would move it to the top, and clearing the selection would return it to its original position. I kept the API's result order unchanged for now because moving cards changes their virtualized indexes, keyboard focus, and scroll position, and restoring the original order would require a separate stable-order model. This is a feature I would add with more time, with a clear visual treatment so the reordering does not feel unexpected.
- Infinite scrolling keeps the loaded pages for each filter combination in the TanStack Query cache. When I remove a filter and return to a previous query after its 15-second fresh period, the cached pages can be requested again in cursor order so the client can refresh the results. This uses more requests, but avoids showing old paginated data as if it were current. I disabled refetch-on-window-focus because returning to the browser tab should not automatically reload the whole list.
- Opening an asset in the detail panel can show two requests in development because React `StrictMode` intentionally mounts, cleans up, and mounts the panel again. The first request is cancelled by TanStack Query and the second is the request that completes. This is development-only behavior; an already-mounted panel normally makes one request when its asset id changes.
- I kept the existing project structure and organized the new work mainly around the assets feature, rather than doing a larger folder-structure refactor. A more polished version would separate shared UI, API concerns, query logic, and feature-specific mutations more consistently, but changing the structure during the assessment would have added churn without improving the user-facing behavior I was measuring.
- Virtualization and TanStack Query add bundle size and implementation complexity, but I accepted that cost to keep the DOM size bounded and handle loading, cancellation, caching, and retries correctly.
- I did not add a full automated test suite within the assessment time. I validated the main flows manually, including bulk failures, retries, detail-panel updates, keyboard navigation, and loading/error states.
- **Known remaining limitation:** if I search for `113`, filter to `draft`, and change a matching asset to `in_review`, the backend is updated and the card shows `in_review`, but it can remain visible in the `draft`-filtered list. The optimistic mutation updates the asset in place in the cache; it does not yet re-evaluate every cached query and remove assets that no longer match that query's filters. A complete fix would either invalidate and refetch the affected list queries or apply the query predicates while updating each cache, while preserving optimistic rollback and pagination counts.
- **Known feedback limitation:** bulk-update results appear in the global notice above the asset list, while detail-panel failures appear only inside the panel. This can also leave an older global success message visible after a later detail-panel failure, which makes the feedback confusing. A better approach would use one consistent temporary notification pattern for both workflows, clear or replace stale messages when a new mutation starts, and keep the relevant error visible near the action that caused it.

## Critique of the API

- **Keep validation consistent between bulk and single updates.** I found one confusing difference with assets such as `Weekend Market Alt MV-11394`, which has the `legal-hold` tag. The bulk endpoint rejects the asset for *any* status change, while the detail-panel endpoint only rejects changing it to `archived`. This means selecting the asset and changing it to another valid status can fail in bulk but succeed from the detail panel. Both endpoints should share the same rule and return the same error semantics: legal-hold assets cannot be archived, but other status changes are allowed. Because the API currently behaves differently, the client has to explain two outcomes for what looks like the same action.
- **Clarify the search contract.** Searching for an ID such as `a_00001` does not return a result because `q` only searches asset names and tags. I think that is reasonable for the main user-facing search, since users are more likely to search for a name or tag than an internal ID. If exact ID lookup is needed for support or debugging, I would add a separate explicit ID search or lookup control rather than making the normal search field behave differently from its documented contract.

## Anything you would like us to look at

- One thing to flag up front rather than let it look like a bug in the demo: on
every initial load in `npm run dev`, you'll see two requests in the network
tab for the same query, with the first cancelled. That's React 18
`StrictMode` (`main.tsx`) intentionally double-mounting components in
development to catch effects that don't clean up properly — the first
mount's request gets a real `AbortController` from TanStack Query, StrictMode
unmounts it immediately (aborting it), then mounts again for the request that
actually completes. It's dev-only diagnostic behavior; `vite build` doesn't
do it. Left `StrictMode` in deliberately rather than removing it to hide
this, since the clean cancellation demonstrates that the request cancellation
wiring works as intended, not that it is broken.