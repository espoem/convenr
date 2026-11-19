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

from ..models.dates_schedule_input_slot_minutes import DatesScheduleInputSlotMinutes

T = TypeVar("T", bound="DatesScheduleInput")


@_attrs_define
class DatesScheduleInput:
    """An event on chosen dates.

    Attributes:
        mode (Literal['dates']): The kind of schedule.
        dates (list[datetime.date]): The chosen dates, `YYYY-MM-DD`.
        daily_start (str): The start of each day's slots, `HH:MM`.
        daily_end (str): The end of each day's slots, `HH:MM`; `24:00` is midnight.
        slot_minutes (DatesScheduleInputSlotMinutes): The length of a slot in minutes.
    """

    mode: Literal["dates"]
    dates: list[datetime.date]
    daily_start: str
    daily_end: str
    slot_minutes: DatesScheduleInputSlotMinutes

    def to_dict(self) -> dict[str, Any]:
        mode = self.mode

        dates = []
        for dates_item_data in self.dates:
            dates_item = dates_item_data.isoformat()
            dates.append(dates_item)

        daily_start = self.daily_start

        daily_end = self.daily_end

        slot_minutes = self.slot_minutes.value

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "mode": mode,
                "dates": dates,
                "dailyStart": daily_start,
                "dailyEnd": daily_end,
                "slotMinutes": slot_minutes,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls, src_dict: Mapping[str, Any]) -> Self:
        d = dict(src_dict)
        mode = cast(Literal["dates"], d.pop("mode"))
        if mode != "dates":
            raise ValueError(f"mode must match const 'dates', got '{mode}'")

        dates = []
        _dates = d.pop("dates")
        for dates_item_data in _dates:
            dates_item = datetime.date.fromisoformat(dates_item_data)

            dates.append(dates_item)

        daily_start = d.pop("dailyStart")

        daily_end = d.pop("dailyEnd")

        slot_minutes = DatesScheduleInputSlotMinutes(d.pop("slotMinutes"))

        dates_schedule_input = cls(
            mode=mode,
            dates=dates,
            daily_start=daily_start,
            daily_end=daily_end,
            slot_minutes=slot_minutes,
        )

        return dates_schedule_input
