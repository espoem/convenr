from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Self, TypeVar

from attrs import define as _attrs_define

from ..types import UNSET, Unset

T = TypeVar("T", bound="JoinRequest")


@_attrs_define
class JoinRequest:
    """A join. At most one of `password` and `newPassword`.

    Attributes:
        name (str): The display name to join under.
        password (str | Unset): The password of a name that already has one. A name nobody uses is refused with it.
        new_password (str | Unset): A password for a name nobody uses yet. A name already used is refused with it.
    """

    name: str
    password: str | Unset = UNSET
    new_password: str | Unset = UNSET

    def to_dict(self) -> dict[str, Any]:
        name = self.name

        password = self.password

        new_password = self.new_password

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "name": name,
            }
        )
        if password is not UNSET:
            field_dict["password"] = password
        if new_password is not UNSET:
            field_dict["newPassword"] = new_password

        return field_dict

    @classmethod
    def from_dict(cls, src_dict: Mapping[str, Any]) -> Self:
        d = dict(src_dict)
        name = d.pop("name")

        password = d.pop("password", UNSET)

        new_password = d.pop("newPassword", UNSET)

        join_request = cls(
            name=name,
            password=password,
            new_password=new_password,
        )

        return join_request
