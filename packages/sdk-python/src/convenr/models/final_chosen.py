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
    from ..models.weekday_slot import WeekdaySlot


T = TypeVar("T", bound="FinalChosen")


@_attrs_define
class FinalChosen:
    """The final time the organizer picked, as one dated occurrence.

    Attributes:
        kind (Literal['chosen']): Whether a final time is picked.
        start (datetime.datetime): The start as an RFC 3339 instant in UTC.
        end (datetime.datetime): The end as an RFC 3339 instant in UTC.
        sequence (int): How many times a final time was picked or changed. It does not go back when the final time is
            cleared.
        slots (list[DatedSlot | WeekdaySlot]): The event's slots inside the final time, in time order.
    """

    kind: Literal["chosen"]
    start: datetime.datetime
    end: datetime.datetime
    sequence: int
    slots: list[DatedSlot | WeekdaySlot]
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        from ..models.dated_slot import DatedSlot

        kind = self.kind

        start = self.start.isoformat()

        end = self.end.isoformat()

        sequence = self.sequence

        slots = []
        for slots_item_data in self.slots:
            slots_item: dict[str, Any]
            if isinstance(slots_item_data, DatedSlot):
                slots_item = slots_item_data.to_dict()
            else:
                slots_item = slots_item_data.to_dict()

            slots.append(slots_item)

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "kind": kind,
                "start": start,
                "end": end,
                "sequence": sequence,
                "slots": slots,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls, src_dict: Mapping[str, Any]) -> Self:
        from ..models.dated_slot import DatedSlot
        from ..models.weekday_slot import WeekdaySlot

        d = dict(src_dict)
        kind = cast(Literal["chosen"], d.pop("kind"))
        if kind != "chosen":
            raise ValueError(f"kind must match const 'chosen', got '{kind}'")

        start = datetime.datetime.fromisoformat(d.pop("start"))

        end = datetime.datetime.fromisoformat(d.pop("end"))

        sequence = d.pop("sequence")

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

        final_chosen = cls(
            kind=kind,
            start=start,
            end=end,
            sequence=sequence,
            slots=slots,
        )

        final_chosen.additional_properties = d
        return final_chosen

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
