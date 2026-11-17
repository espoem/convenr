# Phase 1 functional specification: create an event and respond

Status: agreed 2026-11-16. This document defines Phase F1 of the [roadmap](../roadmap.md). The technology choices are in [ADR 0001](../adr/0001-technology-stack.md), the time model in [ADR 0002](../adr/0002-time-representation.md), and identifiers and secrets in [ADR 0003](../adr/0003-identifiers-and-secrets.md).

The spec is written as domain rules. Each rule has an id so that a test can name the rule it proves.

## 1. Scope

In Phase 1 a person creates an event without an account, shares its link, and each participant marks when they are available. Everyone with the link sees where the group overlaps.

Phase 1 does not include:

- the organizer's manage page (edit, delete event, delete a response), which is Phase F2. Phase 1 already creates and shows the admin link;
- best-window ranking, a time-zone switcher and automatic refresh (F2);
- enforcing and running the retention period (F2). Phase 1 already stores and shows the deletion date;
- the public REST API and the SDKs (F3);
- picking a final slot, calendar export, an "if need be" level, poll mode and a dark theme (F4);
- accounts, email, calendars and groups (F5 and later).

## 2. Terms

| Term | Meaning |
|---|---|
| Event | One scheduling question: a name, a set of days, a daily time range and a slot length. |
| Organizer | The person who created the event. Holds the admin link. |
| Day mode | How the organizer chose the days: **date range**, **specific dates** or **weekdays**. |
| Dated event | An event in date-range or specific-dates mode. Its days are calendar dates. |
| Weekday event | An event in weekdays mode. Its days are days of the week with no dates. |
| Reference zone | The IANA time zone the organizer set for the event. |
| Slot | One cell of the grid: a start time and the event's slot length. |
| Participant | A named person inside one event. |
| Response | The set of slots one participant marked as available. |
| Participant token | A secret that proves a browser may edit one participant's response. |
| Admin link | The event URL plus a secret that gives organizer rights. |

## 3. Event rules

**E1. Fields.** An event has:

| Field | Rule |
|---|---|
| Name | Required. 1 to 100 characters after trimming. |
| Description | Optional. Plain text, at most 500 characters. Line breaks are kept. Links are not made clickable. |
| Day mode | Exactly one of date range, specific dates, weekdays. |
| Days | See E2. |
| Daily start and end | See E3. |
| Slot length | 15, 30 or 60 minutes. The form preselects 30. |
| Reference zone | An IANA zone. The form preselects the zone of the organizer's browser. |
| First day of week | Monday to Sunday. The form preselects the value for the page language (Monday for Czech). |

**E2. Days.**

- Date range: a first and a last date, both inclusive, covering 1 to 31 dates.
- Specific dates: 1 to 31 distinct dates. They need not be adjacent.
- Weekdays: 1 to 7 distinct days of the week.
- For a dated event, no date may lie before "today" in the reference zone at the moment of creation.

**E3. Daily time range.** Start and end are times of day in the reference zone. Start is at least 00:00, end is at most 24:00, and start is before end. Both are multiples of the slot length. A range that crosses midnight is not allowed.

**E4. Slots of a dated event.** For each date, walk the wall-clock times from the daily start to the daily end in steps of the slot length, in the reference zone. Each wall-clock time becomes one slot, identified by its UTC instant. On a day when the clock moves forward, wall-clock times that do not exist produce no slot. On a day when the clock moves back, a wall-clock time that occurs twice produces one slot, at its first occurrence.

**E5. Slots of a weekday event.** For each chosen day of the week, walk the times from the daily start to the daily end in steps of the slot length. Each slot is identified by the pair (day of week, minutes after midnight). It has no date and is never converted to another zone.

**E6. Creation result.** Creating an event produces an event id, an admin secret and a planned deletion date. The service shows the organizer two links once: the share link and the admin link. The page says that the admin link cannot be recovered and offers a copy button for each.

**E7. Planned deletion date.** A dated event's planned deletion date is 90 days after its last date. A weekday event's is 90 days after the last change to the event or to any response, so it moves forward with each change. The number of days is an instance setting with the default 90. The event page shows the date.

**E8. Immutability in Phase 1.** Nothing about an event can be changed in Phase 1. Editing arrives with the manage page in F2.

