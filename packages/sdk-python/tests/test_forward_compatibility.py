"""A client written for this version keeps what a later version of the API adds."""

import json

import httpx2

from convenr import Client
from convenr.api.events import get_event
from convenr.models import Event, Problem

EVENT_ID = "abcdefghijkm"

EVENT = {
    "id": EVENT_ID,
    "name": "Retro",
    "description": "",
    "referenceZone": "Europe/Prague",
    "firstDayOfWeek": 1,
    "schedule": {
        "mode": "weekdays",
        "weekdays": [1],
        "dailyStart": "18:00",
        "dailyEnd": "18:30",
        "slotMinutes": 30,
        "slots": [{"weekday": 1, "minute": 1080, "addedLater": 1}],
        "addedLater": "schedule",
    },
    "retention": {"kind": "kept"},
    "final": {"kind": "open"},
    "participants": [],
    "addedLater": {"nested": True},
}


def serving(status: int, body: object, content_type: str) -> Client:
    def answer(request: httpx2.Request) -> httpx2.Response:
        return httpx2.Response(
            status, content=json.dumps(body), headers={"Content-Type": content_type}
        )

    return Client(
        base_url="https://convenr.test/api/v1",
        httpx_args={"transport": httpx2.MockTransport(answer)},
    )


def test_keeps_the_fields_a_later_version_adds() -> None:
    client = serving(200, EVENT, "application/json")

    event = get_event.sync(EVENT_ID, client=client)

    assert isinstance(event, Event)
    assert event.additional_properties == {"addedLater": {"nested": True}}
    assert event.schedule.additional_properties == {"addedLater": "schedule"}
    assert event.to_dict() == EVENT


def test_keeps_a_response_enum_value_it_does_not_know() -> None:
    later = {
        **EVENT,
        "firstDayOfWeek": 8,
        "schedule": {**EVENT["schedule"], "slotMinutes": 45, "weekdays": [1, 8]},
    }
    client = serving(200, later, "application/json")

    event = get_event.sync(EVENT_ID, client=client)

    assert isinstance(event, Event)
    assert event.first_day_of_week == 8
    assert event.schedule.slot_minutes == 45
    assert event.schedule.weekdays == [1, 8]
    assert event.to_dict() == later


def test_keeps_a_problem_code_it_does_not_know() -> None:
    problem = {
        "type": "https://convenr.party/problems/added_later",
        "status": 404,
        "title": "Added later",
        "code": "added_later",
    }
    client = serving(404, problem, "application/problem+json")

    refused = get_event.sync(EVENT_ID, client=client)

    assert isinstance(refused, Problem)
    assert refused.code == "added_later"
    assert refused.to_dict() == problem
