from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, Self, TypeVar

from attrs import define as _attrs_define

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.dated_slot_input import DatedSlotInput
    from ..models.weekday_slot_input import WeekdaySlotInput


T = TypeVar("T", bound="FinalRequest")


@_attrs_define
class FinalRequest:
    """The final time to pick.

    Attributes:
        slots (list[DatedSlotInput | WeekdaySlotInput]): The slots of the final time: a run of the event's slots in one
            day, in any order.
        date (datetime.date | Unset): Exactly for a weekday event: the date of the one occurrence, `YYYY-MM-DD`. It
            falls on the weekday of the slots and is not before today in the reference zone.
    """

    slots: list[DatedSlotInput | WeekdaySlotInput]
    date: datetime.date | Unset = UNSET

    def to_dict(self) -> dict[str, Any]:
        from ..models.dated_slot_input import DatedSlotInput

        slots = []
        for slots_item_data in self.slots:
            slots_item: dict[str, Any]
            if isinstance(slots_item_data, DatedSlotInput):
                slots_item = slots_item_data.to_dict()
            else:
                slots_item = slots_item_data.to_dict()

            slots.append(slots_item)

        date: str | Unset = UNSET
        if not isinstance(self.date, Unset):
            date = self.date.isoformat()

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "slots": slots,
            }
        )
        if date is not UNSET:
            field_dict["date"] = date

        return field_dict

    @classmethod
    def from_dict(cls, src_dict: Mapping[str, Any]) -> Self:
        from ..models.dated_slot_input import DatedSlotInput
        from ..models.weekday_slot_input import WeekdaySlotInput

        d = dict(src_dict)
        slots = []
        _slots = d.pop("slots")
        for slots_item_data in _slots:

            def _parse_slots_item(data: object) -> DatedSlotInput | WeekdaySlotInput:
                try:
                    if not isinstance(data, dict):
                        raise TypeError()
                    componentsschemas_slot_input_type_0 = DatedSlotInput.from_dict(data)

                    return componentsschemas_slot_input_type_0
                except (TypeError, ValueError, AttributeError, KeyError):
                    pass
                if not isinstance(data, dict):
                    raise TypeError()
                componentsschemas_slot_input_type_1 = WeekdaySlotInput.from_dict(data)

                return componentsschemas_slot_input_type_1

            slots_item = _parse_slots_item(slots_item_data)

            slots.append(slots_item)

        _date = d.pop("date", UNSET)
        date: datetime.date | Unset
        if isinstance(_date, Unset):
            date = UNSET
        else:
            date = datetime.date.fromisoformat(_date)

        final_request = cls(
            slots=slots,
            date=date,
        )

        return final_request
