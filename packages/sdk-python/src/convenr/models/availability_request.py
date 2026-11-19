from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, Self, TypeVar

from attrs import define as _attrs_define

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.dated_slot_input import DatedSlotInput
    from ..models.weekday_slot_input import WeekdaySlotInput


T = TypeVar("T", bound="AvailabilityRequest")


@_attrs_define
class AvailabilityRequest:
    """The participant's whole availability.

    Attributes:
        availability (list[DatedSlotInput | WeekdaySlotInput]): Every slot in which the participant is available, if
            need be included.
        if_need_be (list[DatedSlotInput | WeekdaySlotInput] | Unset): The slots of `availability` that are only if need
            be; a slot missing from `availability` is refused with `invalid_request` and the field code
            `if_need_be_not_available`. Left out, each slot keeps its stored level and a new slot is available. Empty, every
            slot is available.
    """

    availability: list[DatedSlotInput | WeekdaySlotInput]
    if_need_be: list[DatedSlotInput | WeekdaySlotInput] | Unset = UNSET

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

        if_need_be: list[dict[str, Any]] | Unset = UNSET
        if not isinstance(self.if_need_be, Unset):
            if_need_be = []
            for if_need_be_item_data in self.if_need_be:
                if_need_be_item: dict[str, Any]
                if isinstance(if_need_be_item_data, DatedSlotInput):
                    if_need_be_item = if_need_be_item_data.to_dict()
                else:
                    if_need_be_item = if_need_be_item_data.to_dict()

                if_need_be.append(if_need_be_item)

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "availability": availability,
            }
        )
        if if_need_be is not UNSET:
            field_dict["ifNeedBe"] = if_need_be

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

        _if_need_be = d.pop("ifNeedBe", UNSET)
        if_need_be: list[DatedSlotInput | WeekdaySlotInput] | Unset = UNSET
        if _if_need_be is not UNSET:
            if_need_be = []
            for if_need_be_item_data in _if_need_be:

                def _parse_if_need_be_item(
                    data: object,
                ) -> DatedSlotInput | WeekdaySlotInput:
                    try:
                        if not isinstance(data, dict):
                            raise TypeError()
                        componentsschemas_slot_input_type_0 = DatedSlotInput.from_dict(
                            data
                        )

                        return componentsschemas_slot_input_type_0
                    except (TypeError, ValueError, AttributeError, KeyError):
                        pass
                    if not isinstance(data, dict):
                        raise TypeError()
                    componentsschemas_slot_input_type_1 = WeekdaySlotInput.from_dict(
                        data
                    )

                    return componentsschemas_slot_input_type_1

                if_need_be_item = _parse_if_need_be_item(if_need_be_item_data)

                if_need_be.append(if_need_be_item)

        availability_request = cls(
            availability=availability,
            if_need_be=if_need_be,
        )

        return availability_request
