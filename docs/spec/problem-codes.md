# Problem codes

The service names every refusal with a stable snake_case code. The code says what went wrong and does not change when the specification is renumbered. The code is also the key of the visitor message in `apps/web/messages/*.json`. This table is the only place that links a code to the rules of [phase 1](phase-1.md) and [phase 2](phase-2.md).

## Event schedule

Returned in a `problems` list when a new or edited event is refused. A problem on a form field that fails parsing is named by its field path (for example `name` or `days`) instead of a code.

| Code | Meaning | Rules |
|---|---|---|
| `no_days` | The event has no day: an empty list of dates or weekdays. | E2 |
| `range_reversed` | The last day of a date range is before the first. | E2 |
| `too_many_dates` | A date range or list covers more than 31 dates. | E2 |
| `duplicate_day` | A date or weekday is chosen more than once. | E2 |
| `date_in_past` | A new date lies before today in the reference zone. | E2, M4 |
| `out_of_day` | The daily start or end lies outside 00:00 to 24:00. | E3 |
| `end_not_after_start` | The daily end is not after the daily start. | E3 |
| `not_on_slot_boundary` | The daily start or end is not a multiple of the slot length. | E3 |
| `field_locked` | Slot length, day mode or reference zone changed on an event that has participants. | M3 |

## Participants and responses

Returned as `problem` in a failed result.

| Code | Meaning | Rules |
|---|---|---|
| `invalid_name` | The display name is empty after trimming, longer than 40 characters or has a control character. | P1 |
| `name_taken` | Another browser created the same name, or the participant under it left, between the check and the write. Used only inside the service: the join is retried with the name as it now stands. | P2, P4 |
| `event_full` | The event already has 100 participants. | P3 |
| `password_required` | The name belongs to a participant with a password and none was given. | P4 |
| `wrong_password` | The password does not match. | P4, P7 |
| `too_many_attempts` | Too many wrong passwords in a row; the result also says when to try again. | P7 |
| `invalid_password` | A password is shorter than 4 or longer than 128 characters. | P5 |
| `no_password` | A password change or removal was asked for a participant who has none. | P6 |
| `not_joined` | The browser's participant token is unknown, so the participant left or was deleted. | P8, P9 |
| `not_found` | The event no longer exists. | E9, X3 |
| `unknown_slot` | A saved response holds a slot the event does not have. | R4 |

The display name parser also reports `empty`, `too_long` and `control_character` for its own result; the join maps all three to `invalid_name`.

## API

Codes that only the API returns, from [phase 3](phase-3.md).

| Code | Meaning | Rules |
|---|---|---|
| `invalid_request` | The body is not JSON or does not match the schema. `errors` points at the fields. | A4, A8 |
| `unsupported_media_type` | The body is not `application/json`. | A4 |
| `payload_too_large` | The body is larger than 64 KB. | A4 |
| `unauthorized` | The secret is missing or wrong, or the event does not exist. | K3, A12 |
| `wrong_secret_kind` | An admin secret was sent where a participant token is needed, or the other way round. | K2 |
| `secret_in_query` | The query string holds a secret. | K4 |

## HTTP status

The API sends every code with one status.

| Status | Codes |
|---|---|
| `400 Bad Request` | `invalid_request`, `secret_in_query` |
| `401 Unauthorized` | `unauthorized`, `not_joined` |
| `403 Forbidden` | `wrong_secret_kind`, `password_required`, `wrong_password` |
| `404 Not Found` | `not_found` |
| `409 Conflict` | `event_full`, `field_locked`, `no_password` |
| `413 Content Too Large` | `payload_too_large` |
| `415 Unsupported Media Type` | `unsupported_media_type` |
| `422 Unprocessable Content` | the event schedule codes except `field_locked`, `invalid_name`, `invalid_password`, `unknown_slot` |
| `429 Too Many Requests` | `too_many_attempts`, with `Retry-After` and `retryAt` |

`name_taken` never leaves the server.