**E9. Unknown event.** Opening a link whose event id does not exist shows a "not found" page with a link to create an event. The response does not reveal whether the id ever existed.

**E10. Event address.** The address of an event is `/{lang}/e/{slug}-{id}`. The id alone selects the event. The slug only makes the address readable.

- The slug is derived from the event name: transliterated to ASCII, lower-cased, every run of other characters replaced by one hyphen, hyphens trimmed from both ends, cut to 60 characters. "Schůzka výboru 2027" becomes `schuzka-vyboru-2027`.
- The id is the text after the last hyphen. An id never contains a hyphen.
- If the name yields an empty slug, the address is `/{lang}/e/{id}`.
- An address with a missing or different slug and a valid id redirects to the address with the current slug. So a link keeps working after the event is renamed in F2.
- The slug puts the event name into the link, where browser history and link previews can show it. The create form says so next to the name field.

## 4. Participant rules

**P1. Display name.** A participant has a display name. The service trims it, collapses runs of whitespace to one space and normalizes it to Unicode NFC. The result is 1 to 40 characters long.

**P2. Uniqueness.** Two participants in one event cannot have names that are equal after P1 and after lower-casing. "Jana", "jana" and " JANA " are the same name.

**P3. Limit.** An event has at most 100 participants. A join that would create participant 101 is refused with a message that the event is full.

**P4. Joining.** A person enters a name on the event page.

| Name in this event | Password stored | What happens |
|---|---|---|
| Not used | Not applicable | The service creates the participant. The person may set a password in the same step. The browser gets a participant token. |
| Used | No | The browser gets a participant token for that participant. |
| Used | Yes | The service asks for the password. If it matches, the browser gets a participant token. |

**P5. Password.** A password is optional and belongs to one participant in one event. It is 4 to 128 characters long. The service stores only a hash.

**P6. Setting and changing a password.** A browser that holds the participant token can set a password when none is stored. Changing or removing a stored password requires the current password.

**P7. Failed attempts.** After 5 wrong passwords in a row for one participant, the service refuses further attempts for that participant for 15 minutes and says when to try again. A correct password resets the count. The count is kept per participant, not per visitor.

**P8. Token.** A participant token is valid until the participant or the event is deleted. One participant can have tokens in several browsers at once.

**P9. Leaving.** A browser that holds the participant token can delete the participant. This removes the response, the password hash and all tokens of that participant, and frees the name.

**P10. No rename.** A participant cannot be renamed in Phase 1. Leaving and joining again under another name has the same effect.

## 5. Response rules

**R1. Content.** A response is a set of the event's slots. A slot is either in the set (available) or not. A new participant starts with an empty set.

**R2. Saving.** The participant edits the grid and presses Save. Save replaces the stored set with the edited set in one step. Cancel discards the edits.

**R3. Concurrent saves.** If two browsers save for the same participant, the later save wins as a whole. Sets are not merged.

**R4. Validity.** A save that contains a slot the event does not have is refused as a whole.

**R5. Counting.** A participant with an empty response still counts as a participant.

## 6. Results rules

**V1. Who sees results.** Anyone who opens the share link sees the event's name, description, grid, participant names and each participant's availability. Joining is not required.

**V2. Heat map.** Each slot shows how many participants are available in it. The fill has five steps, chosen by the share of participants who are available: none, up to 25 %, up to 50 %, up to 75 %, and above 75 %. With no participants, every slot shows the "none" step.

**V3. Slot detail.** Selecting a slot shows its start and end time, the count as "3 of 5", and two name lists: available and not available.

**V4. Participant filter.** Selecting a participant's name shows only that participant's availability on the grid. Selecting it again returns to the heat map.

**V5. Freshness.** Results are current as of the page load, and are reloaded after the viewer's own save. Automatic refresh arrives in F2.

## 7. Time display rules

**T1. Dated events.** Slots are shown in the viewer's browser zone. Columns are the viewer's local dates that contain at least one slot. Rows are the viewer's local times of day at which at least one slot starts. A cell with no slot is blank and cannot be selected.

**T2. Zone notice.** The event page always states the reference zone. When the viewer's zone differs from it on a dated event, the page also states the zone the grid is shown in.

**T3. Weekday events.** Slots are shown as stored, in the reference zone, for every viewer. When the viewer's zone differs from the reference zone, a notice says that the times are in the reference zone and are not converted.

