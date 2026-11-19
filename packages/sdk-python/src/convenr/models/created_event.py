from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, Self, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
    from ..models.event import Event


T = TypeVar("T", bound="CreatedEvent")


@_attrs_define
class CreatedEvent:
    """A new event and its admin secret.

    Attributes:
        event (Event): An event with its schedule and participants.
        admin_secret (str): The admin secret. It is shown only here and cannot be recovered.
    """

    event: Event
    admin_secret: str
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        event = self.event.to_dict()

        admin_secret = self.admin_secret

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "event": event,
                "adminSecret": admin_secret,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls, src_dict: Mapping[str, Any]) -> Self:
        from ..models.event import Event

        d = dict(src_dict)
        event = Event.from_dict(d.pop("event"))

        admin_secret = d.pop("adminSecret")

        created_event = cls(
            event=event,
            admin_secret=admin_secret,
        )

        created_event.additional_properties = d
        return created_event

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
