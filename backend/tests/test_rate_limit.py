"""HIGH #B4: FailedAuthLimiter unit tests. No FastAPI/HTTP involved here —
see tests/test_api_auth.py for the wired-in-require_admin_token behavior.
"""
import threading

from app.api.rate_limit import FailedAuthLimiter


class FakeClock:
    def __init__(self, start: float = 0.0) -> None:
        self._t = start

    def __call__(self) -> float:
        return self._t

    def advance(self, seconds: float) -> None:
        self._t += seconds


def test_not_blocked_before_max_failures_reached():
    clock = FakeClock()
    limiter = FailedAuthLimiter(max_failures=5, window_s=60.0, now=clock)

    for _ in range(4):
        limiter.record_failure("1.2.3.4")

    assert limiter.is_blocked("1.2.3.4") is False


def test_blocked_once_max_failures_reached_within_window():
    clock = FakeClock()
    limiter = FailedAuthLimiter(max_failures=5, window_s=60.0, now=clock)

    for _ in range(5):
        limiter.record_failure("1.2.3.4")

    assert limiter.is_blocked("1.2.3.4") is True


def test_block_clears_after_window_elapses():
    clock = FakeClock()
    limiter = FailedAuthLimiter(max_failures=5, window_s=60.0, now=clock)

    for _ in range(5):
        limiter.record_failure("1.2.3.4")
    assert limiter.is_blocked("1.2.3.4") is True

    clock.advance(60.1)

    assert limiter.is_blocked("1.2.3.4") is False


def test_different_client_keys_are_tracked_independently():
    clock = FakeClock()
    limiter = FailedAuthLimiter(max_failures=5, window_s=60.0, now=clock)

    for _ in range(5):
        limiter.record_failure("1.2.3.4")

    assert limiter.is_blocked("1.2.3.4") is True
    assert limiter.is_blocked("5.6.7.8") is False


def test_reset_clears_failures_for_a_client():
    clock = FakeClock()
    limiter = FailedAuthLimiter(max_failures=5, window_s=60.0, now=clock)

    for _ in range(5):
        limiter.record_failure("1.2.3.4")
    assert limiter.is_blocked("1.2.3.4") is True

    limiter.reset("1.2.3.4")

    assert limiter.is_blocked("1.2.3.4") is False


def test_tracked_client_dict_never_exceeds_max_tracked_clients_and_evicts_oldest():
    clock = FakeClock()
    limiter = FailedAuthLimiter(max_failures=5, window_s=60.0, max_tracked_clients=3, now=clock)

    limiter.record_failure("client-1")
    limiter.record_failure("client-2")
    limiter.record_failure("client-3")
    assert len(limiter._failures) == 3

    limiter.record_failure("client-4")  # should evict client-1 (oldest-touched)

    assert len(limiter._failures) == 3
    assert "client-1" not in limiter._failures
    assert "client-4" in limiter._failures


def test_touching_an_existing_client_protects_it_from_lru_eviction():
    clock = FakeClock()
    limiter = FailedAuthLimiter(max_failures=5, window_s=60.0, max_tracked_clients=3, now=clock)

    limiter.record_failure("client-1")
    limiter.record_failure("client-2")
    limiter.record_failure("client-3")
    limiter.record_failure("client-1")  # touch client-1 again -> now most-recent

    limiter.record_failure("client-4")  # should evict client-2, not client-1

    assert "client-1" in limiter._failures
    assert "client-2" not in limiter._failures


def test_concurrent_record_failure_calls_do_not_corrupt_the_counter():
    limiter = FailedAuthLimiter(max_failures=10_000, window_s=60.0)
    client_key = "concurrent-client"
    calls_per_thread = 50
    thread_count = 8

    def hammer():
        for _ in range(calls_per_thread):
            limiter.record_failure(client_key)

    threads = [threading.Thread(target=hammer) for _ in range(thread_count)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=10)

    assert len(limiter._failures[client_key]) == calls_per_thread * thread_count
