"""ORM models for the PLC/Tag/ThresholdRule/BitAlarmRule config, per
NewBackendPlan.md §3.

Design decision — "threshold XOR bit-alarms, never both" (§8 open
question): kept as the working assumption, but enforced at the *service*
layer (see app.api.thresholds / app.api.bit_alarms), not as a DB-level
CHECK constraint. Rationale: a hard schema constraint (e.g. a trigger or
a mutually-exclusive-columns CHECK) would make the exception-handling
path ugly and hard to test, and nothing in the real 8-PLC/40ish-tag
configuration we built during implementation needed both mechanisms on
one tag simultaneously — a tag is either "read this scalar and compare it
against min/max" or "read this bitfield and flag specific bits", never
both, because they represent different physical instrumentation (an
analog sensor vs. a status/fault word). If a future case genuinely needs
both, relaxing an application-level check is a one-line change; relaxing
a DB constraint would need a migration.
"""
from __future__ import annotations

from sqlalchemy import (
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class Plc(Base):
    __tablename__ = "plcs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    area_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    ip: Mapped[str] = mapped_column(String, nullable=False)
    rack: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    slot: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    plc_type: Mapped[str] = mapped_column(String, nullable=False)

    tags: Mapped[list["Tag"]] = relationship(
        "Tag",
        back_populates="plc",
        cascade="all, delete-orphan",
        passive_deletes=False,
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging aid only
        return f"<Plc id={self.id} name={self.name!r} area_id={self.area_id!r}>"


class Tag(Base):
    __tablename__ = "tags"
    # Defense-in-depth (VariableAssignmentWizard.md decision #9): metric_id
    # already has its own global unique constraint below, but the
    # diagnostic-tag path (and the old raw admin form) can create two tags
    # on the same PLC sharing a `name` — the field the aggregator/LiveStore
    # actually key live values by (see app.plc.aggregator) — with no
    # metric_id collision at all. Without this, the second tag's poll
    # cycle would silently overwrite the first tag's value under the same
    # name.
    __table_args__ = (
        UniqueConstraint("plc_id", "name", name="uq_tags_plc_id_name"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    plc_id: Mapped[int] = mapped_column(
        ForeignKey("plcs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    db: Mapped[int] = mapped_column(Integer, nullable=False)
    offset: Mapped[int] = mapped_column(Integer, nullable=False)
    bit: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    type: Mapped[str] = mapped_column(String, nullable=False)
    metric_id: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    label: Mapped[str] = mapped_column(String, nullable=False)
    unit: Mapped[str] = mapped_column(String, nullable=False, default="")
    decimals: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    plc: Mapped["Plc"] = relationship("Plc", back_populates="tags")
    threshold_rule: Mapped["ThresholdRule | None"] = relationship(
        "ThresholdRule",
        back_populates="tag",
        uselist=False,
        cascade="all, delete-orphan",
    )
    bit_alarm_rules: Mapped[list["BitAlarmRule"]] = relationship(
        "BitAlarmRule",
        back_populates="tag",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging aid only
        return f"<Tag id={self.id} name={self.name!r} metric_id={self.metric_id!r}>"


class ThresholdRule(Base):
    __tablename__ = "threshold_rules"
    __table_args__ = (UniqueConstraint("tag_id", name="uq_threshold_rules_tag_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tag_id: Mapped[int] = mapped_column(
        ForeignKey("tags.id", ondelete="CASCADE"), nullable=False
    )
    min: Mapped[float | None] = mapped_column(Float, nullable=True)
    max: Mapped[float | None] = mapped_column(Float, nullable=True)

    tag: Mapped["Tag"] = relationship("Tag", back_populates="threshold_rule")


class BitAlarmRule(Base):
    __tablename__ = "bit_alarm_rules"
    __table_args__ = (
        UniqueConstraint("tag_id", "bit_index", name="uq_bit_alarm_rules_tag_bit"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tag_id: Mapped[int] = mapped_column(
        ForeignKey("tags.id", ondelete="CASCADE"), nullable=False
    )
    bit_index: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[str] = mapped_column(String, nullable=False)

    tag: Mapped["Tag"] = relationship("Tag", back_populates="bit_alarm_rules")
