# Stale Data Hold Implementation Plan

> **For Claude:** Implement task-by-task with TDD (write test → see it fail → implement → see it pass → commit).

**Goal:** When data stops arriving (whole WebSocket, or a single area's PLC), tiles keep showing the last known values for up to 2 minutes instead of greying out to "—", and the bottom status bar (AlarmBar, which today shows alarms or "WSZYSTKO OK") explains the situation with a running timer. After 2 minutes the current grey "—" presentation returns.

**Architecture:** Each `AreaSnapshot` gets `lastFreshAt` (client-clock epoch ms of the last frame in which that area was online). A pure function derives a display state per area — `live` / `held` (offline < 2 min, had data) / `unavailable` (offline ≥ 2 min, or never had data) — from `isOnline`, `lastFreshAt` and `now`. Every view that today greys out on `!isOnline` greys out only on `unavailable`. `AlarmBar` gets the connection status and `now`, and shows a status chip instead of "Wszystko OK"/alarms when data is not fresh. A `useNow` hook ticks once per second only while something is stale.

**Tech Stack:** Next.js 15, React 18, TypeScript, Vitest + jsdom + Testing Library.

---

## Product decisions (made by the user — do not change)

| Situation | Tiles | AlarmBar |
|---|---|---|
| WS lost, < 2 min since last frame | last values, normal look (no grey, no "—") | ONLY one amber chip: `Wznawianie połączenia — dane sprzed 23 s` |
| WS lost, ≥ 2 min | grey + "—" (today's look) | ONLY one rose chip: `Brak połączenia od 3 min` |
| Never received data (`connecting`/`offline`, no frame yet) | today's look (grey/"—", never zeros) | amber chip `Łączenie z serwerem…` — never "Wszystko OK" |
| WS live, area X offline < 2 min | area X: last values, normal look | amber chip `Chłodnia 1 — brak odświeżania od 12 s`; area X's alarms hidden; alarms of live areas still shown |
| WS live, area X offline ≥ 2 min | area X grey + "—" | rose chip `Chłodnia 1 — brak danych od 3 min`; area X's alarms hidden; other alarms shown |
| Everything live, no alarms | normal | `Wszystko OK` (unchanged) |

- During a whole-connection outage the bar shows only the connection chip — no alarm chips (user's choice). Per-area: hiding live areas' alarms would hide real alarms, so only the stale area's alarms are hidden.
- Age format (`formatStaleAge`): `< 60 s` → `23 s`; `< 120 s` → `1 min 05 s`; `≥ 120 s` → whole minutes `3 min` (then hours `1 h 05 min` from 60 min).
- `STALE_HOLD_MS = 120_000` (named constant, Polish comment explaining it is the user's decision of 2026-10-26).
- Age is measured on the **client clock** only (`Date.now()` at frame reception). Never subtract the backend `timestamp` from the browser clock — the Pi and the client clocks are not synchronised.
- The small `ConnectionStatus` badge in the header (LIVE/OFFLINE) stays as is.

## Context the implementer needs

- Read first: `src/lib/types.ts`, `src/lib/backend/mapPayload.ts`, `src/lib/backend/wsAdapter.ts`, `src/hooks/useAreasData.ts`, `src/components/AlarmBar.tsx`, `src/components/OverviewView.tsx`, `src/components/Wallboard.tsx`, `src/components/areas/*.tsx`, `src/lib/area-visual-state.ts`, `src/lib/device-status.ts`, `src/lib/overview-card-state.ts`.
- Current consumers of "offline" that must switch to `dataState === 'unavailable'`: `OverviewView.tsx:210`, `:335` (compressor per-metric: `metric.online === false` → grey only when also beyond hold for that area), `:351`; `CoolingAreaView.tsx:35`; `PowerAreaView.tsx:146`; `CompressorAreaView.tsx:77`; `Wallboard.tsx:215-219` (area status badge); `area-visual-state.ts` callers (`isOnline` param). Grep again for `isOnline`, `online === false`, `offline` — do not miss one.
- Known bugs this closes (from the 2026-10-25 reliability analysis): **Z2** `markAllOffline`/`carryForwardOffline` leave `metric.online` untouched, so Sprężarkownia ignored WS loss; **Z3** AlarmBar says "Wszystko OK" with no data; **Z1** `handleDisconnect` does not mark snapshots offline; **P4** stale watchdog reports offline but never closes the socket/reconnects, so "Wznawianie połączenia" would be a lie forever.
- Wire contract: tag value on the wire is `number | null`; you are not changing the wire format. `lastFreshAt` is frontend-only. Do not touch `backend/`.
- Code style: comments in Polish, match surrounding density; immutability (mapper is pure — keep it so; pass `receivedAt` in, don't call `Date.now()` inside `mapAreasPayload`); functions < 50 lines.
- Commands: `npx vitest run <path>`, `npm test`, `npx tsc --noEmit`, `npm run build`. Dev with mock data: `NEXT_PUBLIC_DATA_SOURCE=mock npm run dev`.

## Task 1: `lastFreshAt` in the model and mapper (+ Z2)

**Files:** Modify `src/lib/types.ts`, `src/lib/backend/mapPayload.ts`, `src/lib/mock/generateSnapshot.ts`, `src/lib/backend/wsAdapter.ts` (`offlineSnapshots`). Tests: `src/lib/backend/__tests__/mapPayload*.test.ts` (find existing).

- `AreaSnapshot.lastFreshAt: number | null`.
- `mapAreasPayload(payload, previous, { receivedAt, ... })`: online area → `lastFreshAt = receivedAt`; offline area → `previous?.lastFreshAt ?? null`. Missing area (`carryForwardOffline`) → keep previous `lastFreshAt`.
- `markAllOffline` and `carryForwardOffline` set every metric's `online: false` (Z2), keep `lastFreshAt`.
- Mock snapshots: `lastFreshAt = Date.now()` at generation (mock is always live).
Tests first: online sets it; offline holds previous; never-online stays null; markAllOffline sets metrics offline and keeps lastFreshAt; inputs not mutated.

Commit: `feat(data): track per-area last fresh time on the client clock`

## Task 2: Display-state helpers

**Files:** Create `src/lib/staleness.ts`, test `src/lib/__tests__/staleness.test.ts`.

```ts
export const STALE_HOLD_MS = 120_000;
export type AreaDataState = 'live' | 'held' | 'unavailable';
export function areaDataState(area: Pick<AreaSnapshot,'isOnline'|'lastFreshAt'>, now: number): AreaDataState
export function formatStaleAge(ms: number): string
```
Boundaries to test: 0 ms held, 119 999 held, 120 000 unavailable, `lastFreshAt` null → unavailable, online → live regardless of age; negative age (clock jump back) treated as 0; format cases from the table above incl. `59 s`, `1 min 00 s`, `2 min`, `60 min` → `1 h 00 min`.

Commit: `feat(data): stale-hold display state and age formatting`

## Task 3: Adapter marks offline on disconnect and really reconnects (Z1, P4)

**Files:** Modify `src/lib/backend/wsAdapter.ts`; tests in its existing `__tests__` file (uses injected `socketFactory` and timer fns — follow that pattern).

- Pass `receivedAt: Date.now()` (injectable `now` option, default `Date.now`) into `mapAreasPayload`.
- `handleDisconnect`: emit `markAllOffline(lastSnapshots)` (if any) to the listener before reporting `offline`.
- Stale watchdog firing: mark offline as today, then **close the socket** (detach its handlers first so `onclose` doesn't double-fire) and `scheduleReconnect()`.
- On `window` `online` event and on `document` `visibilitychange` → visible while not live: cancel pending backoff and reconnect immediately. Remove listeners on teardown. Guard for SSR/jsdom.
- `lastFreshAt` must survive reconnect cycles (it lives in `lastSnapshots`, which you must not reset).
Tests: disconnect emits offline snapshots preserving values; watchdog closes + reconnects; `online` event triggers immediate reconnect; teardown removes listeners.

Commit: `fix(ws): mark data offline on disconnect and reconnect after a stalled socket`

## Task 4: `useNow` and display wiring

**Files:** Create `src/hooks/useNow.ts` (+ test). Modify `OverviewView.tsx`, `Wallboard.tsx`, `areas/*.tsx`, `area-visual-state.ts` callers, `device-status.ts` callers as needed.

- `useNow(isTicking: boolean, intervalMs = 1000): number` — returns `Date.now()`, re-renders every second only while `isTicking`; when ticking stops, one final update.
- In `OverviewView`/`Wallboard`: `isTicking = status !== 'live' || areas.some(a => !a.isOnline)`; compute `dataState` per area and pass "unavailable" (not `!isOnline`) to every place that greys out. When WS status is not live, the area state must still be derived from `lastFreshAt` (Task 3 marks all areas offline on disconnect, so this falls out naturally).
- Held areas render exactly like live ones (values, sparklines, tank fill, alarm colours from the last frame). Ticking must not restart `Counter` animations — check `Counter.tsx` animates only on value change.
Tests (component, existing patterns in `src/components/__tests__` and `areas/__tests__`): offline area with fresh `lastFreshAt` shows the number, not "—", and no grayscale class; same area with `lastFreshAt` 3 min old shows "—"; never-fresh area shows "—" not `0`; compressor per-metric case.

Commit: `feat(overview): keep last values on screen for 2 minutes after data loss`

## Task 5: AlarmBar status chips

**Files:** Modify `src/components/AlarmBar.tsx` (+ `collectAlarms` filtering), callers in `OverviewView.tsx`/`Wallboard.tsx`; tests `src/components/__tests__/AlarmBar*.test.tsx`.

- New props: `status: ConnectionStatus`, `now: number`. Pure helper `collectStatusNotices(areas, status, now)` returning chip descriptors per the table; WS-level notice suppresses all other chips; per-area notices come first, followed by alarms of areas whose state is `live`.
- Chip styles: amber (`bg-amber-50 border-amber-100 text-amber-800`) for held/connecting, rose (as alarm chip, without pulse) for unavailable. Same size/typography as existing chips. `data-testid="status-chip-..."`.
- The marquee measurement key must NOT include the ticking seconds (it would re-measure every second) — key on chip identity + phase (held/unavailable) only.
- Accessibility: the container is `aria-live="polite"`; a text changing every second would be read out every second. Render the age in an `aria-hidden` span and give the chip a stable screen-reader label (e.g. `Wznawianie połączenia` / `Brak połączenia`) so only phase changes are announced.
- `Wallboard.tsx:76` also uses `collectAlarms` for carousel dots — make sure stale areas' alarms behave consistently there (hidden for whole-WS outage is fine to leave as last-known for dots; state your choice in the summary).
Tests: every row of the decision table; "Wszystko OK" never shown when status ≠ live; age text updates with `now`; seconds change does not change the measurement key.

Commit: `feat(alarm-bar): show reconnect status with data age instead of "Wszystko OK"`

## Task 6: Verification

1. `npm test`, `npx tsc --noEmit`, `npm run build` — all green. Report counts.
2. Per the repo's wire-contract rule: you did not change the wire format; confirm in the summary that `backend/` is untouched and `payload.ts` guards unchanged.
3. Final summary: files changed, decisions you had to make that the plan did not cover, anything not verified.
