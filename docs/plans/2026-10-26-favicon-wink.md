# Favicon Wink Implementation Plan

> **For Claude:** Implement task-by-task with TDD (write test → see it fail → implement → see it pass → commit).

**Goal:** The favicon lamp blinks red twice at exactly the moment the logo lamp does (the existing "wink" easter egg), also when the tab is in the background.

**Architecture:** Move the wink *timing* out of `Logo.tsx` into one shared scheduler module. The scheduler runs its timers in a dedicated Web Worker created from an inline Blob (Chrome throttles main-thread timers in background tabs to 1/s, and after 5 min to 1/min — a favicon could stay red for a minute; dedicated-worker timers are not throttled that way). The worker posts `wink-start`, then per-frame `lens` messages (`red`/`teal`) matching the CSS keyframes, then `wink-end`. `Logo` subscribes to start/end (drives the existing `data-wink` CSS animation, unchanged), a new favicon hook subscribes to the lens frames and swaps `<link rel="icon">` between two SVG data URIs. When `Worker` is unavailable (jsdom, old browsers) the scheduler falls back to main-thread `setTimeout` with identical semantics.

**Tech Stack:** Next.js 15 (app router), React 18, TypeScript, Vitest + jsdom + Testing Library.

---

## Context the implementer needs

- Read first: `src/components/brand/Logo.tsx` (current `useWink`), `src/app/globals.css` lines ~135–177 (`.ln-logo`, `@keyframes ln-wink`), `src/app/icon.svg` (static favicon, Next serves it automatically and emits the `<link rel="icon">`), `brand/LOGO-SPEC.md`.
- Keyframes: `ln-wink` lasts **1600 ms**, `step-end`: red at 15 %–35 % and 65 %–85 %. So lens is **red at 240 ms, teal at 560 ms, red at 1040 ms, teal at 1360 ms**, wink ends at 1600 ms.
- Wink delay: uniform random 60 000–180 000 ms (keep the existing constants and their Polish comments — move them, don't duplicate).
- Colours: teal `#18b2a3`, red `#e5322d`, bezel `#8a9099` (from `icon.svg` / globals.css).
- `prefers-reduced-motion: reduce` → no wink at all (neither logo nor favicon), same as today.
- The wink only runs where `<Logo wink />` is rendered (currently the overview, `OverviewView.tsx:95`). Favicon wink follows the same rule — it is enabled by the `wink` prop of `Logo`, not globally.
- Code style: comments in Polish, matching the density in `Logo.tsx`. Immutability, small functions, no `console.log`.
- Commands: `npx vitest run <path>`, `npm test`, `npx tsc --noEmit`, `npx next lint` (if configured), `npm run build`.
- Do NOT touch `scripts/build-logo.mjs` or the generated logo file.

## Task 1: Frame timeline as pure data

**Files:**
- Create: `src/lib/brand/wink-timeline.ts`
- Test: `src/lib/brand/__tests__/wink-timeline.test.ts`

Export:
```ts
export const WINK_MIN_DELAY_MS = 60_000;
export const WINK_MAX_DELAY_MS = 180_000;
export const WINK_DURATION_MS = 1_600; // musi być równe czasowi `ln-wink` w globals.css
export type LensColor = 'red' | 'teal';
/** Klatki soczewki względem startu mrugnięcia — odwzorowanie keyframes `ln-wink`. */
export const WINK_FRAMES: ReadonlyArray<{ atMs: number; lens: LensColor }> = [
  { atMs: 240, lens: 'red' }, { atMs: 560, lens: 'teal' },
  { atMs: 1040, lens: 'red' }, { atMs: 1360, lens: 'teal' },
];
export function nextWinkDelayMs(random: () => number = Math.random): number
```
Tests: delay bounds for random 0 and ~1; frames sorted, last frame is teal, all `atMs < WINK_DURATION_MS`; a test that reads `src/app/globals.css` (fs) and asserts the `ln-wink` keyframe percentages `15%, 65%` / `35%, 85%` and `1.6s` still correspond to `WINK_FRAMES`/`WINK_DURATION_MS` (guards drift between CSS and JS).

Commit: `feat(brand): wink timeline shared by logo and favicon`

## Task 2: Wink scheduler (worker + fallback)

**Files:**
- Create: `src/lib/brand/wink-scheduler.ts`
- Test: `src/lib/brand/__tests__/wink-scheduler.test.ts`

API:
```ts
export type WinkEvent = { type: 'wink-start' } | { type: 'lens'; lens: LensColor } | { type: 'wink-end' };
export interface WinkScheduler { subscribe(listener: (e: WinkEvent) => void): () => void }
export function createWinkScheduler(deps?: {
  createWorker?: () => WorkerLike | null;   // default: inline Blob worker, null when Worker/Blob/URL.createObjectURL missing or throws
  setTimeoutFn?: typeof setTimeout; clearTimeoutFn?: typeof clearTimeout; random?: () => number;
}): WinkScheduler
export const winkScheduler: WinkScheduler; // lazily-started singleton used by components
```
Behaviour:
- Ref-counted: the timer/worker starts on the first subscriber and is fully stopped (worker `terminate()`, `URL.revokeObjectURL`, timers cleared) when the last one unsubscribes. All subscribers receive the same events → logo and favicon are in sync by construction.
- Worker script is a string built from the constants of Task 1 (interpolate the numbers; do not duplicate literals). It loops: wait `nextWinkDelayMs` → post `wink-start` → post each frame at its offset → post `wink-end` at `WINK_DURATION_MS` → repeat. Random number generation happens inside the worker.
- Fallback path (no worker): same sequence with `setTimeoutFn` on the main thread.
- If the worker emits `error`, terminate it and switch to the fallback (no silent dead wink).
- SSR-safe: nothing touches `window`/`Worker` at import time.
Tests (use the fallback with `vi.useFakeTimers()` + injected `random`, and a fake `WorkerLike` for the worker path): event order and timing; two subscribers get identical events; unsubscribe of last listener stops timers (no events after); worker path forwards `postMessage` data to listeners and terminates on last unsubscribe; worker error → fallback continues emitting.

CSP note: check `next.config.mjs` and `docker`/nginx config in the repo for a `Content-Security-Policy` header; if one exists and lacks `worker-src blob:`, report it in your final summary (do not silently weaken CSP).

Commit: `feat(brand): wink scheduler with background-safe worker timer`

## Task 3: Logo uses the scheduler

**Files:**
- Modify: `src/components/brand/Logo.tsx` (replace the internal `setTimeout` loop in `useWink`)
- Test: `src/components/brand/__tests__/Logo.test.tsx` (existing tests must keep passing; adapt only mechanics, not assertions about behaviour)

`useWink(enabled)` subscribes to `winkScheduler` (inject via optional prop or module mock in tests): `wink-start` → `setIsWinking(true)`, `wink-end` → false. Keep the reduced-motion guard and the cleanup that resets `isWinking`.

Commit: `refactor(brand): logo wink driven by shared scheduler`

## Task 4: Favicon follows the lens

**Files:**
- Create: `src/lib/brand/favicon.ts` (pure: `faviconDataUri(lens: LensColor): string` — the same SVG as `src/app/icon.svg` with the lens fill swapped, `encodeURIComponent`-encoded `data:image/svg+xml,...`)
- Create: `src/components/brand/useFaviconWink.ts`
- Modify: `src/components/brand/Logo.tsx` — call `useFaviconWink(wink && !reducedMotion)`
- Tests: `src/lib/brand/__tests__/favicon.test.ts`, `src/components/brand/__tests__/useFaviconWink.test.tsx`

`useFaviconWink(enabled)`:
- On `lens` events set the `href` of every `link[rel~="icon"]` in `document.head` to the data URI for that colour; remember each link's original `href` on the first change.
- On `wink-end` and on unmount/disable restore the original `href`s (never leave a red favicon behind).
- If no icon link exists, do nothing (don't create one).
Tests: red then teal swaps hrefs; unmount mid-wink restores original; teal data URI equals `icon.svg` content semantically (parse both, compare lens fill + circles) so the static and dynamic icons can't drift.

Commit: `feat(brand): favicon lamp winks with the logo`

## Task 5: Verification

1. `npm test` — all green; `npx tsc --noEmit` clean; `npm run build` succeeds.
2. Manual check note for the final report: in dev (`NEXT_PUBLIC_DATA_SOURCE=mock npm run dev`), temporarily lowering the delay is NOT to be committed. Describe how the reviewer can verify (e.g. devtools: `document.querySelector('link[rel~=icon]').href` during a wink).
3. Final summary: files changed, test counts, CSP finding, anything you could not verify.
