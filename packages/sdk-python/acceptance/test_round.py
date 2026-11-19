"""The Python SDK against a running instance at CONVENR_URL."""

import os
from http import HTTPStatus
from urllib.parse import urljoin

from convenr import AuthenticatedClient, Client
from convenr.api.events import create_event, delete_event, get_event, get_windows
from convenr.api.participants import join, save_availability
from convenr.models import (
    AvailabilityRequest,
    CreatedEvent,
    CreateEventRequest,
    Event,
    JoinRequest,
    Joined,
    Problem,
    WeekdaySlot,
    WeekdaySlotInput,
    WeekdaySlotInputWeekday,
    WeekdaysSchedule,
    WeekdaysScheduleInput,
    WeekdaysScheduleInputSlotMinutes,
    WeekdaysScheduleInputWeekdaysItem,
    Windows,
)

BASE_URL = urljoin(os.environ["CONVENR_URL"], "/api/v1")


def authenticated(secret: str) -> AuthenticatedClient:
    return AuthenticatedClient(base_url=BASE_URL, token=secret)


def slot_input(slot: WeekdaySlot) -> WeekdaySlotInput:
    return WeekdaySlotInput(weekday=WeekdaySlotInputWeekday(slot.weekday), minute=slot.minute)


def overlap(event: Event) -> list[WeekdaySlot]:
    """The longest run of consecutive slots in which every participant is available."""
    assert isinstance(event.schedule, WeekdaysSchedule)
    sets = [
        {(slot.weekday, slot.minute) for slot in participant.availability}
        for participant in event.participants
    ]
    best: list[WeekdaySlot] = []
    run: list[WeekdaySlot] = []

    for slot in event.schedule.slots:
        run = [*run, slot] if all((slot.weekday, slot.minute) in s for s in sets) else []
        if len(run) > len(best):
            best = run

    return best


def test_weekday_event_with_two_participants() -> None:
    client = Client(base_url=BASE_URL)

    created = create_event.sync(
        client=client,
        body=CreateEventRequest(
            name="Choir practice",
            reference_zone="Europe/Prague",
            schedule=WeekdaysScheduleInput(
                mode="weekdays",
                weekdays=[WeekdaysScheduleInputWeekdaysItem(1), WeekdaysScheduleInputWeekdaysItem(3)],
                daily_start="18:00",
                daily_end="20:00",
                slot_minutes=WeekdaysScheduleInputSlotMinutes(30),
            ),
        ),
    )
    assert isinstance(created, CreatedEvent)
    event_id = created.event.id
    assert isinstance(created.event.schedule, WeekdaysSchedule)
    slots = created.event.schedule.slots
    assert len(slots) == 8

    ada = join.sync(event_id, client=client, body=JoinRequest(name="Ada"))
    bob = join.sync(event_id, client=client, body=JoinRequest(name="Bob"))
    assert isinstance(ada, Joined)
    assert isinstance(bob, Joined)

    for joined, chosen in ((ada, slots[0:4]), (bob, slots[1:4])):
        saved = save_availability.sync(
            event_id,
            client=authenticated(joined.participant_token),
            body=AvailabilityRequest(availability=[slot_input(slot) for slot in chosen]),
        )
        assert not isinstance(saved, Problem)

    read = get_event.sync_detailed(event_id, client=client)
    windows = get_windows.sync(event_id, client=client)
    assert isinstance(read.parsed, Event)
    assert isinstance(windows, Windows)
    computed = overlap(read.parsed)

    assert [slot.to_dict() for slot in computed] == [slot.to_dict() for slot in slots[1:4]]
    assert [slot.to_dict() for slot in windows.windows[0].slots] == [
        slot.to_dict() for slot in computed
    ]
    assert sorted(windows.windows[0].participant_ids) == sorted(
        [ada.participant.id, bob.participant.id]
    )

    refused = delete_event.sync_detailed(event_id, client=authenticated(ada.participant_token))
    assert refused.status_code == HTTPStatus.FORBIDDEN
    assert isinstance(refused.parsed, Problem)
    assert refused.parsed.code == "wrong_secret_kind"

    etag = read.headers["ETag"]
    unchanged = get_event.sync_detailed(event_id, client=client, if_none_match=etag)
    assert unchanged.status_code == HTTPStatus.NOT_MODIFIED

    deleted = delete_event.sync_detailed(event_id, client=authenticated(created.admin_secret))
    assert deleted.status_code == HTTPStatus.NO_CONTENT
