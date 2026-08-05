# syntax=docker/dockerfile:1
#
# Multi-stage build: compile libsnap7.so from source, then a slim runtime.
#
# Deliberate deviation from the ProductionMonitor gateway's Dockerfile
# (gateway/backend/Dockerfile), which hardcodes `make -f x86_64_linux.mk`
# even though its actual deployment target is a Raspberry Pi (ARM) — see
# NewBackendPlan.md §2. This Dockerfile detects the *build* architecture
# via `uname -m` and picks the matching snap7 Makefile target instead.
# `uname -m` is correct both for a native build run directly on the
# target Pi, and for a `docker buildx build --platform linux/arm64` cross
# -build under QEMU emulation (binfmt_misc makes `uname -m` inside the
# emulated container report the *target* architecture, not the builder
# host's).

FROM python:3.11-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    p7zip-full \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
RUN curl -L https://sourceforge.net/projects/snap7/files/1.4.2/snap7-full-1.4.2.7z/download -o snap7.7z \
    && 7z x snap7.7z \
    && rm snap7.7z

# Pick the snap7 Makefile matching the build architecture. Fails loudly
# (rather than silently falling back to x86_64) if the detected arch has
# no known target, or if that target file doesn't actually exist in this
# snap7 release — see module docstring above for why this matters.
#
# snap7 1.4.2 ships no aarch64/arm64 Makefile at all (its build/unix dir
# only has x86_64/i386/arm_v6/arm_v7/mips/solaris targets — confirmed
# against the actual 1.4.2 release, not a packaging fluke on one distro).
# The core snap7 sources are plain portable C++ with no arch-specific
# assembly, and x86_64_linux.mk's CXXFLAGS (-O3 -fPIC -pedantic) carry no
# x86-specific flags (no -m64/-msse/etc — see common.mk, which does all
# the real compiler invocation and is arch-agnostic) — so a 64-bit ARM
# target compiles cleanly by reusing that same flag set under a
# TargetCPU=aarch64 Makefile, synthesized on the fly since upstream
# doesn't provide one.
RUN set -eu; \
    ARCH="$(uname -m)"; \
    case "$ARCH" in \
        x86_64)            MK=x86_64_linux.mk ;; \
        aarch64|arm64)      MK=aarch64_linux.mk ;; \
        armv7l|armv6l)      MK=arm_v7_linux.mk ;; \
        *) echo "ERROR: no snap7 Makefile mapping for architecture '$ARCH'" >&2; exit 1 ;; \
    esac; \
    echo "Detected build architecture: $ARCH -> snap7 target: $MK"; \
    SNAP7_DIR="$(find . -maxdepth 1 -type d -name 'snap7*')/build/unix"; \
    cd "$SNAP7_DIR"; \
    if [ "$MK" = "aarch64_linux.mk" ] && [ ! -f "$MK" ]; then \
        echo "No upstream $MK in this snap7 release — synthesizing one from x86_64_linux.mk (arch-agnostic CXXFLAGS, see comment above)."; \
        sed 's/^TargetCPU  :=x86_64/TargetCPU  :=aarch64/' x86_64_linux.mk > "$MK"; \
    fi; \
    if [ ! -f "$MK" ]; then \
        echo "ERROR: Makefile target '$MK' not found in $SNAP7_DIR. Available targets:" >&2; \
        ls -1 *.mk >&2; \
        exit 1; \
    fi; \
    make -f "$MK"

# Locate the compiled .so regardless of the per-arch output directory
# naming convention (avoids hardcoding e.g. "bin/x86_64-linux/...").
RUN set -eu; \
    LIB_PATH="$(find /build -name 'libsnap7.so' -print -quit)"; \
    if [ -z "$LIB_PATH" ]; then \
        echo "ERROR: libsnap7.so was not produced by the build" >&2; exit 1; \
    fi; \
    cp "$LIB_PATH" /build/libsnap7.so

# Stage 2: runtime
FROM python:3.11-slim

COPY --from=builder /build/libsnap7.so /usr/lib/libsnap7.so
RUN ldconfig

RUN addgroup --gid 1000 appgroup \
    && adduser --uid 1000 --ingroup appgroup --system --disabled-password --no-create-home appuser

WORKDIR /app

# /app/data holds the SQLite file (see app/db/database.py DASHBOARD_DB_PATH),
# mounted as a volume in docker-compose.yml so config survives container
# recreation.
RUN mkdir -p /app/data && chown -R appuser:appgroup /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=appuser:appgroup . .
RUN rm -rf /app/.venv /app/tests /app/requirements-dev.txt

RUN chmod -R 775 /app/data

USER appuser

ENV PYTHONUNBUFFERED=1
ENV DASHBOARD_DB_PATH=/app/data/dashboard.db

EXPOSE 8001

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
