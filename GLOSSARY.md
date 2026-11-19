# convenr

convenr helps a group find a time that works for most of its members. These are the words the product, the specifications and the code use for its concepts.

## Events

**Event**:
One scheduling question: a name, a set of days, a daily time range and a slot length.
_Avoid_: Poll, meeting, survey

**Organizer**:
The person who created an event and holds its admin link.
_Avoid_: Owner, creator, host

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
The date after which an event and everything in it is deleted.
_Avoid_: Expiry, TTL

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
