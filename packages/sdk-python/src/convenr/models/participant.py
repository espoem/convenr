from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, Self, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
    from ..models.dated_slot import DatedSlot
    from ..models.weekday_slot import WeekdaySlot


T = TypeVar("T", bound="Participant")


@_attrs_define
class Participant:
    """A participant. Nothing says whether they have a password.

    Attributes:
        id (str): The public id of the participant.
        name (str): The display name of the participant.
        availability (list[DatedSlot | WeekdaySlot]): The slots in which the participant is available, if need be
            included, in time order. A client that knows no levels reads an if-need-be slot as available.
        if_need_be (list[DatedSlot | WeekdaySlot]): The slots of `availability` in which the participant is available
            only if need be, in time order.
    """

    id: str
    name: str
    availability: list[DatedSlot | WeekdaySlot]
    if_need_be: list[DatedSlot | WeekdaySlot]
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        from ..models.dated_slot import DatedSlot

        id = self.id

        name = self.name

        availability = []
        for availability_item_data in self.availability:
            availability_item: dict[str, Any]
            if isinstance(availability_item_data, DatedSlot):
                availability_item = availability_item_data.to_dict()
            else:
                availability_item = availability_item_data.to_dict()

            availability.append(availability_item)

        if_need_be = []
        for if_need_be_item_data in self.if_need_be:
            if_need_be_item: dict[str, Any]
            if isinstance(if_need_be_item_data, DatedSlot):
                if_need_be_item = if_need_be_item_data.to_dict()
            else:
                if_need_be_item = if_need_be_item_data.to_dict()

            if_need_be.append(if_need_be_item)

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "id": id,
                "name": name,
                "availability": availability,
                "ifNeedBe": if_need_be,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls, src_dict: Mapping[str, Any]) -> Self:
        from ..models.dated_slot import DatedSlot
        from ..models.weekday_slot import WeekdaySlot

        d = dict(src_dict)
        id = d.pop("id")

        name = d.pop("name")

        availability = []
        _availability = d.pop("availability")
        for availability_item_data in _availability:

            def _parse_availability_item(data: object) -> DatedSlot | WeekdaySlot:
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

            availability_item = _parse_availability_item(availability_item_data)

            availability.append(availability_item)

        if_need_be = []
        _if_need_be = d.pop("ifNeedBe")
        for if_need_be_item_data in _if_need_be:

            def _parse_if_need_be_item(data: object) -> DatedSlot | WeekdaySlot:
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

            if_need_be_item = _parse_if_need_be_item(if_need_be_item_data)

            if_need_be.append(if_need_be_item)

        participant = cls(
            id=id,
            name=name,
            availability=availability,
            if_need_be=if_need_be,
        )

        participant.additional_properties = d
        return participant

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
