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
| `name_taken` | Another browser created the same name between the check and the write. Used only inside the service: the join is retried as a join of the existing participant. | P2, P4 |
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
