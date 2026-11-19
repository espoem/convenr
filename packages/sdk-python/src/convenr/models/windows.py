from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, Self, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
    from ..models.window import Window


T = TypeVar("T", bound="Windows")


@_attrs_define
class Windows:
    """The best windows and the filters applied.

    Attributes:
        min_minutes (int): The shortest window listed, in minutes.
        min_people (int): The fewest people a listed window has.
        windows (list[Window]): At most five windows: the highest score first, then the most people, then the longest,
            then the earliest.
    """

    min_minutes: int
    min_people: int
    windows: list[Window]
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        min_minutes = self.min_minutes

        min_people = self.min_people

        windows = []
        for windows_item_data in self.windows:
            windows_item = windows_item_data.to_dict()
            windows.append(windows_item)

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "minMinutes": min_minutes,
                "minPeople": min_people,
                "windows": windows,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls, src_dict: Mapping[str, Any]) -> Self:
        from ..models.window import Window

        d = dict(src_dict)
        min_minutes = d.pop("minMinutes")

        min_people = d.pop("minPeople")

        windows = []
        _windows = d.pop("windows")
        for windows_item_data in _windows:
            windows_item = Window.from_dict(windows_item_data)

            windows.append(windows_item)

        windows = cls(
            min_minutes=min_minutes,
            min_people=min_people,
            windows=windows,
        )

        windows.additional_properties = d
        return windows

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
