from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, Self, TypeVar

from attrs import define as _attrs_define

from ..models.update_event_request_first_day_of_week import (
    UpdateEventRequestFirstDayOfWeek,
)
from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.dates_schedule_input import DatesScheduleInput
    from ..models.range_schedule_input import RangeScheduleInput
    from ..models.weekdays_schedule_input import WeekdaysScheduleInput


T = TypeVar("T", bound="UpdateEventRequest")


@_attrs_define
class UpdateEventRequest:
    """The fields to change. A field left out keeps its value.

    Attributes:
        name (str | Unset): The name of the event.
        description (str | Unset): A description of the event; empty when there is none.
        reference_zone (str | Unset): The IANA time zone in which the organizer planned the event.
        first_day_of_week (UpdateEventRequestFirstDayOfWeek | Unset): The first day of the week in the grid: 1 is
            Monday, 7 is Sunday.
        schedule (DatesScheduleInput | RangeScheduleInput | Unset | WeekdaysScheduleInput): When the event can take
            place, tagged by `mode`. The server derives the slots.
        confirmed_version (str | Unset): The `ETag` of a `confirmation_required` refusal. The change may remove the
            availability that refusal counted, while the event still has that version.
    """

    name: str | Unset = UNSET
    description: str | Unset = UNSET
    reference_zone: str | Unset = UNSET
    first_day_of_week: UpdateEventRequestFirstDayOfWeek | Unset = UNSET
    schedule: (
        DatesScheduleInput | RangeScheduleInput | Unset | WeekdaysScheduleInput
    ) = UNSET
    confirmed_version: str | Unset = UNSET

    def to_dict(self) -> dict[str, Any]:
        from ..models.dates_schedule_input import DatesScheduleInput
        from ..models.range_schedule_input import RangeScheduleInput

        name = self.name

        description = self.description

        reference_zone = self.reference_zone

        first_day_of_week: int | Unset = UNSET
        if not isinstance(self.first_day_of_week, Unset):
            first_day_of_week = self.first_day_of_week.value

        schedule: dict[str, Any] | Unset
        if isinstance(self.schedule, Unset):
            schedule = UNSET
        elif isinstance(self.schedule, DatesScheduleInput) or isinstance(
            self.schedule, RangeScheduleInput
        ):
            schedule = self.schedule.to_dict()
        else:
            schedule = self.schedule.to_dict()

        confirmed_version = self.confirmed_version

        field_dict: dict[str, Any] = {}

        field_dict.update({})
        if name is not UNSET:
            field_dict["name"] = name
        if description is not UNSET:
            field_dict["description"] = description
        if reference_zone is not UNSET:
            field_dict["referenceZone"] = reference_zone
        if first_day_of_week is not UNSET:
            field_dict["firstDayOfWeek"] = first_day_of_week
        if schedule is not UNSET:
            field_dict["schedule"] = schedule
        if confirmed_version is not UNSET:
            field_dict["confirmedVersion"] = confirmed_version

        return field_dict

    @classmethod
    def from_dict(cls, src_dict: Mapping[str, Any]) -> Self:
        from ..models.dates_schedule_input import DatesScheduleInput
        from ..models.range_schedule_input import RangeScheduleInput
        from ..models.weekdays_schedule_input import WeekdaysScheduleInput

        d = dict(src_dict)
        name = d.pop("name", UNSET)

        description = d.pop("description", UNSET)

        reference_zone = d.pop("referenceZone", UNSET)

        _first_day_of_week = d.pop("firstDayOfWeek", UNSET)
        first_day_of_week: UpdateEventRequestFirstDayOfWeek | Unset
        if isinstance(_first_day_of_week, Unset):
            first_day_of_week = UNSET
        else:
            first_day_of_week = UpdateEventRequestFirstDayOfWeek(_first_day_of_week)

        def _parse_schedule(
            data: object,
        ) -> DatesScheduleInput | RangeScheduleInput | Unset | WeekdaysScheduleInput:
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                componentsschemas_schedule_input_type_0 = DatesScheduleInput.from_dict(
                    data
                )

                return componentsschemas_schedule_input_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                componentsschemas_schedule_input_type_1 = RangeScheduleInput.from_dict(
                    data
                )

                return componentsschemas_schedule_input_type_1
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            if not isinstance(data, dict):
                raise TypeError()
            componentsschemas_schedule_input_type_2 = WeekdaysScheduleInput.from_dict(
                data
            )

            return componentsschemas_schedule_input_type_2

        schedule = _parse_schedule(d.pop("schedule", UNSET))

        confirmed_version = d.pop("confirmedVersion", UNSET)

        update_event_request = cls(
            name=name,
            description=description,
            reference_zone=reference_zone,
            first_day_of_week=first_day_of_week,
            schedule=schedule,
            confirmed_version=confirmed_version,
        )

        return update_event_request
