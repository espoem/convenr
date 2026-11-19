from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, Self, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.dates_schedule import DatesSchedule
    from ..models.final_chosen import FinalChosen
    from ..models.final_open import FinalOpen
    from ..models.participant import Participant
    from ..models.poll_schedule import PollSchedule
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
        schedule (DatesSchedule | PollSchedule | RangeSchedule | WeekdaysSchedule): When the event can take place,
            tagged by `mode`.
        retention (RetentionKept | RetentionUntil): When the event will be deleted, tagged by `kind`.
        final (FinalChosen | FinalOpen): The final time, tagged by `kind`.
        participants (list[Participant]): The participants in joining order.
        first_day_of_week (int | Unset): The first day of the week in the grid: 1 is Monday, 7 is Sunday. A poll has
            none. Values so far: 1, 2, 3, 4, 5, 6, 7. A later version may add more.
    """

    id: str
    name: str
    description: str
    reference_zone: str
    schedule: DatesSchedule | PollSchedule | RangeSchedule | WeekdaysSchedule
    retention: RetentionKept | RetentionUntil
    final: FinalChosen | FinalOpen
    participants: list[Participant]
    first_day_of_week: int | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        from ..models.dates_schedule import DatesSchedule
        from ..models.final_open import FinalOpen
        from ..models.range_schedule import RangeSchedule
        from ..models.retention_until import RetentionUntil
        from ..models.weekdays_schedule import WeekdaysSchedule

        id = self.id

        name = self.name

        description = self.description

        reference_zone = self.reference_zone

        schedule: dict[str, Any]
        if (
            isinstance(self.schedule, DatesSchedule)
            or isinstance(self.schedule, RangeSchedule)
            or isinstance(self.schedule, WeekdaysSchedule)
        ):
            schedule = self.schedule.to_dict()
        else:
            schedule = self.schedule.to_dict()

        retention: dict[str, Any]
        if isinstance(self.retention, RetentionUntil):
            retention = self.retention.to_dict()
        else:
            retention = self.retention.to_dict()

        final: dict[str, Any]
        if isinstance(self.final, FinalOpen):
            final = self.final.to_dict()
        else:
            final = self.final.to_dict()

        participants = []
        for participants_item_data in self.participants:
            participants_item = participants_item_data.to_dict()
            participants.append(participants_item)

        first_day_of_week = self.first_day_of_week

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "id": id,
                "name": name,
                "description": description,
                "referenceZone": reference_zone,
                "schedule": schedule,
                "retention": retention,
                "final": final,
                "participants": participants,
            }
        )
        if first_day_of_week is not UNSET:
            field_dict["firstDayOfWeek"] = first_day_of_week

        return field_dict

    @classmethod
    def from_dict(cls, src_dict: Mapping[str, Any]) -> Self:
        from ..models.dates_schedule import DatesSchedule
        from ..models.final_chosen import FinalChosen
        from ..models.final_open import FinalOpen
        from ..models.participant import Participant
        from ..models.poll_schedule import PollSchedule
        from ..models.range_schedule import RangeSchedule
        from ..models.retention_kept import RetentionKept
        from ..models.retention_until import RetentionUntil
        from ..models.weekdays_schedule import WeekdaysSchedule

        d = dict(src_dict)
        id = d.pop("id")

        name = d.pop("name")

        description = d.pop("description")

        reference_zone = d.pop("referenceZone")

        def _parse_schedule(
            data: object,
        ) -> DatesSchedule | PollSchedule | RangeSchedule | WeekdaysSchedule:
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
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                componentsschemas_schedule_type_2 = WeekdaysSchedule.from_dict(data)

                return componentsschemas_schedule_type_2
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            if not isinstance(data, dict):
                raise TypeError()
            componentsschemas_schedule_type_3 = PollSchedule.from_dict(data)

            return componentsschemas_schedule_type_3

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

        def _parse_final(data: object) -> FinalChosen | FinalOpen:
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                componentsschemas_final_type_0 = FinalOpen.from_dict(data)

                return componentsschemas_final_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            if not isinstance(data, dict):
                raise TypeError()
            componentsschemas_final_type_1 = FinalChosen.from_dict(data)

            return componentsschemas_final_type_1

        final = _parse_final(d.pop("final"))

        participants = []
        _participants = d.pop("participants")
        for participants_item_data in _participants:
            participants_item = Participant.from_dict(participants_item_data)

            participants.append(participants_item)

        first_day_of_week = d.pop("firstDayOfWeek", UNSET)

        event = cls(
            id=id,
            name=name,
            description=description,
            reference_zone=reference_zone,
            schedule=schedule,
            retention=retention,
            final=final,
            participants=participants,
            first_day_of_week=first_day_of_week,
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
