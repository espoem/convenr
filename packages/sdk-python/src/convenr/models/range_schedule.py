from __future__ import annotations

import datetime
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

if TYPE_CHECKING:
    from ..models.dated_slot import DatedSlot


T = TypeVar("T", bound="RangeSchedule")


@_attrs_define
class RangeSchedule:
    """An event on every day from one date to another.

    Attributes:
        mode (Literal['range']): The kind of schedule.
        first (datetime.date): The first day, `YYYY-MM-DD`.
        last (datetime.date): The last day, `YYYY-MM-DD`.
        daily_start (str): The start of each day's slots, `HH:MM`.
        daily_end (str): The end of each day's slots, `HH:MM`; `24:00` is midnight.
        slot_minutes (int): The length of a slot in minutes. Values so far: 15, 30, 60. A later version may add more.
        slots (list[DatedSlot]): Every slot of the event, in time order.
    """

    mode: Literal["range"]
    first: datetime.date
    last: datetime.date
    daily_start: str
    daily_end: str
    slot_minutes: int
    slots: list[DatedSlot]
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        mode = self.mode

        first = self.first.isoformat()

        last = self.last.isoformat()

        daily_start = self.daily_start

        daily_end = self.daily_end

        slot_minutes = self.slot_minutes

        slots = []
        for slots_item_data in self.slots:
            slots_item = slots_item_data.to_dict()
            slots.append(slots_item)

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "mode": mode,
                "first": first,
                "last": last,
                "dailyStart": daily_start,
                "dailyEnd": daily_end,
                "slotMinutes": slot_minutes,
                "slots": slots,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls, src_dict: Mapping[str, Any]) -> Self:
        from ..models.dated_slot import DatedSlot

        d = dict(src_dict)
        mode = cast(Literal["range"], d.pop("mode"))
        if mode != "range":
            raise ValueError(f"mode must match const 'range', got '{mode}'")

        first = datetime.date.fromisoformat(d.pop("first"))

        last = datetime.date.fromisoformat(d.pop("last"))

        daily_start = d.pop("dailyStart")

        daily_end = d.pop("dailyEnd")

        slot_minutes = d.pop("slotMinutes")

        slots = []
        _slots = d.pop("slots")
        for slots_item_data in _slots:
            slots_item = DatedSlot.from_dict(slots_item_data)

            slots.append(slots_item)

        range_schedule = cls(
            mode=mode,
            first=first,
            last=last,
            daily_start=daily_start,
            daily_end=daily_end,
            slot_minutes=slot_minutes,
            slots=slots,
        )

        range_schedule.additional_properties = d
        return range_schedule

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
