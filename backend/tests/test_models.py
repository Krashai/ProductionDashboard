"""SQLAlchemy model shape + constraint tests for Plc/Tag/ThresholdRule/
BitAlarmRule, per NewBackendPlan.md §3."""
import pytest
from sqlalchemy.exc import IntegrityError

from app.db.models import Plc, Tag, ThresholdRule, BitAlarmRule


def _make_plc(**overrides):
    defaults = dict(
        name="Chłodnia 1",
        area_id="chlodnia-1",
        ip="10.10.0.10",
        rack=0,
        slot=1,
        plc_type="S7-1200",
    )
    defaults.update(overrides)
    return Plc(**defaults)


def _make_tag(plc_id, **overrides):
    defaults = dict(
        plc_id=plc_id,
        name="Temp_Hala",
        db=1,
        offset=0,
        bit=0,
        type="REAL",
        metric_id="chlodnia-1-temp",
        label="Temperatura wody na halę",
        unit="°C",
        decimals=1,
    )
    defaults.update(overrides)
    return Tag(**defaults)


def test_create_plc_persists_all_fields(db_session):
    plc = _make_plc()
    db_session.add(plc)
    db_session.commit()

    fetched = db_session.query(Plc).one()
    assert fetched.id is not None
    assert fetched.name == "Chłodnia 1"
    assert fetched.area_id == "chlodnia-1"
    assert fetched.ip == "10.10.0.10"
    assert fetched.rack == 0
    assert fetched.slot == 1
    assert fetched.plc_type == "S7-1200"


def test_tag_belongs_to_plc_via_relationship(db_session):
    plc = _make_plc()
    db_session.add(plc)
    db_session.commit()

    tag = _make_tag(plc.id)
    db_session.add(tag)
    db_session.commit()

    fetched = db_session.query(Tag).one()
    assert fetched.plc_id == plc.id
    assert fetched.plc.name == "Chłodnia 1"
    assert plc.tags == [fetched]


def test_deleting_plc_cascades_to_its_tags(db_session):
    plc = _make_plc()
    db_session.add(plc)
    db_session.commit()
    db_session.add(_make_tag(plc.id))
    db_session.commit()

    db_session.delete(plc)
    db_session.commit()

    assert db_session.query(Tag).count() == 0


def test_threshold_rule_persists_min_max(db_session):
    plc = _make_plc()
    db_session.add(plc)
    db_session.commit()
    tag = _make_tag(plc.id)
    db_session.add(tag)
    db_session.commit()

    rule = ThresholdRule(tag_id=tag.id, min=2.0, max=8.0)
    db_session.add(rule)
    db_session.commit()

    fetched = db_session.query(ThresholdRule).one()
    assert fetched.tag_id == tag.id
    assert fetched.min == 2.0
    assert fetched.max == 8.0
    assert tag.threshold_rule is fetched


def test_threshold_rule_is_at_most_one_per_tag(db_session):
    plc = _make_plc()
    db_session.add(plc)
    db_session.commit()
    tag = _make_tag(plc.id)
    db_session.add(tag)
    db_session.commit()

    db_session.add(ThresholdRule(tag_id=tag.id, min=0, max=10))
    db_session.commit()

    db_session.add(ThresholdRule(tag_id=tag.id, min=1, max=9))
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_bit_alarm_rule_persists_bit_index_and_description(db_session):
    plc = _make_plc()
    db_session.add(plc)
    db_session.commit()
    tag = _make_tag(
        plc.id, name="Fault_Word", type="WORD", metric_id="chlodnia-1-faults"
    )
    db_session.add(tag)
    db_session.commit()

    rule = BitAlarmRule(tag_id=tag.id, bit_index=3, description="Niski poziom wody")
    db_session.add(rule)
    db_session.commit()

    fetched = db_session.query(BitAlarmRule).one()
    assert fetched.bit_index == 3
    assert fetched.description == "Niski poziom wody"
    assert list(tag.bit_alarm_rules) == [fetched]


def test_tag_can_have_multiple_bit_alarm_rules(db_session):
    plc = _make_plc()
    db_session.add(plc)
    db_session.commit()
    tag = _make_tag(
        plc.id, name="Fault_Word", type="WORD", metric_id="chlodnia-1-faults"
    )
    db_session.add(tag)
    db_session.commit()

    db_session.add(BitAlarmRule(tag_id=tag.id, bit_index=0, description="A"))
    db_session.add(BitAlarmRule(tag_id=tag.id, bit_index=1, description="B"))
    db_session.commit()

    assert len(tag.bit_alarm_rules) == 2


def test_bit_alarm_rule_bit_index_unique_per_tag(db_session):
    plc = _make_plc()
    db_session.add(plc)
    db_session.commit()
    tag = _make_tag(plc.id)
    db_session.add(tag)
    db_session.commit()

    db_session.add(BitAlarmRule(tag_id=tag.id, bit_index=2, description="first"))
    db_session.commit()

    db_session.add(BitAlarmRule(tag_id=tag.id, bit_index=2, description="dup"))
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_deleting_tag_cascades_threshold_and_bit_alarms(db_session):
    plc = _make_plc()
    db_session.add(plc)
    db_session.commit()
    tag = _make_tag(plc.id)
    db_session.add(tag)
    db_session.commit()
    db_session.add(ThresholdRule(tag_id=tag.id, min=0, max=1))
    db_session.commit()

    db_session.delete(tag)
    db_session.commit()

    assert db_session.query(ThresholdRule).count() == 0
