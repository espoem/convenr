from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Self, TypeVar

from attrs import define as _attrs_define

from ..types import UNSET, Unset

T = TypeVar("T", bound="SetPasswordRequest")


@_attrs_define
class SetPasswordRequest:
    """A new password.

    Attributes:
        new_password (str): A new password, 4 to 128 characters.
        current_password (str | Unset): The password set now. Needed exactly when a password is set.
    """

    new_password: str
    current_password: str | Unset = UNSET

    def to_dict(self) -> dict[str, Any]:
        new_password = self.new_password

        current_password = self.current_password

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "newPassword": new_password,
            }
        )
        if current_password is not UNSET:
            field_dict["currentPassword"] = current_password

        return field_dict

    @classmethod
    def from_dict(cls, src_dict: Mapping[str, Any]) -> Self:
        d = dict(src_dict)
        new_password = d.pop("newPassword")

        current_password = d.pop("currentPassword", UNSET)

        set_password_request = cls(
            new_password=new_password,
            current_password=current_password,
        )

        return set_password_request
