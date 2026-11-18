# Phase 2 functional specification: manage and life cycle

Status: agreed 2026-11-17. This document defines Phase F2 of the [roadmap](../roadmap.md). It builds on the [Phase 1 specification](phase-1.md): every Phase 1 rule still holds unless a rule here replaces it. The technology choices are in [ADR 0001](../adr/0001-technology-stack.md), the time model in [ADR 0002](../adr/0002-time-representation.md), and identifiers and secrets in [ADR 0003](../adr/0003-identifiers-and-secrets.md).

The spec is written as domain rules. Each rule has an id so that a test can name the rule it proves.

## 1. Scope

In Phase 2 the organizer manages the event behind the admin link, the results help the group pick a time, the page stays current without a reload, and events are deleted when their retention period ends. The server counts aggregate usage.

Phase 2 does not include:

- picking a final slot, calendar export, an "if need be" level, poll mode and a dark theme (F4);
- the public REST API and the SDKs (F3);
- pushing changes to open pages from the server (rule F6);
- a screen for the usage counts.

## 2. Terms

- **Organizer:** whoever holds the admin secret of an event.
- **Window:** a run of consecutive slots in one column of the grid.
- **Version:** the instant of the last change to an event, its participants or their responses.

## 3. Manage rules

These rules replace Phase 1 rule E8.

**M1. Access.** The manage page reads the admin secret from the URL fragment, or from local storage when the fragment is empty (B1). Every manage action sends the secret in the request body and is refused without a valid one. A refused secret shows a message and no event data.

**M2. Editable fields.** The organizer can change the name, the description, the days, the daily start and end, and the first day of the week. The limits of E1, E2 and E3 apply to the result.

**M3. Locked fields.** Slot length, day mode and reference zone can be changed only while the event has no participants. Once the first participant joins, even with an empty response (R5), the manage page shows them as locked and says why.

**M4. Extending.** Adding dates, weekdays or hours needs no confirmation. A date added to a dated event may not lie before today in the reference zone. Dates already in the event stay even when they are past.

**M5. Narrowing.** A change that removes slots removes them from every response. If at least one participant has a removed slot in their response, the page first asks for confirmation and states how many participants lose part of their availability, without names. A change that removes only slots nobody selected needs no confirmation.

**M6. Renaming.** A new name gives a new slug (E10). Links with the old slug keep working and redirect.

**M7. Deleting a participant.** The organizer can delete a participant after a confirmation that names them. This has the effect of P9: the response, the password hash and all tokens are removed, and the name is free again.

**M8. Deleting the event.** The organizer can delete the event after a confirmation that names it. The event, its participants and their responses are deleted at once and for good. Both links then show the not-found page (E9), and the organizer's browser removes the event from its list (B3).

**M9. Concurrent changes.** A participant's save that contains a slot the organizer has just removed is refused as a whole (R4). The page then loads the current event, keeps the unsaved edits that are still valid slots, says that the event has changed, and lets the person save again.

## 4. Results rules

These rules replace Phase 1 rule V5.

**W1. Best windows.** Below the grid the page lists the best windows. A window's people are the participants available in every one of its slots. Only maximal windows are listed: a listed window cannot be extended at either end without losing one of its people. A window never crosses from one column to the next.

**W2. Filters.** Two filters limit the list: a minimum duration and a minimum number of people. The minimum duration starts at one slot. The minimum number of people starts at the highest count in any slot.

**W3. Order.** The list shows at most 5 windows, by the number of people (most first), then the duration (longest first), then the start (earliest first). Each entry shows the day, the start and end time, the count as "4 of 5" and the names.

**W4. Highlight.** Selecting a listed window outlines its slots in the grid.

**W5. No result.** With no participants, or when no window passes the filters, the list says so and suggests lowering the filters.

**Z1. Zone switch.** On a dated event, when the viewer's zone differs from the reference zone, a switch shows the grid in the reference zone instead. The grid then follows T1 with the reference zone in place of the viewer's zone, and the zone notice (T2) names the zone shown. The choice is not stored; each visit starts in the viewer's zone.

## 5. Freshness rules

**F1. Version check.** While the event page is visible, it asks the server for the event's version every 15 seconds. It also asks at once when the page becomes visible again. A hidden page does not ask.

**F2. Reload.** When the version differs from the one the page shows, the page loads the event, the participants and their responses again. The group view, the best windows and the participant list update in place.

**F3. Unsaved edits.** A reload never replaces a participant's unsaved edits in edit mode. Edits of slots the event no longer has are dropped, and the page says so. Saving still replaces the stored set as a whole (R3).

**F4. Gone.** When the event has been deleted, the page shows the not-found content (E9). When the viewer's own participant has been deleted, the browser drops the token, the page shows the join form again and says why.

