from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, Self, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.dated_slot_input import DatedSlotInput
    from ..models.weekday_slot_input import WeekdaySlotInput


T = TypeVar("T", bound="AvailabilityRequest")


@_attrs_define
class AvailabilityRequest:
    """The participant's whole availability.

    Attributes:
        availability (list[DatedSlotInput | WeekdaySlotInput]): Every slot in which the participant is available.
    """

    availability: list[DatedSlotInput | WeekdaySlotInput]

    def to_dict(self) -> dict[str, Any]:
        from ..models.dated_slot_input import DatedSlotInput

        availability = []
        for availability_item_data in self.availability:
            availability_item: dict[str, Any]
            if isinstance(availability_item_data, DatedSlotInput):
                availability_item = availability_item_data.to_dict()
            else:
                availability_item = availability_item_data.to_dict()

            availability.append(availability_item)

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "availability": availability,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls, src_dict: Mapping[str, Any]) -> Self:
        from ..models.dated_slot_input import DatedSlotInput
        from ..models.weekday_slot_input import WeekdaySlotInput

        d = dict(src_dict)
        availability = []
        _availability = d.pop("availability")
        for availability_item_data in _availability:

            def _parse_availability_item(
                data: object,
            ) -> DatedSlotInput | WeekdaySlotInput:
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

            availability_item = _parse_availability_item(availability_item_data)

            availability.append(availability_item)

        availability_request = cls(
            availability=availability,
        )

        return availability_request
