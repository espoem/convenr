from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Self, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.weekday_slot_weekday import WeekdaySlotWeekday

T = TypeVar("T", bound="WeekdaySlot")


@_attrs_define
class WeekdaySlot:
    """A slot of a weekday event: a wall-clock time in the reference zone.

    Attributes:
        weekday (WeekdaySlotWeekday): The day of the week: 1 is Monday, 7 is Sunday.
        minute (int): The start of the slot in minutes after midnight.
    """

    weekday: WeekdaySlotWeekday
    minute: int
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        weekday = self.weekday.value

        minute = self.minute

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
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
        weekday = WeekdaySlotWeekday(d.pop("weekday"))

        minute = d.pop("minute")

        weekday_slot = cls(
            weekday=weekday,
            minute=minute,
        )

        weekday_slot.additional_properties = d
        return weekday_slot

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
