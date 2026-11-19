from __future__ import annotations

from collections.abc import Mapping
from typing import (
    TYPE_CHECKING,
    Any,
    Literal,
    Self,
    TypeVar,
    cast,
)

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.kept_option_input import KeptOptionInput
    from ..models.new_option_input import NewOptionInput


T = TypeVar("T", bound="PollScheduleInput")


@_attrs_define
class PollScheduleInput:
    """A poll of 2 to 20 options.

    Attributes:
        mode (Literal['poll']): The kind of schedule.
        options (list[KeptOptionInput | NewOptionInput]): 2 to 20 options. A change names the options it keeps by id and
            new ones by their times; an option it leaves out is removed with its answers.
    """

    mode: Literal["poll"]
    options: list[KeptOptionInput | NewOptionInput]

    def to_dict(self) -> dict[str, Any]:
        from ..models.kept_option_input import KeptOptionInput

        mode = self.mode

        options = []
        for options_item_data in self.options:
            options_item: dict[str, Any]
            if isinstance(options_item_data, KeptOptionInput):
                options_item = options_item_data.to_dict()
            else:
                options_item = options_item_data.to_dict()

            options.append(options_item)

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "mode": mode,
                "options": options,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls, src_dict: Mapping[str, Any]) -> Self:
        from ..models.kept_option_input import KeptOptionInput
        from ..models.new_option_input import NewOptionInput

        d = dict(src_dict)
        mode = cast(Literal["poll"], d.pop("mode"))
        if mode != "poll":
            raise ValueError(f"mode must match const 'poll', got '{mode}'")

        options = []
        _options = d.pop("options")
        for options_item_data in _options:

            def _parse_options_item(data: object) -> KeptOptionInput | NewOptionInput:
                try:
                    if not isinstance(data, dict):
                        raise TypeError()
                    componentsschemas_option_input_type_0 = KeptOptionInput.from_dict(
                        data
                    )

                    return componentsschemas_option_input_type_0
                except (TypeError, ValueError, AttributeError, KeyError):
                    pass
                if not isinstance(data, dict):
                    raise TypeError()
                componentsschemas_option_input_type_1 = NewOptionInput.from_dict(data)

                return componentsschemas_option_input_type_1

            options_item = _parse_options_item(options_item_data)

            options.append(options_item)

        poll_schedule_input = cls(
            mode=mode,
            options=options,
        )

        return poll_schedule_input
