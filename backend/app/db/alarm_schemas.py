"""Request/response shapes for GET/PUT /api/tags/{id}/alarm — a tag's
whole alarm configuration as one object (see app.api.alarm_config)."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator

AlarmKind = Literal["none", "threshold", "bool", "bits"]


class ThresholdConfig(BaseModel):
    min: float | None = None
    max: float | None = None
    hysteresis: float = Field(default=0.0, ge=0)
    delay_s: float = Field(default=0.0, ge=0, le=3600)

    @model_validator(mode="after")
    def _limits(self):
        if self.min is None and self.max is None:
            raise ValueError("Podaj co najmniej jedną granicę: min lub max.")
        if self.min is not None and self.max is not None:
            if self.max < self.min:
                raise ValueError("Max musi być większe lub równe min.")
            if self.hysteresis * 2 > self.max - self.min:
                raise ValueError("Histereza nie może przekraczać połowy zakresu min–max.")
        return self


class BoolAlarmConfig(BaseModel):
    active_value: Literal[0, 1] = 1
    description: str | None = Field(default=None, max_length=200)
    delay_s: float = Field(default=0.0, ge=0, le=3600)


class BitConfig(BaseModel):
    bit_index: int = Field(ge=0, le=31)
    description: str = Field(min_length=1, max_length=200)


class AlarmConfig(BaseModel):
    kind: AlarmKind
    threshold: ThresholdConfig | None = None
    bool_alarm: BoolAlarmConfig | None = None
    bits: list[BitConfig] | None = None

    @model_validator(mode="after")
    def _payload_matches_kind(self):
        if self.kind == "threshold" and self.threshold is None:
            raise ValueError("Brak ustawień progu.")
        if self.kind == "bool" and self.bool_alarm is None:
            raise ValueError("Brak ustawień alarmu dwustanowego.")
        if self.kind == "bits":
            if not self.bits:
                raise ValueError("Dodaj co najmniej jeden bit alarmu.")
            indexes = [b.bit_index for b in self.bits]
            if len(indexes) != len(set(indexes)):
                raise ValueError("Każdy bit może mieć tylko jeden opis.")
        return self


class AlarmConfigRead(AlarmConfig):
    tag_id: int
    # True when nothing is stored and the catalog's implicit AWARIA rule
    # ("alarm when TRUE") applies — see app.domain.alarm_kinds.
    implicit: bool = False
