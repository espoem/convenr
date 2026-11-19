from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, Self, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
    from ..models.participant import Participant


T = TypeVar("T", bound="Joined")


@_attrs_define
class Joined:
    """A participant and their token.

    Attributes:
        participant (Participant): A participant. Nothing says whether they have a password.
        participant_token (str): The participant token.
    """

    participant: Participant
    participant_token: str
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        participant = self.participant.to_dict()

        participant_token = self.participant_token

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "participant": participant,
                "participantToken": participant_token,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls, src_dict: Mapping[str, Any]) -> Self:
        from ..models.participant import Participant

        d = dict(src_dict)
        participant = Participant.from_dict(d.pop("participant"))

        participant_token = d.pop("participantToken")

        joined = cls(
            participant=participant,
            participant_token=participant_token,
        )

        joined.additional_properties = d
        return joined

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