**T4. Column order.** A dated event's columns are in date order. A weekday event's columns start at the event's first day of week. The date picker on the create form also starts its weeks on that day.

**T5. Formats.** Dates and times are formatted for the page language: 24-hour time for Czech, the browser's convention for English.

## 8. Interaction rules

**I1. Two modes.** The grid is in view mode by default and shows the heat map. A participant with a token can switch to edit mode, which shows only their own selection.

**I2. Painting.** In edit mode, pressing a cell toggles it. Dragging from a cell applies that cell's new state to every cell in the rectangle between the start cell and the current cell.

**I3. Touch.** In edit mode on a touch screen, a one-finger drag that starts on a cell paints and does not scroll the page. A drag that starts on the time labels or the day headers scrolls. The time labels stay visible while the grid scrolls sideways, and the day headers stay visible while it scrolls down.

**I4. Keyboard.** Arrow keys move the focus between cells. Space toggles the focused cell. Shift with an arrow key extends a rectangle from the focused cell, and Space then applies the first cell's new state to the rectangle.

**I5. Cell size.** A cell is at least 44 CSS pixels wide and 24 CSS pixels high.

**I6. Unsaved edits.** Leaving edit mode or the page with unsaved edits asks for confirmation inside the page.

## 9. Browser storage rules

**B1. Content.** The browser's local storage keeps, per event: the event id, the event name, and either the admin secret, or the participant's name and token, or both.

**B2. Returning.** A browser that holds a participant token for an event opens that event already joined.

**B3. My events.** The start page lists the events in local storage, newest first, with the role in each (organizer, participant).

**B4. Missing storage.** If local storage is unavailable or empty, every page still works. The person joins again by name, and by password if one is set.

## 10. Language rules

**L1.** The interface is available in Czech and English. The language is part of the address (`/cs/…`, `/en/…`).

**L2.** A link without a language prefix redirects to the language the browser asks for, or to English if it asks for neither.

**L3.** Every page has a language switch that keeps the person on the same page.

**L4.** Event names, descriptions and participant names are shown as entered and are not translated.

## 11. Pages

| Page | Address | Content |
|---|---|---|
| Start | `/{lang}` | Create form (E1), list of my events (B3). |
| Created | `/{lang}/e/{slug}-{id}/created` | Share link and admin link (E6). Shown once, right after creation. |
| Event | `/{lang}/e/{slug}-{id}` | Event details, zone notices (T2, T3), planned deletion date (E7), grid, join form (P4), participant list. |
| Manage | `/{lang}/e/{slug}-{id}/manage` | In Phase 1: a notice that managing the event is coming, and confirmation that the admin link is valid. |
| Not found | any unknown address | Message and a link to the start page (E9). |

## 12. Errors

Every refusal names the field and the limit in the page language. Examples: "The name is already used in this event and has a password", "This event already has 100 participants", "The time range must end after it starts". A failed save keeps the person's edits on screen.

## 13. Acceptance test

Phase 1 is done when this end-to-end test passes on a clean clone in CI, in a 390 by 844 pixel viewport:

1. An organizer creates a dated event for five consecutive dates, 17:00 to 21:00, 30-minute slots, reference zone Europe/Prague. The test fixes the clock so that the dates fall in a week when Prague is 6 hours ahead of New York.
2. Ten participants open the share link in separate browser contexts with no stored state. Each joins with a distinct name. Three set a password.
3. Each participant paints a different availability pattern. The patterns are built so that exactly one 60-minute window, on the fourth date from 18:00 to 19:00, is common to all ten.
4. A fresh browser context opens the share link without joining. The two slots of that window show "10 of 10". No other slot does.
5. One participant with a password opens the link in a fresh context, joins with the right name and a wrong password, and is refused. With the right password, the participant sees the saved response.
6. A context whose zone is America/New_York shows the common window from 12:00 to 13:00 on the same date, and shows the zone notice of T2.

No step creates an account or enters an email address.

## 14. Rule coverage outside the acceptance test

Unit tests cover E2 to E5 (including both clock-change days in Europe/Prague), E10, P1, P2, P7, R3, R4, V2 and T1. A second end-to-end test covers a weekday event with T3 and T4.
