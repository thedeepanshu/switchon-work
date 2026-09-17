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
| 2 | Every keystroke fires a request immediately — no debounce or cancellation | `useAssets.ts` | TODO (Task 1) |
| 3 | No request-ordering guard — a slow response from an older query can overwrite a newer one's results | `useAssets.ts` | TODO (Task 1) |
| 4 | `nextCursor` is stored but never used — only the first 24 assets ever load | `useAssets.ts` | TODO (Task 2) |
| 5 | Entire asset list rendered via `.map`, no virtualization | `AssetGrid.tsx` | TODO (Task 2) |
| 6 | Saving in the detail panel doesn't update the grid — `onSaved` is a no-op | `App.tsx` | TODO |
| 7 | Errors flattened to a string; callers can't branch on `error.code` | `client.ts` | Fixed — `request()` now throws a typed `ApiError` (`status`, `code`, `retryAfterSeconds`, `requestId`) with an `isRetryable` getter encoding API.md's retry matrix. Consumed by the retry layer in Task 4. |
| 8 | No retry/backoff/dedup — any transient 503/429/500 is a hard failure | `client.ts` | TODO (Task 4) |
| 9 | Toggling one card's selection re-renders the entire grid | `AssetGrid.tsx` | TODO |
| 10 | Cards are unreachable by keyboard — `div` + `onClick`, no `tabIndex`, no key handlers | `AssetGrid.tsx` | TODO (Task 5) |
| 11 | Opening/closing the detail panel doesn't manage focus; no Escape handling | `AssetDetail.tsx` | TODO (Task 5) |
| 12 | Missing thumbnails aren't checked via `hasThumbnail` before requesting — renders a broken-image icon | `AssetGrid.tsx`, `AssetDetail.tsx` | TODO |
| 13 | Error and empty states collapse into each other — a fetch failure shows "Nothing matches" underneath the error banner | `App.tsx` / `AssetGrid.tsx` | TODO |
| 14 | No live region — bulk outcomes and errors are silent to a screen reader | `App.tsx` | TODO (Task 5) |
| 15 | Filter/search state lives only in React state, not the URL — reload loses it | `App.tsx` | TODO (next commits) |

---

## Key decisions

For each significant choice: what you did, what you rejected, and why. Three to
six of these is about right.

**Data fetching and caching**

**Stale response handling**

**Virtualization approach**

**Optimistic updates and rollback**

**Retry and backoff policy**

**State placement and URL sync**

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

- Keyboard model you implemented, in one paragraph.
- How you tested it, including any screen reader.
- Known gaps.

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
