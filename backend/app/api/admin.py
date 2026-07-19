"""GET / — single-page admin panel (Jinja2-rendered static HTML + vanilla
JS calling the REST API), per NewBackendPlan.md decision #6: no separate
frontend container/build step.
"""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.templating import Jinja2Templates

router = APIRouter()

_TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"
templates = Jinja2Templates(directory=str(_TEMPLATES_DIR))


@router.get("/")
def admin_panel(request: Request):
    return templates.TemplateResponse(request, "admin.html", {})
