from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, Self, TypeVar

from attrs import define as _attrs_define

from ..models.create_event_request_first_day_of_week import (
    CreateEventRequestFirstDayOfWeek,
)
from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.dates_schedule_input import DatesScheduleInput
    from ..models.range_schedule_input import RangeScheduleInput
    from ..models.weekdays_schedule_input import WeekdaysScheduleInput


T = TypeVar("T", bound="CreateEventRequest")


@_attrs_define
class CreateEventRequest:
    """A new event.

    Attributes:
        name (str): The name of the event.
        reference_zone (str): The IANA time zone in which the organizer planned the event.
        schedule (DatesScheduleInput | RangeScheduleInput | WeekdaysScheduleInput): When the event can take place,
            tagged by `mode`. The server derives the slots.
        description (str | Unset): A description of the event. Empty when left out.
        first_day_of_week (CreateEventRequestFirstDayOfWeek | Unset): The first day of the week in the grid: 1 is
            Monday, 7 is Sunday. Monday when left out.
    """

    name: str
    reference_zone: str
    schedule: DatesScheduleInput | RangeScheduleInput | WeekdaysScheduleInput
    description: str | Unset = UNSET
    first_day_of_week: CreateEventRequestFirstDayOfWeek | Unset = UNSET

    def to_dict(self) -> dict[str, Any]:
        from ..models.dates_schedule_input import DatesScheduleInput
        from ..models.range_schedule_input import RangeScheduleInput

        name = self.name

        reference_zone = self.reference_zone

        schedule: dict[str, Any]
        if isinstance(self.schedule, DatesScheduleInput) or isinstance(
            self.schedule, RangeScheduleInput
        ):
            schedule = self.schedule.to_dict()
        else:
            schedule = self.schedule.to_dict()

        description = self.description

        first_day_of_week: int | Unset = UNSET
        if not isinstance(self.first_day_of_week, Unset):
            first_day_of_week = self.first_day_of_week.value

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "name": name,
                "referenceZone": reference_zone,
                "schedule": schedule,
            }
        )
        if description is not UNSET:
            field_dict["description"] = description
        if first_day_of_week is not UNSET:
            field_dict["firstDayOfWeek"] = first_day_of_week

        return field_dict

    @classmethod
    def from_dict(cls, src_dict: Mapping[str, Any]) -> Self:
        from ..models.dates_schedule_input import DatesScheduleInput
        from ..models.range_schedule_input import RangeScheduleInput
        from ..models.weekdays_schedule_input import WeekdaysScheduleInput

        d = dict(src_dict)
        name = d.pop("name")

        reference_zone = d.pop("referenceZone")

        def _parse_schedule(
            data: object,
        ) -> DatesScheduleInput | RangeScheduleInput | WeekdaysScheduleInput:
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

        schedule = _parse_schedule(d.pop("schedule"))

        description = d.pop("description", UNSET)

        _first_day_of_week = d.pop("firstDayOfWeek", UNSET)
        first_day_of_week: CreateEventRequestFirstDayOfWeek | Unset
        if isinstance(_first_day_of_week, Unset):
            first_day_of_week = UNSET
        else:
            first_day_of_week = CreateEventRequestFirstDayOfWeek(_first_day_of_week)

        create_event_request = cls(
            name=name,
            reference_zone=reference_zone,
            schedule=schedule,
            description=description,
            first_day_of_week=first_day_of_week,
        )

        return create_event_request
