"""Pydantic request/response schemas for the CRUD API.

Kept separate from app.db.models (SQLAlchemy) on purpose — mixing ORM and
API validation into one class (as the gateway pattern's PLCConfig sort of
does) makes it easy to accidentally leak DB-only concerns into the wire
format. Here the two are decoupled: routers convert explicitly.

PUT semantics are deliberately NOT uniform across entities:
  - PlcUpdate / TagUpdate: full replace. PUT requires every field, same
    as POST — a client must send the complete object back, matching how
    the admin panel's forms already always submit every field.
  - ThresholdRuleUpdate / BitAlarmRuleUpdate: partial update
    (`exclude_unset=True` in the router). These exist mid-object-graph
    (a rule always belongs to one fixed tag_id that a PUT can't change
    anyway — tag_id isn't even part of the *Update schema), so letting
    a client send just the field(s) it's changing (e.g. only `max`) is
    both safer (can't accidentally null out `min` by omitting it) and
    matches how the admin panel's threshold/bit-alarm edit affordances
    are built. Not a bug — just two different, each-locally-sensible
    conventions; documented here since nothing else in the code makes
    the split obvious.
"""
from __future__ import annotations

import ipaddress

from pydantic import BaseModel, Field, field_validator

from app.domain.areas import AREA_IDS
from app.plc.decode import SUPPORTED_TAG_TYPES


def _validate_supported_tag_type(value: str) -> str:
    """Shared by TagBase.type and ProbeRequest.type so the two validators
    can never silently drift apart — a probe must accept exactly the set
    of types a real Tag could ever be saved with, no more, no less."""
    upper = value.upper()
    if upper not in SUPPORTED_TAG_TYPES:
        raise ValueError(
            f"type must be one of {sorted(SUPPORTED_TAG_TYPES)}, got {value!r}"
        )
    return upper


class PlcBase(BaseModel):
    name: str = Field(min_length=1)
    area_id: str
    ip: str = Field(min_length=1)
    # HIGH #B3: S7 rack/slot are small physical-addressing fields on real
    # hardware (racks 0-7, slots 0-31 on any S7-300/400/1200/1500) — bounds
    # checked here so a wildly out-of-range value fails fast at the API
    # boundary with a 422 rather than being silently passed through to
    # snap7.Client.connect().
    rack: int = Field(default=0, ge=0, le=7)
    slot: int = Field(default=1, ge=0, le=31)
    plc_type: str = Field(min_length=1)

    @field_validator("area_id")
    @classmethod
    def _area_id_must_be_known(cls, value: str) -> str:
        if value not in AREA_IDS:
            raise ValueError(
                f"area_id must be one of {sorted(AREA_IDS)}, got {value!r}"
            )
        return value

    @field_validator("ip")
    @classmethod
    def _ip_must_be_a_valid_address(cls, value: str) -> str:
        """HIGH #B3: reject anything that isn't a syntactically valid
        IPv4/IPv6 address — an unvalidated string here would otherwise
        flow straight into ``snap7.Client.connect()`` (see app.plc.worker),
        so e.g. shell-metacharacter-laden strings or empty values must
        never reach that far."""
        candidate = value.strip()
        try:
            ipaddress.ip_address(candidate)
        except ValueError as exc:
            raise ValueError(f"ip must be a valid IPv4 or IPv6 address: {exc}") from exc
        return candidate


class PlcCreate(PlcBase):
    pass


class PlcUpdate(PlcBase):
    pass


class PlcRead(PlcBase):
    id: int

    model_config = {"from_attributes": True}


class TagBase(BaseModel):
    plc_id: int
    name: str = Field(min_length=1)
    # HIGH #B3: db/offset are S7 addressing fields — bounded to the
    # protocol's real 16-bit address space so an out-of-range value fails
    # fast with a 422 instead of being handed to snap7's db_read().
    db: int = Field(ge=0, le=65535)
    offset: int = Field(ge=0, le=65535)
    bit: int = Field(default=0, ge=0, le=7)
    type: str
    metric_id: str = Field(min_length=1)
    label: str = Field(min_length=1)
    unit: str = ""
    decimals: int = Field(default=0, ge=0, le=6)

    @field_validator("type")
    @classmethod
    def _type_must_be_supported(cls, value: str) -> str:
        return _validate_supported_tag_type(value)


class TagCreate(TagBase):
    pass


class TagUpdate(TagBase):
    pass


class TagRead(TagBase):
    id: int

    model_config = {"from_attributes": True}


class ThresholdRuleBase(BaseModel):
    tag_id: int
    min: float | None = None
    max: float | None = None

    @field_validator("max")
    @classmethod
    def _max_gte_min(cls, max_value, info):
        min_value = info.data.get("min")
        if min_value is not None and max_value is not None and max_value < min_value:
            raise ValueError("max must be greater than or equal to min")
        return max_value


class ThresholdRuleCreate(ThresholdRuleBase):
    pass


class ThresholdRuleUpdate(BaseModel):
    min: float | None = None
    max: float | None = None


class ThresholdRuleRead(ThresholdRuleBase):
    id: int

    model_config = {"from_attributes": True}


class BitAlarmRuleBase(BaseModel):
    tag_id: int
    bit_index: int = Field(ge=0, le=31)
    description: str = Field(min_length=1)


class BitAlarmRuleCreate(BitAlarmRuleBase):
    pass


class BitAlarmRuleUpdate(BaseModel):
    bit_index: int | None = Field(default=None, ge=0, le=31)
    description: str | None = Field(default=None, min_length=1)


class BitAlarmRuleRead(BitAlarmRuleBase):
    id: int

    model_config = {"from_attributes": True}


class ProbeRequest(BaseModel):
    """Body for POST /api/plcs/{plc_id}/probe (VariableAssignmentWizard.md
    §5.1) — test-read an arbitrary address before committing it as a Tag.
    Bounds mirror TagBase's db/offset/bit exactly (same S7 address space),
    and `type` reuses the identical SUPPORTED_TAG_TYPES validator so a
    probe can never accept a type a saved Tag would reject."""

    db: int = Field(ge=0, le=65535)
    offset: int = Field(ge=0, le=65535)
    bit: int = Field(default=0, ge=0, le=7)
    type: str

    @field_validator("type")
    @classmethod
    def _type_must_be_supported(cls, value: str) -> str:
        return _validate_supported_tag_type(value)
