"""RED->GREEN for app.plc.decode.decode_tag_value.

Uses real snap7.util set_* helpers to build raw byte buffers, so the
round-trip (encode with snap7, decode with our function) proves we match
the S7 wire format exactly, rather than trusting hand-rolled byte math.
"""
import pytest
from snap7.util import (
    set_real,
    set_int,
    set_dint,
    set_bool,
    set_string,
    set_word,
    set_byte,
)

from app.plc.decode import decode_tag_value, UnsupportedTagTypeError


def _buffer(size: int = 32) -> bytearray:
    return bytearray(size)


def test_decodes_real():
    buf = _buffer()
    set_real(buf, 0, 21.5)
    assert decode_tag_value(buf, 0, "REAL") == pytest.approx(21.5)


def test_decodes_int():
    buf = _buffer()
    set_int(buf, 2, -17)
    assert decode_tag_value(buf, 2, "INT") == -17


def test_decodes_dint():
    buf = _buffer()
    set_dint(buf, 4, 123456)
    assert decode_tag_value(buf, 4, "DINT") == 123456


def test_decodes_bool_true_at_bit():
    buf = _buffer()
    set_bool(buf, 0, 3, True)
    assert decode_tag_value(buf, 0, "BOOL", bit=3) is True


def test_decodes_bool_false_at_bit():
    buf = _buffer()
    set_bool(buf, 0, 3, False)
    assert decode_tag_value(buf, 0, "BOOL", bit=3) is False


def test_decodes_bool_defaults_bit_zero():
    buf = _buffer()
    set_bool(buf, 1, 0, True)
    assert decode_tag_value(buf, 1, "BOOL") is True


def test_decodes_string():
    buf = _buffer(64)
    set_string(buf, 0, "chlodnia-1", max_size=32)
    assert decode_tag_value(buf, 0, "STRING") == "chlodnia-1"


def test_decodes_word():
    buf = _buffer()
    set_word(buf, 0, 0xABCD)
    assert decode_tag_value(buf, 0, "WORD") == 0xABCD


def test_decodes_byte():
    buf = _buffer()
    set_byte(buf, 0, 0x7F)
    assert decode_tag_value(buf, 0, "BYTE") == 0x7F


def test_type_is_case_insensitive():
    buf = _buffer()
    set_real(buf, 0, 1.0)
    assert decode_tag_value(buf, 0, "real") == pytest.approx(1.0)


def test_unsupported_type_raises():
    buf = _buffer()
    with pytest.raises(UnsupportedTagTypeError):
        decode_tag_value(buf, 0, "TIMER")


def test_out_of_range_offset_raises_value_error_not_silent_none():
    buf = _buffer(2)
    with pytest.raises(Exception):
        decode_tag_value(buf, 50, "REAL")
