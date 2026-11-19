from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Self, TypeVar

from attrs import define as _attrs_define

T = TypeVar("T", bound="RemovePasswordRequest")


@_attrs_define
class RemovePasswordRequest:
    """The password to remove.

    Attributes:
        current_password (str): The password set now.
    """

    current_password: str

    def to_dict(self) -> dict[str, Any]:
        current_password = self.current_password

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "currentPassword": current_password,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls, src_dict: Mapping[str, Any]) -> Self:
        d = dict(src_dict)
        current_password = d.pop("currentPassword")

        remove_password_request = cls(
            current_password=current_password,
        )

        return remove_password_request
