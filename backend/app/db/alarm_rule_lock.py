"""Process-wide lock serializing the check-then-write critical section
for ThresholdRule/BitAlarmRule creation, shared across both routers.

Why this is needed: the sqlite engine here uses check_same_thread=False
with a connection pool, and FastAPI runs sync `def` routes in a
threadpool — so two concurrent requests can each get their own
connection/session. A plain SELECT does not take a SQLite write lock, so
two threads could both observe "no conflicting rule yet" before either
commits its INSERT: a classic TOCTOU race that would violate the
threshold-XOR-bit-alarm invariant documented in app.db.models. Both rule
types share that one invariant (it spans two tables/two routers), so one
process-wide lock around the read-check + write in *both* create
endpoints closes the window, without needing a DB-level transaction
isolation upgrade.

A `threading.Lock` (not per-request DB-level locking) is sufficient and
simplest here: this backend runs as a single process/single worker (see
Dockerfile CMD — no multi-worker uvicorn), so every request that could
race is running inside this one process's threadpool.
"""
import threading

THRESHOLD_BIT_ALARM_LOCK = threading.Lock()
