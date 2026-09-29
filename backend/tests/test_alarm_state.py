"""AlarmTracker — the only stateful piece of alarm evaluation: it turns a
per-tick raw "limit breached" condition into a debounced alarm (delay_s)
and remembers which alarms are active (needed for hysteresis)."""
from app.plc.alarm_state import AlarmTracker


class Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


def test_without_delay_alarm_follows_the_raw_condition():
    tracker = AlarmTracker(clock=Clock())

    assert tracker.step(1, True, delay_s=0) is True
    assert tracker.is_active(1) is True
    assert tracker.step(1, False, delay_s=0) is False
    assert tracker.is_active(1) is False


def test_delay_raises_only_after_the_condition_held_long_enough():
    clock = Clock()
    tracker = AlarmTracker(clock=clock)

    assert tracker.step(1, True, delay_s=5) is False
    clock.now += 4.9
    assert tracker.step(1, True, delay_s=5) is False
    clock.now += 0.1
    assert tracker.step(1, True, delay_s=5) is True


def test_a_single_clear_tick_restarts_the_delay():
    clock = Clock()
    tracker = AlarmTracker(clock=clock)

    tracker.step(1, True, delay_s=5)
    clock.now += 4
    tracker.step(1, False, delay_s=5)
    clock.now += 2
    assert tracker.step(1, True, delay_s=5) is False
    clock.now += 4.9
    assert tracker.step(1, True, delay_s=5) is False


def test_peek_reports_the_same_answer_without_changing_state():
    clock = Clock()
    tracker = AlarmTracker(clock=clock)
    tracker.step(1, True, delay_s=5)
    clock.now += 6

    assert tracker.step(1, True, delay_s=5, commit=False) is True
    assert tracker.is_active(1) is False  # peek did not commit
    assert tracker.step(2, True, delay_s=0, commit=False) is True
    assert tracker.is_active(2) is False


def test_forget_drops_state_of_deleted_tags():
    tracker = AlarmTracker(clock=Clock())
    tracker.step(1, True, delay_s=0)
    tracker.step(2, True, delay_s=0)

    tracker.retain({2})

    assert tracker.is_active(1) is False
    assert tracker.is_active(2) is True
