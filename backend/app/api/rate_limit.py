"""HIGH #B4: a simple in-process failed-admin-token-attempt limiter.

No external dependency (slowapi/Redis/etc.) is introduced — this is a
single-process app, and a per-process, per-client sliding-window counter
is sufficient to blunt naive repeated-guessing attacks against the
X-Admin-Token header. Wired onto ``app.state.auth_limiter`` in
``app.main.create_app`` and consulted/updated by
``app.api.deps.require_admin_token``.
"""
from __future__ import annotations

import threading
import time
from collections import OrderedDict, deque
from typing import Callable


class FailedAuthLimiter:
    """Tracks recent failed-auth timestamps per ``client_key`` (typically
    ``request.client.host``) and blocks further attempts once
    ``max_failures`` have occurred within the trailing ``window_s``
    seconds.

    Internals: an ``OrderedDict[str, deque[float]]`` guarded by a
    ``threading.Lock`` (FastAPI sync route dependencies can run on
    different threadpool threads). Each client's deque holds only
    timestamps within the current window — entries older than
    ``window_s`` are pruned lazily on every access rather than via a
    background sweep. The tracked-client dict itself is bounded by
    ``max_tracked_clients`` with simple LRU eviction (the
    least-recently-touched client is evicted first) so that the limiter
    tracking arbitrarily many distinct client keys can never itself
    become an unbounded-memory-growth / DoS vector.
    """

    def __init__(
        self,
        max_failures: int = 5,
        window_s: float = 60.0,
        max_tracked_clients: int = 1024,
        now: Callable[[], float] = time.monotonic,
    ) -> None:
        self._max_failures = max_failures
        self._window_s = window_s
        self._max_tracked_clients = max_tracked_clients
        self._now = now
        self._lock = threading.Lock()
        self._failures: OrderedDict[str, deque[float]] = OrderedDict()

    @property
    def window_s(self) -> float:
        return self._window_s

    def _prune_expired_locked(self, timestamps: deque[float]) -> None:
        cutoff = self._now() - self._window_s
        while timestamps and timestamps[0] < cutoff:
            timestamps.popleft()

    def is_blocked(self, client_key: str) -> bool:
        with self._lock:
            timestamps = self._failures.get(client_key)
            if timestamps is None:
                return False
            self._prune_expired_locked(timestamps)
            if not timestamps:
                self._failures.pop(client_key, None)
                return False
            return len(timestamps) >= self._max_failures

    def record_failure(self, client_key: str) -> None:
        with self._lock:
            timestamps = self._failures.get(client_key)
            if timestamps is None:
                timestamps = deque()
                self._failures[client_key] = timestamps
            else:
                # Touch: move to the end so this client is treated as
                # most-recently-used for LRU eviction purposes.
                self._failures.move_to_end(client_key)

            self._prune_expired_locked(timestamps)
            timestamps.append(self._now())

            while len(self._failures) > self._max_tracked_clients:
                self._failures.popitem(last=False)  # evict least-recently-touched

    def reset(self, client_key: str) -> None:
        with self._lock:
            self._failures.pop(client_key, None)
