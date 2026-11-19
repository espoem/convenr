from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Self, TypeVar

from attrs import define as _attrs_define

from ..models.weekday_slot_input_weekday import WeekdaySlotInputWeekday

T = TypeVar("T", bound="WeekdaySlotInput")


@_attrs_define
class WeekdaySlotInput:
    """A slot of a weekday event.

    Attributes:
        weekday (WeekdaySlotInputWeekday): The day of the week: 1 is Monday, 7 is Sunday.
        minute (int): The start of the slot in minutes after midnight.
    """

    weekday: WeekdaySlotInputWeekday
    minute: int

    def to_dict(self) -> dict[str, Any]:
        weekday = self.weekday.value

        minute = self.minute

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "weekday": weekday,
                "minute": minute,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls, src_dict: Mapping[str, Any]) -> Self:
        d = dict(src_dict)
        weekday = WeekdaySlotInputWeekday(d.pop("weekday"))

        minute = d.pop("minute")

        weekday_slot_input = cls(
            weekday=weekday,
            minute=minute,
        )

        return weekday_slot_input
