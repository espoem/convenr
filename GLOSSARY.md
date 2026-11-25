# convenr

convenr helps a group find a time that works for most of its members. These are the words the product, the specifications and the code use for its concepts.

## Events

**Event**:
One scheduling question: a name, a set of days, a daily time range and a slot length.
_Avoid_: Poll, meeting, survey

**Organizer**:
Anyone managing an event via its admin link or as its owning account.
_Avoid_: Creator, host

**Event kind**:
Whether an event is a grid of slots (`grid`) or a list of hand-picked poll options (`poll`).
_Avoid_: Event type (which also conflicts with Day mode)

**Poll option**:
One dated time interval (start and end instant) offered in a poll event.
_Avoid_: Poll slot

**Day mode**:
How the organizer chose an event's days: date range, specific dates or weekdays.
_Avoid_: Event type

**Dated event**:
An event in date-range or specific-dates mode, whose days are calendar dates.

**Weekday event**:
An event in weekdays mode, whose days are days of the week with no dates.
_Avoid_: Recurring event (a separate, later concept)

**Reference zone**:
The IANA time zone the organizer set for an event. A weekday event's times are always in it.
_Avoid_: Event time zone, home zone

**First day of week**:
The day an event's weekday columns and its date picker start on. It changes no slot.

**Slot**:
One cell of an event's grid: a start time and the event's slot length.
_Avoid_: Time block, interval

**Slot key**:
The stored identity of a slot: a UTC instant for a dated event, a day of week and minute of day for a weekday event.

**Planned deletion date**:
The date after which an event and everything in it is deleted unless kept.
_Avoid_: Expiry, TTL

**Keeping**:
Turning off age-based deletion for an owned event until the owner turns it back off or releases the event.

## People

**Participant**:
A named person inside one event.
_Avoid_: User, member, attendee, respondent

**Display name**:
The name a participant chose, unique within its event after normalization.
_Avoid_: Username, nickname

**Response**:
The level of each slot one participant marked.
_Avoid_: Vote, answer, availability

**Level**:
How a participant answers a slot: available or if need be. A slot with no level is not available.
_Avoid_: Preference, weight, maybe

**Score**:
What a slot or a window is worth to the group: 1 for each available participant and ½ for each at if need be. The heat map and the order of the best windows follow it.

**Heads**:
The participants with a level in a slot or a window, at either level. Maximality of a window and its people filter count heads.

## Access

**Event id**:
The random, non-secret identifier that selects an event in its address.

**Slug**:
A readable ASCII form of the event name placed in the address before the event id. It selects and authorizes nothing.

**Share link**:
The event's address, which anyone may open to read the event and join it.
_Avoid_: Public link, invite link

**Admin link**:
The event's address plus the admin secret, which gives organizer rights.
_Avoid_: Edit link, owner link

**Participant id**:
The random, non-secret identifier of a participant that clients see. It has the form of an event id; the database key never leaves the server.

**Admin secret**:
The random secret in the admin link's fragment. It starts with `cva_`.

**Participant token**:
A random secret that lets one browser edit one participant's response. It starts with `cvp_`.
_Avoid_: Session, cookie, edit token

**Participant password**:
An optional password that protects one participant's display name in one event.

## Results

**Heat map**:
The grid view that fills each slot by the share of participants available in it.

**Heat step**:
One of the five fill levels of the heat map: none, up to 25 %, up to 50 %, up to 75 %, above 75 %.

**Final time**:
The window the organizer picked as when the event takes place, as one dated occurrence with a start and an end. A weekday event's final time is one date on the window's weekday.
_Avoid_: Final slot, decision, chosen date

**Best window**:
A maximal contiguous run of slots on one day where a common set of participants has a level.

## Accounts

**Owner**:
The single account an event is claimed into or created by while signed in; anonymous events have none.
_Avoid_: Calling an anonymous admin-link holder an owner (keep internal F5 `owner` symbols and `event_has_owner` problem codes as named).

**Account**:
A proved email address with its passkeys, providers, sessions, email language, and notification settings.

**Provider**:
A service, such as Google or GitHub, whose sign-in tells convenr who the person is.
_Avoid_: Social login, identity provider

**Proved address**:
An email address whose holder followed a sign-in link, or which a provider that is authoritative for it names.

**Linked participant**:
A participant bound to an account instead of a browser token.

**Browser key**:
The random secret in one HttpOnly cookie from which browser tokens are derived.

**Browser token**:
A participant token derived from the browser key and an event id.

**Outbox**:
Stored emails waiting to be sent and retried.
