# Problem codes

The service names every refusal with a stable snake_case code. The code says what went wrong and does not change when the specification is renumbered. The code is also the key of the visitor message in `apps/web/messages/*.json`. This table is the only place that links a code to the rules of [phase 1](phase-1.md), [phase 2](phase-2.md), [phase 4](phase-4.md) and [phase 5](phase-5.md).

## Event schedule

Returned in a `problems` list when a new or edited event is refused. A problem on a form field that fails parsing is named by its field path (for example `name` or `days`) instead of a code.

| Code | Meaning | Rules |
|---|---|---|
| `no_days` | The event has no day: an empty list of dates or weekdays. | E2 |
| `range_reversed` | The last day of a date range is before the first. | E2 |
| `too_many_dates` | A date range or list covers more than 31 dates. | E2 |
| `duplicate_day` | A date or weekday is chosen more than once. | E2 |
| `date_in_past` | A new date lies before today in the reference zone, or a new option starts before now. | E2, M4, O2 |
| `out_of_day` | The daily start or end lies outside 00:00 to 24:00. | E3 |
| `end_not_after_start` | The daily end is not after the daily start. | E3 |
| `not_on_slot_boundary` | The daily start or end is not a multiple of the slot length. | E3 |
| `field_locked` | The kind of event, slot length, day mode or reference zone changed on an event that has participants. | M3, O1 |
| `too_few_options` | A poll has fewer than 2 options. | O2 |
| `too_many_options` | A poll has more than 20 options. | O2 |
| `option_end_not_after_start` | An option's end is not after its start. | O2 |
| `option_not_one_day` | An option ends on another date than it starts in the reference zone; an end at the midnight closing its date counts as the same date. | O2 |
| `duplicate_option` | Two options have the same start and end. | O2 |
| `unknown_option` | A change keeps an option by an `id` the event does not have. | A21 |

## Final time

Returned as `problem` when the organizer's pick of the final time is refused. A weekday date before today reuses `date_in_past`.

| Code | Meaning | Rules |
|---|---|---|
| `final_not_in_event` | The slots are not one run of the event's slots in one day, or a dated event was sent a date, or a weekday event none. | N1, A22 |
| `final_date_wrong_weekday` | A weekday event's date does not fall on the weekday of the slots. | N3, A22 |
| `not_finalized` | The calendar file of an event without a final time was asked for. | C4, A23 |

## Participants and responses

Returned as `problem` in a failed result.

| Code | Meaning | Rules |
|---|---|---|
| `invalid_name` | The display name is empty after trimming, longer than 40 characters or has a control character. | P1 |
| `name_taken` | Another browser created the same name, or the participant under it left, between the check and the write. Used only inside the service: the join is retried with the name as it now stands. | P2, P4 |
| `event_full` | The event already has 100 participants. | P3 |
| `password_required` | The name belongs to a participant with a password and none was given. | P4 |
| `wrong_password` | The password does not match. | P4, P7 |
| `too_many_attempts` | Too many wrong passwords; the result also says when to try again. | P7 |
| `invalid_password` | A password is shorter than 4 or longer than 128 characters. | P5 |
| `no_password` | A password change or removal was asked for a participant who has none, or a current password was given for one. | P6 |
| `name_exists` | A new password was given for a name another participant already uses. Only the API sends a new password apart from a current one. | P2, P4 |
| `name_unknown` | A current password was given for a name nobody in the event uses. Only the API sends a current password apart from a new one. | P4 |
| `name_in_account` | The name belongs to a participant linked to an account, and the join does not come from that account. Refused before any password is tried. | AU8 |
| `not_joined` | The browser's participant token is unknown, so the participant left or was deleted. | P8, P9 |
| `not_found` | The event no longer exists. | E9, X3 |
| `unknown_slot` | A saved response holds a slot the event does not have. | R4 |
| `if_need_be_not_available` | A saved response marks a slot as if need be that its availability leaves out. The API sends it as the code of a field error of `invalid_request`, at the slot's pointer in `ifNeedBe`. | L7, A19 |

The display name parser also reports `empty`, `too_long` and `control_character` for its own result; the join maps all three to `invalid_name`.

## Accounts

Shown on the web pages only; the API has no account endpoints.

