from app.db.config_loader import (
    load_plcs,
    load_tags,
    load_threshold_rules,
    load_bit_alarm_rules,
)
from app.db.models import Plc, Tag, ThresholdRule, BitAlarmRule


def test_load_plcs_returns_plain_dicts(db_session):
    db_session.add(
        Plc(name="Chłodnia 1", area_id="chlodnia-1", ip="10.10.0.10", rack=0, slot=1, plc_type="S7-1200")
    )
    db_session.commit()

    plcs = load_plcs(db_session)

    assert plcs == [
        {
            "id": 1,
            "name": "Chłodnia 1",
            "area_id": "chlodnia-1",
            "ip": "10.10.0.10",
            "rack": 0,
            "slot": 1,
            "plc_type": "S7-1200",
        }
    ]


def test_load_tags_returns_plain_dicts(db_session):
    plc = Plc(name="P", area_id="chlodnia-1", ip="i", rack=0, slot=1, plc_type="S7-1200")
    db_session.add(plc)
    db_session.commit()
    db_session.add(
        Tag(
            plc_id=plc.id,
            name="Temp",
            db=1,
            offset=0,
            bit=0,
            type="REAL",
            metric_id="chlodnia-1-temp",
            label="Temp",
            unit="°C",
            decimals=1,
        )
    )
    db_session.commit()

    tags = load_tags(db_session)

    assert tags[0]["name"] == "Temp"
    assert tags[0]["metric_id"] == "chlodnia-1-temp"
    assert tags[0]["plc_id"] == plc.id


def test_load_threshold_rules_returns_plain_dicts(db_session):
    plc = Plc(name="P", area_id="chlodnia-1", ip="i", rack=0, slot=1, plc_type="S7-1200")
    db_session.add(plc)
    db_session.commit()
    tag = Tag(
        plc_id=plc.id, name="T", db=1, offset=0, type="REAL",
        metric_id="chlodnia-1-temp", label="T", unit="", decimals=0,
    )
    db_session.add(tag)
    db_session.commit()
    db_session.add(ThresholdRule(tag_id=tag.id, min=1.0, max=9.0))
    db_session.commit()

    rules = load_threshold_rules(db_session)

    assert rules == [{"id": 1, "tag_id": tag.id, "min": 1.0, "max": 9.0}]


def test_load_bit_alarm_rules_returns_plain_dicts(db_session):
    plc = Plc(name="P", area_id="chlodnia-1", ip="i", rack=0, slot=1, plc_type="S7-1200")
    db_session.add(plc)
    db_session.commit()
    tag = Tag(
        plc_id=plc.id, name="F", db=1, offset=0, type="WORD",
        metric_id="chlodnia-1-faults", label="F", unit="", decimals=0,
    )
    db_session.add(tag)
    db_session.commit()
    db_session.add(BitAlarmRule(tag_id=tag.id, bit_index=2, description="desc"))
    db_session.commit()

    rules = load_bit_alarm_rules(db_session)

    assert rules == [{"id": 1, "tag_id": tag.id, "bit_index": 2, "description": "desc"}]
