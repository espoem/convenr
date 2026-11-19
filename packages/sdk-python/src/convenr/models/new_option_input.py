from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, Self, TypeVar

from attrs import define as _attrs_define

T = TypeVar("T", bound="NewOptionInput")


@_attrs_define
class NewOptionInput:
    """A new option. An option cannot be changed; a new time is a new option.

    Attributes:
        start (datetime.datetime): The start as an RFC 3339 instant at a whole minute, not before now.
        end (datetime.datetime): The end as an RFC 3339 instant at a whole minute, after the start and on its date in
            the reference zone.
    """

    start: datetime.datetime
    end: datetime.datetime

    def to_dict(self) -> dict[str, Any]:
        start = self.start.isoformat()

        end = self.end.isoformat()

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "start": start,
                "end": end,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls, src_dict: Mapping[str, Any]) -> Self:
        d = dict(src_dict)
        start = datetime.datetime.fromisoformat(d.pop("start"))

        end = datetime.datetime.fromisoformat(d.pop("end"))

        new_option_input = cls(
            start=start,
            end=end,
        )

        return new_option_input
