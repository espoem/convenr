from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import (
    Any,
    Literal,
    Self,
    TypeVar,
    cast,
)

from attrs import define as _attrs_define

from ..models.range_schedule_input_slot_minutes import RangeScheduleInputSlotMinutes

T = TypeVar("T", bound="RangeScheduleInput")


@_attrs_define
class RangeScheduleInput:
    """An event on every day from one date to another.

    Attributes:
        mode (Literal['range']): The kind of schedule.
        first (datetime.date): The first day, `YYYY-MM-DD`.
        last (datetime.date): The last day, `YYYY-MM-DD`.
        daily_start (str): The start of each day's slots, `HH:MM`.
        daily_end (str): The end of each day's slots, `HH:MM`; `24:00` is midnight.
        slot_minutes (RangeScheduleInputSlotMinutes): The length of a slot in minutes.
    """

    mode: Literal["range"]
    first: datetime.date
    last: datetime.date
    daily_start: str
    daily_end: str
    slot_minutes: RangeScheduleInputSlotMinutes

    def to_dict(self) -> dict[str, Any]:
        mode = self.mode

        first = self.first.isoformat()

        last = self.last.isoformat()

        daily_start = self.daily_start

        daily_end = self.daily_end

        slot_minutes = self.slot_minutes.value

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "mode": mode,
                "first": first,
                "last": last,
                "dailyStart": daily_start,
                "dailyEnd": daily_end,
                "slotMinutes": slot_minutes,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls, src_dict: Mapping[str, Any]) -> Self:
        d = dict(src_dict)
        mode = cast(Literal["range"], d.pop("mode"))
        if mode != "range":
            raise ValueError(f"mode must match const 'range', got '{mode}'")

        first = datetime.date.fromisoformat(d.pop("first"))

        last = datetime.date.fromisoformat(d.pop("last"))

        daily_start = d.pop("dailyStart")

        daily_end = d.pop("dailyEnd")

        slot_minutes = RangeScheduleInputSlotMinutes(d.pop("slotMinutes"))

        range_schedule_input = cls(
            mode=mode,
            first=first,
            last=last,
            daily_start=daily_start,
            daily_end=daily_end,
            slot_minutes=slot_minutes,
        )

        return range_schedule_input