**F5. Version value.** Creating or changing the event, joining under a new name, saving a set of slots that differs from the stored one, setting, changing or removing a password, leaving and deleting a participant each move the version forward. A password change moves it whenever it succeeds, even to the same password, because it replaces the participant's stored password. The version is the instant of the last change, but always at least one microsecond after the version before it, so two changes in the same instant, or a change that waited for another, still get different versions. A request that changes nothing writes nothing and keeps the version and the deletion date: an event change after which every value is the same, a save of the same set of slots in any order, joining under a name already used, which only issues a token, and every refused request, including a counted wrong password.

**F6. Later.** Pushing changes from the server, for example Server-Sent Events over PostgreSQL `LISTEN/NOTIFY`, is the live-update item of roadmap phase F4. It waits until real traffic shows that version checks cost too much.

## 6. Retention rules

These rules replace the last sentence of Phase 1 rule E7: the number of days is the instance setting of X1.

**X1. Setting.** The instance setting `RETENTION_DAYS` holds the retention period in days, with the default 90. The value `never` keeps events permanently.

**X2. Deletion date.** The deletion date follows E7 and is computed from the current setting whenever it is needed. A change of the setting therefore applies to every event at once. With `never`, the event page says that the event is kept and shows no date.

**X3. Expiry.** An event expires at the end of its deletion date in the reference zone. From then on, every page, action and version check treats it as unknown (E9), even before it is deleted from the database.

**X4. Purge.** Expired events are deleted from the database with their participants and responses. The server runs the purge every hour. The same purge is available as a command, so an operator can schedule it from outside. Running it twice in a row has the same result as running it once.

## 7. Usage rules

**U1. Content.** The server keeps daily counts. They hold no names, event contents or identifiers, and they remain after the events they were counted from are deleted. A day is a calendar day in UTC.

**U2. Events created.** Each creation adds one to the day's count.

**U3. Activation.** When an event is 7 days old, or when it is deleted before that, the day's count of evaluated events grows by one, and the count of activated events grows by one if the event has at least 2 participants.

**U4. Group size.** When an event is 30 days old, or when it is deleted before that, its number of participants (0 to 100) is added to the day's histogram. The count goes to the day the event reached the age; the number of participants is the one at the hourly pass that counts it, so a participant who joins less than an hour after the age may be included.

**U5. Time to first response.** When the first participant of an event joins (M3), the time since creation is added to the day's histogram in one of these buckets: under 1 hour, under 6 hours, under 1 day, under 3 days, under 7 days, 7 days or more.

**U6. Once per event.** Each event adds to U3, U4 and U5 at most once.

**U7. Output.** A command prints, per day, the events created, the activation rate, the median group size and the bucket that holds the median time to first response. It covers the last 30 days unless given a range.

## 8. Pages

| Page | Address | Content |
|---|---|---|
| Event | `/{locale}/e/{slug}-{id}` | As in Phase 1, plus the zone switch (Z1), the best windows (W1 to W5) and the version check (F1 to F4). |
| Manage | `/{locale}/e/{slug}-{id}/manage` | The event's fields with the locks (M2, M3), the participant list with delete buttons (M7), and deleting the event (M8). |

## 9. Errors

Phase 1 section 12 applies. A refused manage action names the field and the limit. Each refusal has a stable code; [problem-codes.md](problem-codes.md) links the codes to the rules. A narrowing confirmation (M5) and every deletion (M7, M8) happen inside the page.

## 10. Acceptance test

Phase 2 is done when this end-to-end test passes on a clean clone in CI:

1. An organizer creates two dated events, A and B. Two participants join A and save responses.
2. Through the manage page of A, the organizer narrows the daily range. The confirmation states that 2 participants lose part of their availability. After confirming, the event page shows the new range.
3. The organizer deletes one participant of A, then deletes A. The share link and the admin link of A show the not-found page, and the database holds no row of A, its participants or their responses.
4. The test lets B expire by moving B's dates back in the database, so that its deletion date has passed. The share link of B shows the not-found page at once. After the purge command runs, the database holds no row of B.

## 11. Rule coverage outside the acceptance test

The tests name no rule numbers. This list is the only link from rules to tests.

- `apps/web/src/domain/event-edit.test.ts` covers M3 to M5.
- `apps/web/src/domain/best-windows.test.ts` covers W1 to W3.
- `apps/web/src/domain/retention.test.ts` covers X2 and X3, and `apps/web/src/env.test.ts` covers X1.
- `apps/web/src/domain/usage.test.ts` covers U5 and U7.
- `apps/web/src/server/manage.db.test.ts` covers M1, M3, M5 to M9 against the database.
- `apps/web/src/server/retention.db.test.ts` covers X3 and X4.
- `apps/web/src/server/version.db.test.ts` covers F5.
- `apps/web/src/server/usage.db.test.ts` covers U2 to U6.
- `apps/web/e2e/freshness.spec.ts` covers F1 to F4: a second browser's save appears within one check interval without a reload, and the first browser's unsaved edits stay.
- `apps/web/e2e/results.spec.ts` covers W4 and Z1.
- `apps/web/e2e/manage-and-expire.spec.ts` is the acceptance test of section 10.
