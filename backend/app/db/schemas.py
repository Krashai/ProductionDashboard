"""Pydantic request/response schemas for the CRUD API.

Kept separate from app.db.models (SQLAlchemy) on purpose — mixing ORM and
API validation into one class (as the gateway pattern's PLCConfig sort of
does) makes it easy to accidentally leak DB-only concerns into the wire
format. Here the two are decoupled: routers convert explicitly.
"""
from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

from app.domain.areas import AREA_IDS
from app.plc.decode import SUPPORTED_TAG_TYPES


class PlcBase(BaseModel):
    name: str = Field(min_length=1)
    area_id: str
    ip: str = Field(min_length=1)
    rack: int = 0
    slot: int = 1
    plc_type: str = Field(min_length=1)

    @field_validator("area_id")
    @classmethod
    def _area_id_must_be_known(cls, value: str) -> str:
        if value not in AREA_IDS:
            raise ValueError(
                f"area_id must be one of {sorted(AREA_IDS)}, got {value!r}"
            )
        return value


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
    db: int = Field(ge=0)
    offset: int = Field(ge=0)
    bit: int = Field(default=0, ge=0, le=7)
    type: str
    metric_id: str = Field(min_length=1)
    label: str = Field(min_length=1)
    unit: str = ""
    decimals: int = Field(default=0, ge=0)

    @field_validator("type")
    @classmethod
    def _type_must_be_supported(cls, value: str) -> str:
        upper = value.upper()
        if upper not in SUPPORTED_TAG_TYPES:
            raise ValueError(
                f"type must be one of {sorted(SUPPORTED_TAG_TYPES)}, got {value!r}"
            )
        return upper


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
