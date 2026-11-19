from __future__ import annotations

from collections.abc import Mapping
from typing import (
    Any,
    Literal,
    Self,
    TypeVar,
    cast,
)

from attrs import define as _attrs_define

from ..models.weekdays_schedule_input_slot_minutes import (
    WeekdaysScheduleInputSlotMinutes,
)
from ..models.weekdays_schedule_input_weekdays_item import (
    WeekdaysScheduleInputWeekdaysItem,
)

T = TypeVar("T", bound="WeekdaysScheduleInput")


@_attrs_define
class WeekdaysScheduleInput:
    """An event on days of the week, without dates.

    Attributes:
        mode (Literal['weekdays']): The kind of schedule.
        weekdays (list[WeekdaysScheduleInputWeekdaysItem]): The chosen days of the week: 1 is Monday, 7 is Sunday.
        daily_start (str): The start of each day's slots, `HH:MM`.
        daily_end (str): The end of each day's slots, `HH:MM`; `24:00` is midnight.
        slot_minutes (WeekdaysScheduleInputSlotMinutes): The length of a slot in minutes.
    """

    mode: Literal["weekdays"]
    weekdays: list[WeekdaysScheduleInputWeekdaysItem]
    daily_start: str
    daily_end: str
    slot_minutes: WeekdaysScheduleInputSlotMinutes

    def to_dict(self) -> dict[str, Any]:
        mode = self.mode

        weekdays = []
        for weekdays_item_data in self.weekdays:
            weekdays_item = weekdays_item_data.value
            weekdays.append(weekdays_item)

        daily_start = self.daily_start

        daily_end = self.daily_end

        slot_minutes = self.slot_minutes.value

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "mode": mode,
                "weekdays": weekdays,
                "dailyStart": daily_start,
                "dailyEnd": daily_end,
                "slotMinutes": slot_minutes,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls, src_dict: Mapping[str, Any]) -> Self:
        d = dict(src_dict)
        mode = cast(Literal["weekdays"], d.pop("mode"))
        if mode != "weekdays":
            raise ValueError(f"mode must match const 'weekdays', got '{mode}'")

        weekdays = []
        _weekdays = d.pop("weekdays")
        for weekdays_item_data in _weekdays:
            weekdays_item = WeekdaysScheduleInputWeekdaysItem(weekdays_item_data)

            weekdays.append(weekdays_item)

        daily_start = d.pop("dailyStart")

        daily_end = d.pop("dailyEnd")

        slot_minutes = WeekdaysScheduleInputSlotMinutes(d.pop("slotMinutes"))

        weekdays_schedule_input = cls(
            mode=mode,
            weekdays=weekdays,
            daily_start=daily_start,
            daily_end=daily_end,
            slot_minutes=slot_minutes,
        )

        return weekdays_schedule_input
