from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, Self, TypeVar

from attrs import define as _attrs_define

T = TypeVar("T", bound="DatedSlotInput")


@_attrs_define
class DatedSlotInput:
    """A slot of a dated event.

    Attributes:
        start (datetime.datetime): The start of the slot as an RFC 3339 instant. A request may give any offset; an
            answer gives it in UTC with Z.
    """

    start: datetime.datetime

    def to_dict(self) -> dict[str, Any]:
        start = self.start.isoformat()

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "start": start,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls, src_dict: Mapping[str, Any]) -> Self:
        d = dict(src_dict)
        start = datetime.datetime.fromisoformat(d.pop("start"))

        dated_slot_input = cls(
            start=start,
        )

        return dated_slot_input
