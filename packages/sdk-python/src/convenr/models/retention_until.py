from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import (
    Any,
    Literal,
    Self,
    TypeVar,
    cast,
)

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="RetentionUntil")


@_attrs_define
class RetentionUntil:
    """The event will be deleted on a date.

    Attributes:
        kind (Literal['until']): Whether the event has a deletion date.
        date (datetime.date): The day of deletion, `YYYY-MM-DD`.
    """

    kind: Literal["until"]
    date: datetime.date
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        kind = self.kind

        date = self.date.isoformat()

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "kind": kind,
                "date": date,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls, src_dict: Mapping[str, Any]) -> Self:
        d = dict(src_dict)
        kind = cast(Literal["until"], d.pop("kind"))
        if kind != "until":
            raise ValueError(f"kind must match const 'until', got '{kind}'")

        date = datetime.date.fromisoformat(d.pop("date"))

        retention_until = cls(
            kind=kind,
            date=date,
        )

        retention_until.additional_properties = d
        return retention_until

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
