from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, Self, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
    from ..models.dated_slot import DatedSlot
    from ..models.weekday_slot import WeekdaySlot


T = TypeVar("T", bound="Window")


@_attrs_define
class Window:
    """A run of consecutive slots when the same people are available.

    Attributes:
        slots (list[DatedSlot | WeekdaySlot]): The slots of the window, in time order.
        minutes (int): The length of the window in minutes.
        participant_ids (list[str]): Public ids of the participants available in every slot of the window.
    """

    slots: list[DatedSlot | WeekdaySlot]
    minutes: int
    participant_ids: list[str]
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        from ..models.dated_slot import DatedSlot

        slots = []
        for slots_item_data in self.slots:
            slots_item: dict[str, Any]
            if isinstance(slots_item_data, DatedSlot):
                slots_item = slots_item_data.to_dict()
            else:
                slots_item = slots_item_data.to_dict()

            slots.append(slots_item)

        minutes = self.minutes

        participant_ids = self.participant_ids

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "slots": slots,
                "minutes": minutes,
                "participantIds": participant_ids,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls, src_dict: Mapping[str, Any]) -> Self:
        from ..models.dated_slot import DatedSlot
        from ..models.weekday_slot import WeekdaySlot

        d = dict(src_dict)
        slots = []
        _slots = d.pop("slots")
        for slots_item_data in _slots:

            def _parse_slots_item(data: object) -> DatedSlot | WeekdaySlot:
                try:
                    if not isinstance(data, dict):
                        raise TypeError()
                    componentsschemas_slot_type_0 = DatedSlot.from_dict(data)

                    return componentsschemas_slot_type_0
                except (TypeError, ValueError, AttributeError, KeyError):
                    pass
                if not isinstance(data, dict):
                    raise TypeError()
                componentsschemas_slot_type_1 = WeekdaySlot.from_dict(data)

                return componentsschemas_slot_type_1

            slots_item = _parse_slots_item(slots_item_data)

            slots.append(slots_item)

        minutes = d.pop("minutes")

        participant_ids = cast(list[str], d.pop("participantIds"))

        window = cls(
            slots=slots,
            minutes=minutes,
            participant_ids=participant_ids,
        )

        window.additional_properties = d
        return window

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
