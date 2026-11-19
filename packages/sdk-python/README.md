# convenr

A Python client for the [convenr](https://convenr.party) API, generated with `openapi-python-client` from the API's OpenAPI document. The reference of every endpoint, problem code and field is at `/{locale}/api` on an instance.

```python
from convenr import AuthenticatedClient, Client
from convenr.api.events import create_event
from convenr.api.participants import join
from convenr.models import (
    CreateEventRequest,
    JoinRequest,
    WeekdaysScheduleInput,
    WeekdaysScheduleInputSlotMinutes,
    WeekdaysScheduleInputWeekdaysItem,
)

client = Client(base_url="https://convenr.party/api/v1")

created = create_event.sync(
    client=client,
    body=CreateEventRequest(
        name="Choir practice",
        reference_zone="Europe/Prague",
        schedule=WeekdaysScheduleInput(
            mode="weekdays",
            weekdays=[WeekdaysScheduleInputWeekdaysItem(1)],
            daily_start="18:00",
            daily_end="20:00",
            slot_minutes=WeekdaysScheduleInputSlotMinutes(30),
        ),
    ),
)

# The admin secret is returned only here. A call that needs a secret takes an AuthenticatedClient.
admin = AuthenticatedClient(base_url="https://convenr.party/api/v1", token=created.admin_secret)

joined = join.sync(created.event.id, client=client, body=JoinRequest(name="Ada"))
```

A response may gain fields and problem codes within version 1. Every model keeps the fields it does not know in `additional_properties`, and a `Problem` keeps its `code`, so handle a code you do not know as a general failure.

The code in `src/convenr` is written by `mise run sdk` from `apps/web/openapi.json`; do not edit it by hand. `uv run pytest` runs the unit tests; `mise run sdk:acceptance` runs `acceptance/` against a running instance.

This SDK is MIT licensed, while the convenr server is AGPL-3.0-only. `THIRD_PARTY_NOTICES.md` carries the notice of the generator whose templates the generated code includes.
