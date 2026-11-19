from __future__ import annotations

from collections.abc import Mapping
from typing import (
    TYPE_CHECKING,
    Any,
    Literal,
    Self,
    TypeVar,
    cast,
)

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.weekdays_schedule_slot_minutes import WeekdaysScheduleSlotMinutes
from ..models.weekdays_schedule_weekdays_item import WeekdaysScheduleWeekdaysItem

if TYPE_CHECKING:
    from ..models.weekday_slot import WeekdaySlot


T = TypeVar("T", bound="WeekdaysSchedule")


@_attrs_define
class WeekdaysSchedule:
    """An event on days of the week, without dates.

    Attributes:
        mode (Literal['weekdays']): The kind of schedule.
        weekdays (list[WeekdaysScheduleWeekdaysItem]): The chosen days of the week: 1 is Monday, 7 is Sunday.
        daily_start (str): The start of each day's slots, `HH:MM`.
        daily_end (str): The end of each day's slots, `HH:MM`; `24:00` is midnight.
        slot_minutes (WeekdaysScheduleSlotMinutes): The length of a slot in minutes.
        slots (list[WeekdaySlot]): Every slot of the event, in time order.
    """

    mode: Literal["weekdays"]
    weekdays: list[WeekdaysScheduleWeekdaysItem]
    daily_start: str
    daily_end: str
    slot_minutes: WeekdaysScheduleSlotMinutes
    slots: list[WeekdaySlot]
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        mode = self.mode

        weekdays = []
        for weekdays_item_data in self.weekdays:
            weekdays_item = weekdays_item_data.value
            weekdays.append(weekdays_item)

        daily_start = self.daily_start

        daily_end = self.daily_end

        slot_minutes = self.slot_minutes.value

        slots = []
        for slots_item_data in self.slots:
            slots_item = slots_item_data.to_dict()
            slots.append(slots_item)

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "mode": mode,
                "weekdays": weekdays,
                "dailyStart": daily_start,
                "dailyEnd": daily_end,
                "slotMinutes": slot_minutes,
                "slots": slots,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls, src_dict: Mapping[str, Any]) -> Self:
        from ..models.weekday_slot import WeekdaySlot

        d = dict(src_dict)
        mode = cast(Literal["weekdays"], d.pop("mode"))
        if mode != "weekdays":
            raise ValueError(f"mode must match const 'weekdays', got '{mode}'")

        weekdays = []
        _weekdays = d.pop("weekdays")
        for weekdays_item_data in _weekdays:
            weekdays_item = WeekdaysScheduleWeekdaysItem(weekdays_item_data)

            weekdays.append(weekdays_item)

        daily_start = d.pop("dailyStart")

        daily_end = d.pop("dailyEnd")

        slot_minutes = WeekdaysScheduleSlotMinutes(d.pop("slotMinutes"))

        slots = []
        _slots = d.pop("slots")
        for slots_item_data in _slots:
            slots_item = WeekdaySlot.from_dict(slots_item_data)

            slots.append(slots_item)

        weekdays_schedule = cls(
            mode=mode,
            weekdays=weekdays,
            daily_start=daily_start,
            daily_end=daily_end,
            slot_minutes=slot_minutes,
            slots=slots,
        )

        weekdays_schedule.additional_properties = d
        return weekdays_schedule

    @property
    def additional_keys(self) -> list[str]:
        return list(self.additional_properties.keys())

    def __getitem__(self, key: str) -> Any:
        return self.additional_properties[key]

    def __setitem__(self, key: str, value: Any) -> None:
        self.additional_properties[key] = value

    def __delitem__(self, key: str) -> None:
        del self.additional_properties[key]

    def __contains__(self, key: str) -> bool:
        return key in self.additional_properties
