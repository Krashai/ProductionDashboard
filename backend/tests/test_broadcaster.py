from unittest.mock import AsyncMock

import pytest

from app.db.models import Plc, Tag
from app.plc.broadcaster import broadcast_once
from app.plc.live_store import LiveStore


@pytest.mark.asyncio
async def test_broadcast_once_reads_db_and_live_store_and_calls_manager(db_session):
    plc = Plc(name="P", area_id="chlodnia-1", ip="i", rack=0, slot=1, plc_type="S7-1200")
    db_session.add(plc)
    db_session.commit()
    db_session.add(
        Tag(
            plc_id=plc.id, name="Temp", db=1, offset=0, type="REAL",
            metric_id="chlodnia-1-temp", label="Temp", unit="°C", decimals=1,
        )
    )
    db_session.commit()

    live_store = LiveStore()
    live_store.update_plc(plc_id=plc.id, online=True, tag_values={"Temp": 4.5}, error=None)

    manager = AsyncMock()

    await broadcast_once(db_session, live_store, manager)

    manager.broadcast.assert_awaited_once()
    (message,), _ = manager.broadcast.call_args
    assert message["type"] == "STATE_UPDATE"
    assert "timestamp" in message
    areas = {a["area_id"]: a for a in message["areas"]}
    assert areas["chlodnia-1"]["metrics"]["chlodnia-1-temp"]["value"] == 4.5


@pytest.mark.asyncio
async def test_broadcast_once_with_empty_config_still_broadcasts_all_areas(db_session):
    live_store = LiveStore()
    manager = AsyncMock()

    await broadcast_once(db_session, live_store, manager)

    (message,), _ = manager.broadcast.call_args
    assert len(message["areas"]) == 5
