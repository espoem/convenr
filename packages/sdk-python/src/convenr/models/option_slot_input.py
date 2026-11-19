from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Self, TypeVar

from attrs import define as _attrs_define

T = TypeVar("T", bound="OptionSlotInput")


@_attrs_define
class OptionSlotInput:
    """An option of a poll.

    Attributes:
        option (str): The id of the poll option.
    """

    option: str

    def to_dict(self) -> dict[str, Any]:
        option = self.option

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "option": option,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls, src_dict: Mapping[str, Any]) -> Self:
        d = dict(src_dict)
        option = d.pop("option")

        option_slot_input = cls(
            option=option,
        )

        return option_slot_input