| Code | Meaning | Rules |
|---|---|---|
| `sign_in_link_invalid` | A sign-in link is unknown, used or older than 15 minutes. | AU3 |
| `confirmation_link_invalid` | A link that confirms an address change or an account deletion is unknown, used or expired. | AU5, AU10 |
| `too_many_emails` | Sending would pass the limit per address or per instance. | AU6 |
| `email_not_sent` | The mail server refused or did not answer while the visitor waited. | NT3 |
| `passkey_not_recognized` | The browser offered a passkey that belongs to no account, or its check failed. | AU4 |
| `event_has_owner` | An event added to an account already belongs to another one. | OW2 |
| `wrong_admin_secret` | The admin secret sent to add an event does not match it, or the event is gone. | OW1 |
| `account_already_joined` | The browser's participant is added to an account that already has another participant in the event. | OW1 |
| `signed_out` | An account action arrives after the session ended. | AU7 |
| `sign_in_again` | An action that needs a session under a day old came from an older one. | AU10, AU14, AU15 |
| `provider_failed` | A sign-in through a provider was stopped, or the provider's answer could not be used. | AU13 |
| `provider_in_other_account` | The provider identity added to an account already belongs to another one. | AU14 |
| `address_not_proved` | An account was about to be created for an address nobody proved. Used only inside the service: the visitor is asked to confirm the address. | AU12, AU13 |

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
| `confirmation_required` | A change would remove availability from participants or clear the final time; `losing` says from how many participants, `clearsFinal` whether the final time goes, and the `ETag` header is the event's version. The client repeats the change with that `ETag` as `confirmedVersion`; a missing or stale `confirmedVersion` gets this refusal again, and `If-Match` never replaces it. | M5, N5, A14, A24 |
| `event_changed` | The `If-Match` of a change names no current version of the event, because someone changed it since the client read it. The `ETag` header is the current version. | A10 |
| `method_not_allowed` | The path exists but does not support the method. `Allow` lists the methods it does support. | A3 |
| `internal_error` | The server failed while answering. The request may or may not have taken effect. | A8 |

`name_exists` and `name_unknown` are 409, not 422: the same body succeeds or fails depending on who has joined, so the request conflicts with the event's current state rather than being malformed. The client resolves it by sending the other password field.

A field at fault in the body is named by its JSON Pointer, as in `{ "pointer": "/schedule/dates/2", "code": "date_in_past" }`, and a query parameter by its name, as in `{ "parameter": "minPeople", "code": "too_small" }`. The API answers a participant token it does not know, `not_joined` on the web, with `unauthorized`, because a token that never existed and one whose participant left look the same (A15).

### Field codes

A field error carries either a rule code from the tables above, such as `date_in_past`, `unknown_slot` or `invalid_name`, or, when the value has the wrong form, one of these field codes. The set is closed: the API maps every check of its schemas to it in one place, so a change of the validation library does not change a code.

| Code | Meaning |
|---|---|
| `required` | A required field or parameter is missing. |
| `wrong_type` | The value has the wrong JSON type, such as a string where a number belongs. |
| `too_short` | A string or list has fewer characters or items than allowed. |
| `too_long` | A string or list has more characters or items than allowed. |
| `too_small` | A number is below the minimum. |
| `too_large` | A number is above the maximum. |
| `invalid_format` | A string does not have the required format, such as `YYYY-MM-DD` or `HH:MM`. |
| `not_allowed` | The field is not part of the request (A4), or may not be sent together with another field. |
| `invalid_value` | Any other value of the wrong form, such as a slot length that is not 15, 30 or 60. |

`unknown_time_zone` names a reference zone that is not an IANA zone. It is a rule code of the server's own check of the zone, not a field code.

A value of the wrong form in an event therefore carries one of the nine field codes above or `unknown_time_zone`, and nothing else. The server types these ten codes as one closed list, so a check named by any other code does not compile, and a test fails when this page leaves one of them out.

## HTTP status

The API sends every code with one status.

| Status | Codes |
|---|---|
| `400 Bad Request` | `invalid_request`, `secret_in_query` |
| `401 Unauthorized` | `unauthorized` |
| `403 Forbidden` | `wrong_secret_kind`, `password_required`, `wrong_password` |
| `404 Not Found` | `not_found`, `not_finalized` |
| `405 Method Not Allowed` | `method_not_allowed`, with `Allow` |
| `409 Conflict` | `event_full`, `field_locked`, `no_password`, `name_exists`, `name_unknown`, `name_in_account`, `confirmation_required`, with `ETag` |
| `412 Precondition Failed` | `event_changed`, with `ETag` |
| `413 Content Too Large` | `payload_too_large` |
| `415 Unsupported Media Type` | `unsupported_media_type` |
| `422 Unprocessable Content` | the event schedule codes except `field_locked`, the final time codes, `invalid_name`, `invalid_password`, `unknown_slot` |
| `429 Too Many Requests` | `too_many_attempts`, with `Retry-After` and `retryAt` |
| `500 Internal Server Error` | `internal_error` |

`name_taken` never leaves the server.
