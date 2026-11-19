from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, Self, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.parameter_error import ParameterError
    from ..models.pointer_error import PointerError


T = TypeVar("T", bound="Problem")


@_attrs_define
class Problem:
    """An RFC 9457 problem: why a request was refused.

    Attributes:
        type_ (str): `https://convenr.party/problems/` followed by the code. Compare it as a string.
        status (int): The HTTP status.
        title (str): A short English text that is the same for every problem with this code.
        code (str): A stable snake_case name of the problem. A client handles a code it does not know as a general
            failure.
        errors (list[ParameterError | PointerError] | Unset): The values at fault.
        retry_at (datetime.datetime | Unset): With `too_many_attempts`: when a password may be tried again.
        losing (int | Unset): With `confirmation_required`: how many participants would lose part of their availability.
        clears_final (bool | Unset): With `confirmation_required`: whether the change would clear the final time.
    """

    type_: str
    status: int
    title: str
    code: str
    errors: list[ParameterError | PointerError] | Unset = UNSET
    retry_at: datetime.datetime | Unset = UNSET
    losing: int | Unset = UNSET
    clears_final: bool | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        from ..models.pointer_error import PointerError

        type_ = self.type_

        status = self.status

        title = self.title

        code = self.code

        errors: list[dict[str, Any]] | Unset = UNSET
        if not isinstance(self.errors, Unset):
            errors = []
            for errors_item_data in self.errors:
                errors_item: dict[str, Any]
                if isinstance(errors_item_data, PointerError):
                    errors_item = errors_item_data.to_dict()
                else:
                    errors_item = errors_item_data.to_dict()

                errors.append(errors_item)

        retry_at: str | Unset = UNSET
        if not isinstance(self.retry_at, Unset):
            retry_at = self.retry_at.isoformat()

        losing = self.losing

        clears_final = self.clears_final

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "type": type_,
                "status": status,
                "title": title,
                "code": code,
            }
        )
        if errors is not UNSET:
            field_dict["errors"] = errors
        if retry_at is not UNSET:
            field_dict["retryAt"] = retry_at
        if losing is not UNSET:
            field_dict["losing"] = losing
        if clears_final is not UNSET:
            field_dict["clearsFinal"] = clears_final

        return field_dict

    @classmethod
    def from_dict(cls, src_dict: Mapping[str, Any]) -> Self:
        from ..models.parameter_error import ParameterError
        from ..models.pointer_error import PointerError

        d = dict(src_dict)
        type_ = d.pop("type")

        status = d.pop("status")

        title = d.pop("title")

        code = d.pop("code")

        _errors = d.pop("errors", UNSET)
        errors: list[ParameterError | PointerError] | Unset = UNSET
        if _errors is not UNSET:
            errors = []
            for errors_item_data in _errors:

                def _parse_errors_item(data: object) -> ParameterError | PointerError:
                    try:
                        if not isinstance(data, dict):
                            raise TypeError()
                        componentsschemas_field_error_type_0 = PointerError.from_dict(
                            data
                        )

                        return componentsschemas_field_error_type_0
                    except (TypeError, ValueError, AttributeError, KeyError):
                        pass
                    if not isinstance(data, dict):
                        raise TypeError()
                    componentsschemas_field_error_type_1 = ParameterError.from_dict(
                        data
                    )

                    return componentsschemas_field_error_type_1

                errors_item = _parse_errors_item(errors_item_data)

                errors.append(errors_item)

        _retry_at = d.pop("retryAt", UNSET)
        retry_at: datetime.datetime | Unset
        if isinstance(_retry_at, Unset):
            retry_at = UNSET
        else:
            retry_at = datetime.datetime.fromisoformat(_retry_at)

        losing = d.pop("losing", UNSET)

        clears_final = d.pop("clearsFinal", UNSET)

        problem = cls(
            type_=type_,
            status=status,
            title=title,
            code=code,
            errors=errors,
            retry_at=retry_at,
            losing=losing,
            clears_final=clears_final,
        )

        problem.additional_properties = d
        return problem

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
