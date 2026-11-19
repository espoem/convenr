from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, Self, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
    from ..models.dates_schedule import DatesSchedule
    from ..models.participant import Participant
    from ..models.range_schedule import RangeSchedule
    from ..models.retention_kept import RetentionKept
    from ..models.retention_until import RetentionUntil
    from ..models.weekdays_schedule import WeekdaysSchedule


T = TypeVar("T", bound="Event")


@_attrs_define
class Event:
    """An event with its schedule and participants.

    Attributes:
        id (str): The public id of the event.
        name (str): The name of the event.
        description (str): A description of the event; empty when there is none.
        reference_zone (str): The IANA time zone in which the organizer planned the event.
        first_day_of_week (int): The first day of the week in the grid: 1 is Monday, 7 is Sunday. Values so far: 1, 2,
            3, 4, 5, 6, 7. A later version may add more.
        schedule (DatesSchedule | RangeSchedule | WeekdaysSchedule): When the event can take place, tagged by `mode`.
        retention (RetentionKept | RetentionUntil): When the event will be deleted, tagged by `kind`.
        participants (list[Participant]): The participants in joining order.
    """

    id: str
    name: str
    description: str
    reference_zone: str
    first_day_of_week: int
    schedule: DatesSchedule | RangeSchedule | WeekdaysSchedule
    retention: RetentionKept | RetentionUntil
    participants: list[Participant]
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        from ..models.dates_schedule import DatesSchedule
        from ..models.range_schedule import RangeSchedule
        from ..models.retention_until import RetentionUntil

        id = self.id

        name = self.name

        description = self.description

        reference_zone = self.reference_zone

        first_day_of_week = self.first_day_of_week

        schedule: dict[str, Any]
        if isinstance(self.schedule, DatesSchedule) or isinstance(
            self.schedule, RangeSchedule
        ):
            schedule = self.schedule.to_dict()
        else:
            schedule = self.schedule.to_dict()

        retention: dict[str, Any]
        if isinstance(self.retention, RetentionUntil):
            retention = self.retention.to_dict()
        else:
            retention = self.retention.to_dict()

        participants = []
        for participants_item_data in self.participants:
            participants_item = participants_item_data.to_dict()
            participants.append(participants_item)

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "id": id,
                "name": name,
                "description": description,
                "referenceZone": reference_zone,
                "firstDayOfWeek": first_day_of_week,
                "schedule": schedule,
                "retention": retention,
                "participants": participants,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls, src_dict: Mapping[str, Any]) -> Self:
        from ..models.dates_schedule import DatesSchedule
        from ..models.participant import Participant
        from ..models.range_schedule import RangeSchedule
        from ..models.retention_kept import RetentionKept
        from ..models.retention_until import RetentionUntil
        from ..models.weekdays_schedule import WeekdaysSchedule

        d = dict(src_dict)
        id = d.pop("id")

        name = d.pop("name")

        description = d.pop("description")

        reference_zone = d.pop("referenceZone")

        first_day_of_week = d.pop("firstDayOfWeek")

        def _parse_schedule(
            data: object,
        ) -> DatesSchedule | RangeSchedule | WeekdaysSchedule:
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                componentsschemas_schedule_type_0 = DatesSchedule.from_dict(data)

                return componentsschemas_schedule_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                componentsschemas_schedule_type_1 = RangeSchedule.from_dict(data)

                return componentsschemas_schedule_type_1
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            if not isinstance(data, dict):
                raise TypeError()
            componentsschemas_schedule_type_2 = WeekdaysSchedule.from_dict(data)

            return componentsschemas_schedule_type_2

        schedule = _parse_schedule(d.pop("schedule"))

        def _parse_retention(data: object) -> RetentionKept | RetentionUntil:
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                componentsschemas_retention_type_0 = RetentionUntil.from_dict(data)

                return componentsschemas_retention_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            if not isinstance(data, dict):
                raise TypeError()
            componentsschemas_retention_type_1 = RetentionKept.from_dict(data)

            return componentsschemas_retention_type_1

        retention = _parse_retention(d.pop("retention"))

        participants = []
        _participants = d.pop("participants")
        for participants_item_data in _participants:
            participants_item = Participant.from_dict(participants_item_data)

            participants.append(participants_item)

        event = cls(
            id=id,
            name=name,
            description=description,
            reference_zone=reference_zone,
            first_day_of_week=first_day_of_week,
            schedule=schedule,
            retention=retention,
            participants=participants,
        )

        event.additional_properties = d
        return event

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
