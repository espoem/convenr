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

if TYPE_CHECKING:
    from ..models.option import Option
    from ..models.option_slot import OptionSlot


T = TypeVar("T", bound="PollSchedule")


@_attrs_define
class PollSchedule:
    """A poll of a few hand-picked times, each answered as a slot is.

    Attributes:
        mode (Literal['poll']): The kind of schedule.
        options (list[Option]): The options of the poll, in time order.
        slots (list[OptionSlot]): One slot for each option, in time order.
    """

    mode: Literal["poll"]
    options: list[Option]
    slots: list[OptionSlot]
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        mode = self.mode

        options = []
        for options_item_data in self.options:
            options_item = options_item_data.to_dict()
            options.append(options_item)

        slots = []
        for slots_item_data in self.slots:
            slots_item = slots_item_data.to_dict()
            slots.append(slots_item)

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "mode": mode,
                "options": options,
                "slots": slots,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls, src_dict: Mapping[str, Any]) -> Self:
        from ..models.option import Option
        from ..models.option_slot import OptionSlot

        d = dict(src_dict)
        mode = cast(Literal["poll"], d.pop("mode"))
        if mode != "poll":
            raise ValueError(f"mode must match const 'poll', got '{mode}'")

        options = []
        _options = d.pop("options")
        for options_item_data in _options:
            options_item = Option.from_dict(options_item_data)

            options.append(options_item)

        slots = []
        _slots = d.pop("slots")
        for slots_item_data in _slots:
            slots_item = OptionSlot.from_dict(slots_item_data)

            slots.append(slots_item)

        poll_schedule = cls(
            mode=mode,
            options=options,
            slots=slots,
        )

        poll_schedule.additional_properties = d
        return poll_schedule

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
