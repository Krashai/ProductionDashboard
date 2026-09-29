"""Per-tag alarm state carried across broadcast ticks.

Everything else in alarm evaluation is a pure function of (config, live
values) — see app.plc.aggregator. Two rule options need memory of the
previous ticks, and live here:
  - `delay_s`: a condition must hold continuously for that long before the
    alarm raises (a single clear tick restarts the wait),
  - hysteresis: whether an alarm is currently active changes which band
    counts as "breached" (see aggregator._threshold_breached).

One tracker is owned by the app and advanced (`commit=True`) only by the
broadcast loop, once per tick. Read-only callers (/status, the admin live
view) pass `commit=False` and get the same answer without disturbing it.
"""
from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from typing import Callable


@dataclass
class _TagState:
    active: bool = False
    pending_since: float | None = None


class AlarmTracker:
    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._lock = threading.Lock()
        self._states: dict[int, _TagState] = {}

    def is_active(self, tag_id: int) -> bool:
        with self._lock:
            state = self._states.get(tag_id)
            return state.active if state else False

    def step(self, tag_id: int, raw: bool, delay_s: float, *, commit: bool = True) -> bool:
        """Debounced alarm state for this tick's raw condition."""
        now = self._clock()
        with self._lock:
            state = self._states.get(tag_id) or _TagState()
            if not raw:
                next_state = _TagState()
            elif state.active:
                next_state = state
            else:
                pending_since = state.pending_since if state.pending_since is not None else now
                raised = now - pending_since >= delay_s
                next_state = _TagState(active=raised, pending_since=None if raised else pending_since)
            if commit:
                self._states[tag_id] = next_state
            return next_state.active

    def retain(self, tag_ids: set[int]) -> None:
        """Drop state for tags that no longer exist."""
        with self._lock:
            for tag_id in list(self._states):
                if tag_id not in tag_ids:
                    del self._states[tag_id]
