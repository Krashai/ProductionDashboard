"""Read-only reference data for the admin panel's area/metric dropdowns
— see app.domain.areas module docstring.
"""
from __future__ import annotations

from fastapi import APIRouter

from app.domain.areas import AREA_DEFINITIONS

router = APIRouter(prefix="/api/areas", tags=["areas"])


@router.get("")
def list_areas():
    return AREA_DEFINITIONS
