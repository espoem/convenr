# Phase 4 functional specification: finalize and polish

Status: agreed 2026-11-19. This document defines Phase F4 of the [roadmap](../roadmap.md). It builds on the [Phase 1](phase-1.md), [Phase 2](phase-2.md) and [Phase 3](phase-3.md) specifications: every earlier rule still holds unless a rule here replaces it. The time model is in [ADR 0002](../adr/0002-time-representation.md), identifiers and secrets in [ADR 0003](../adr/0003-identifiers-and-secrets.md), API credentials in [ADR 0004](../adr/0004-api-credentials.md), the deployment in [ADR 0005](../adr/0005-vercel-deployment.md), and live updates in [ADR 0006](../adr/0006-live-updates.md). Problem codes are listed in [problem-codes.md](problem-codes.md).

The spec is written as domain rules. Each rule has an id so that the spec can map it to code and tests; code and tests do not cite the ids.

## 1. Scope

In Phase 4 a participant can mark a slot as "if need be", an organizer can run a poll on a few hand-picked times instead of a grid, and the organizer picks the final time, which participants add to their calendars. The application gets a dark theme, a reviewed palette and menus for the theme and the language. Open pages update within seconds of a change. The README gains guides for people who run convenr or build on it.

Phase 4 does not include:

- a final time that repeats every week; a weekday event is finalized as one dated occurrence (N3), and a choice between one occurrence and a repeating one waits for roadmap phase F7;
- a calendar subscription (`webcal:`) or any other way to add the final time without downloading a file or following a link; an analysis of direct calendar integration is a separate task;
- notifying participants of a final time; notifications wait for accounts (F5);
- free-text poll options, such as a place.

## 2. Terms

- **Level:** how a participant answers a slot or a poll option: available, if need be, or not (no answer).
- **Heads:** the number of participants who answer available or if need be.
- **Score:** each participant who answers available counts 1, each who answers if need be counts ½.
- **Grid event, poll event:** an event whose schedule is a grid of slots (Phase 1 rules E2 to E5), or a list of options (O1).
- **Final time:** the window or poll option the organizer picked.

## 3. Level rules

These rules replace Phase 1 rule R1 and extend V2, V3, I2 and I4, and Phase 2 rules W1 to W3.

**L1. Content.** A response holds, for each slot of the event, one level: available, if need be, or none. A slot with no level is not available. A new participant starts with no levels.

**L2. Painting.** In edit mode a brush above the grid chooses what painting writes: available (the default), if need be, or clear. Pressing a cell gives it the brush's level, or clears it when it already has that level. Dragging and Shift with arrow keys apply the start cell's new state to the rectangle (I2, I4). The brush is a set of three buttons with one pressed; it is reachable from the keyboard and needs no hover.

**L3. Marking.** A cell at if need be shows the hatching of `DESIGN.md` on a lighter tone of the available color, so the level never depends on color alone. The legend names both levels.

**L4. Heat map.** The heat map step of a slot (V2) is chosen by its score divided by the number of participants, with the same five steps.

**L5. Slot detail.** The slot detail (V3) shows the count as "4 of 6, 1 of them if need be" and three name lists: available, if need be, not available.

**L6. Windows.** A window's people (W1) are the participants with a level in every one of its slots. A person is available in the window when every slot is available, and if need be otherwise. Maximality (W1) and the minimum number of people (W2) count heads. The list (W3) is ordered by score (highest first), then heads, then duration, then start. Each entry shows the count as in L5 and marks the names at if need be.

**L7. Saved shape.** Saving replaces every level of the response at once (R2, R3). A save that gives a slot two levels, or a level to a slot the event does not have, is refused as a whole (R4).

## 4. Poll rules

**O1. Kind.** An organizer creates either a grid event or a poll event. The kind is chosen on the create page and can change only while the event has no participants (M3). A poll event has a name, a description, a reference zone and its options; it has no days, daily range, slot length or first day of the week.

**O2. Options.** A poll event has 2 to 20 options. Each option is a start and an end on one date in the reference zone, at whole minutes, with the end after the start. No two options have the same start and end. No option starts before now when it is added.

**O3. Answers.** A participant answers each option with a level (L1). The poll is shown as a table with one row per option and buttons for the three levels; on a phone each option is a card. Every option shows its date and times in the viewer's zone, and the zone notice (T2) and zone switch (Z1) apply as on a dated event.

**O4. Results.** Each option shows its heads and the names by level. The score orders the best options and chooses the heat step, but the page shows no score value. The best options are listed as in L6, without the duration and the filters of W2.

**O5. Editing options.** The organizer can add options at any time within the limit of O2. An option cannot be changed: a new time is a new option. Removing an option that at least one participant answered needs the confirmation of M5, which states how many participants lose an answer. Removing the final option also clears the final time (N5).

**O6. Retention.** A poll event's planned deletion date follows E7 with the date of its last option in place of the last date.

## 5. Final time rules

**N1. Picking.** On the manage page the organizer picks the final time: a listed best window, a window selected in the grid (a run of slots in one column), or a poll option. A grid event's final time is a window of its slots; a poll event's is one of its options.

**N2. Showing.** Once picked, the event page shows the final time above everything else, in the viewer's zone with the zone named, followed by the calendar actions of C1. Responses stay open. The grid or poll outlines the final time.

**N3. Weekday events.** A weekday event has no dates, so the organizer picks the window and also a date that falls on the window's weekday and is not before today in the reference zone. The final time is that one dated occurrence. The window and the date together become a start and an end in UTC as in E4.

**N4. Changing.** The organizer can pick another final time or clear it. Picking, changing and clearing each move the version (F5).

**N5. Narrowing.** A change that removes a slot of the final window, or the final option, clears the final time. The confirmation of M5 also says that the final time will be cleared; it is asked even when no participant loses availability.

**N6. Retention.** A weekday event whose final time lies after its planned deletion date (E7) is kept until the end of the final date plus the retention period (X1).

## 6. Calendar rules

**C1. Actions.** With a final time, the event page offers a download of an `.ics` file and links to add the event in Google Calendar and Outlook.com. The links open the provider's page with the name, the times, the description and the share link filled in; nothing is sent to the provider until the visitor follows a link.

**C2. File content.** The file holds one `VEVENT`. `SUMMARY` is the event name, `DESCRIPTION` is the description followed by the share link, `URL` is the share link, and `DTSTART` and `DTEND` are the final time in UTC. It never holds the admin link or a participant's name.

**C3. Updates.** `UID` is derived from the event id, so it is the same for every download of the event. `SEQUENCE` counts how many times the final time was picked or changed. A calendar that imports a later file therefore replaces the earlier entry.

**C4. No final time.** Without a final time the page offers no calendar actions, and the file address answers not found.

## 7. Usage rules

These rules extend Phase 2 rules U1 to U7.

**U8. Finalization.** When the U4 count of an event is taken, the day's count of finalized events grows by one if the event has a final time at that moment.

**U9. Time to finalize.** The first time an event gets a final time, the time since creation is added to the day's histogram in the buckets of U5. Changing or clearing the final time later adds nothing.

**U10. Output.** The command of U7 also prints the finalization rate and the bucket that holds the median time to finalize.

## 8. Appearance rules

**Q1. Theme.** The application has a light and a dark theme, both defined by tokens in `DESIGN.md`. Every contrast stated there is measured by a script for both themes.

**Q2. Choice.** A menu in the header offers System, Light and Dark. System is the default and follows the device setting through CSS alone. A manual choice is kept in a first-party cookie that holds only the choice, so the server renders the chosen theme and the page does not flash on load. The menu works without JavaScript.

**Q3. Language menu.** The language switch becomes one menu button next to the theme menu. Each entry shows a flag and the name of the language in that language ("Čeština", "English"). The flags are images, not interface colors; `DESIGN.md` records this exception. Switching the language keeps the page and its position and does not shift the layout.

**Q4. Visual review.** Before the dark theme is built, the application is reviewed on screenshots of every page in both languages, on a phone and a desktop. The review lists its findings and proposes palette and grid-marking changes in `DESIGN.md`; the operator approves them before they are applied. The dark theme is derived from the approved light palette.

**Q5. Known defects.** The review fixes at least these:

1. A grid cell focused from the keyboard has an outline of at least 3:1 against the cell and its neighbors, and the cell's content stays readable.
2. A chosen best window in the list does not move its content: marking it changes no border width.
3. Availability, if need be, the best-window outline and the final time are told apart in the grid by more than color, and each mark has at least 3:1 against what surrounds it.
4. Switching the language does not shift the layout (Q3).
5. The joined participant's line appears complete as soon as the page runs. Local storage (B1) also keeps whether the participant has a password, so the line, its password button included, needs no answer from the server; the page checks the token afterwards and corrects the stored value, and a token the server refuses leads to F4. The server cannot know the participant, so it renders the join form, which the line replaces for a joined browser. The token stays in local storage (ADR 0003 item 10); cookies are reconsidered with accounts in F5.

## 9. Live update rules

These rules replace Phase 2 rules F1 and F6. F2 to F5 still hold.

**S1. Transport.** The instance setting `LIVE_UPDATES` chooses how a visible event page or manage page learns of a new version (F5): with `push` (the default) the page holds a stream from the server that sends the version when it opens and whenever it changes; with `poll` it asks for the version at a fixed interval. The page reloads as in F2 when the version differs from the one it shows. ADR 0006 defines the transports and their timing settings.

**S2. Delay.** With `push`, a change appears on other open pages within 2 seconds; with `poll`, within the poll interval.

**S3. Fallback.** When the stream cannot be opened or fails twice in a row, the page falls back to `poll` and tries the stream again after 5 minutes.

**S4. Content.** The stream carries only the version and the fact that the event is gone. It carries no names, responses or secrets, so it needs no secret, like the share link (V1). It is a route of the web application, not part of the API: API clients check for changes with the `ETag` of A10.

**S5. Hidden and idle pages.** A hidden page stops its stream or checks and resumes when it becomes visible. A visible page with no input for the idle time of ADR 0006 stops too, says that updates are paused, and resumes at once on the next input or focus.

## 10. API rules

These rules extend Phase 3 section 3. Every change is additive within `/api/v1` (A9).

**A19. Levels.** A participant gains `ifNeedBe`, the list of slots at if need be. `availability` keeps every slot with a level, both available and if need be, so a client written before levels reads an if-need-be slot as available. A save sends `availability` and, optionally, `ifNeedBe`; a slot in `ifNeedBe` that is not in `availability` is refused with `invalid_request` and the field code `if_need_be_not_available` at its pointer. A save without `ifNeedBe` keeps the stored level of every slot that stays in `availability` and makes new slots available, so a client written before levels that reads, edits and saves a response does not lose its if-need-be slots. An empty `ifNeedBe` makes every slot available.

**A20. Window counts.** Each best window gains `ifNeedBe`, the number of its people at if need be, and `score`. Its order follows L6.

**A21. Poll schedule.** The schedule gains `mode: "poll"` with `options`, a list of `{ id, start, end }` with RFC 3339 instants in UTC. Its `slots` are `{ "option": "<id>" }`, and so are the slots in a participant's `availability` and `ifNeedBe`. A request creates options without `id`. A `PATCH` that replaces the schedule names kept options by `id` and new ones without it; an option it leaves out is removed (O5, A14). An `id` the event does not have is refused with `unknown_option`. Under G4, a client generated before this mode cannot read a poll event.

**A22. Final time.** An event gains `final`: `{ "kind": "open" }` or `{ "kind": "chosen", "start", "end", "sequence" }`, with a grid window's `slots` or a poll's `option`. `PUT /api/v1/events/{id}/final` with the admin secret picks it (N1, N3) and `DELETE` clears it (N4). A window that is not a run of the event's slots in one column is refused with `final_not_in_event`; a weekday date that does not fall on the window's weekday with `final_date_wrong_weekday`; a date before today with `date_in_past`.

**A23. Calendar file.** `GET /api/v1/events/{id}/final.ics` returns the file of C2 as `text/calendar`, the only answer of the API that is not JSON. Without a final time it is refused with `404` and `not_finalized`.

**A24. Confirming a cleared final time.** `confirmation_required` (A14) gains `clearsFinal`, which is true when the change would clear the final time (N5). The change is confirmed the same way, by `confirmedVersion`.
## 11. Guides

These rules make the guide item of the roadmap testable.

**J1. Place.** Each guide is a section of `README.md`. A guide longer than about 150 lines moves to `docs/guides/` and the README links to it.

**J2. Guides.** Local deployment (containers, instance settings, update, backup and restore), local API test (curl from creating an event to its best windows, with the secrets and the problems a client meets), local SDK usage (TypeScript and Python against a local instance), and local development (what mise installs, the development server, the checks a change must pass, regenerating the theme, the OpenAPI document and the SDKs).

**J3. Runnable.** Every command in a guide runs on a clean clone with the tools mise installs. The CI runs the commands of the API guide against the built application.

## 12. Pages

| Page | Address | Change |
|---|---|---|
| Create | `/{locale}/new` | The kind of event (O1) and the option list of a poll (O2). |
| Event | `/{locale}/e/{slug}-{id}` | The brush (L2), the poll table (O3, O4), the final time and the calendar actions (N2, C1), the stream (S1). |
| Manage | `/{locale}/e/{slug}-{id}/manage` | Picking and clearing the final time (N1, N3, N4), editing poll options (O5). |
| Every page | | The theme and language menus (Q2, Q3). |

## 13. Errors

Phase 1 section 12 and Phase 2 section 9 apply. The new codes are listed in [problem-codes.md](problem-codes.md): `if_need_be_not_available`, `too_few_options`, `too_many_options`, `option_end_not_after_start`, `option_not_one_day`, `duplicate_option`, `unknown_option`, `final_not_in_event`, `final_date_wrong_weekday` and `not_finalized`. A poll option in the past reuses `date_in_past`.

## 14. Acceptance test

Phase 4 is done when this end-to-end test passes on a clean clone in CI:

1. An organizer creates a dated event. Two participants join; one marks an evening as available, the other the same evening as if need be.
2. The best windows list that evening with the count "2 of 2, 1 of them if need be". The organizer picks it as the final time on the manage page.
3. A participant's event page shows the final time without a reload within 2 seconds, with the default transport (S2).
4. The participant downloads the `.ics` file. Its `DTSTART` and `DTEND` equal the start and end of the chosen window in UTC, and its `UID` is the same as in a second download after the organizer moves the final time, while its `SEQUENCE` is higher.

## 15. Rule coverage outside the acceptance test

The tests name no rule numbers. This list is the only link from rules to tests. Each branch of the phase adds its files here.

- Unit tests of the domain cover L1, L4 to L7 (levels, score and window order), O2 (option limits), N3 (weekday date to UTC), N5 (what clears the final time), C2 and C3 (the file content), and U8 to U10.
- Database tests cover the level migration (an existing response reads as available), O5, N4 to N6, U8 and U9, and A19 to A24 in the server functions the web and the API share.
- End-to-end tests cover L2 and L3 by touch and keyboard, O1 and O3 on a poll event, Q2 without JavaScript and without a flash on load, Q3, Q5 items 1, 2, 4 and 5, S1 to S3 for both transports (including the fallback when the stream is blocked) and S5.
- The SDK acceptance suites gain a poll event, a final time and its `.ics` file.
- A script in `mise run check` measures every contrast `DESIGN.md` states, for both themes (Q1).

Files so far:

- Q1: `apps/web/scripts/generate-theme.ts` reads both token blocks and the `json contrast` block of `DESIGN.md`; `mise run theme:check` fails on a stated contrast that does not match.
- Q2, Q3: `apps/web/src/components/theme-menu.tsx`, `locale-switch.tsx` and `header-menu.tsx`, the action in `apps/web/src/server/theme-actions.ts`; tested in `apps/web/e2e/start-page.spec.ts` (the theme without JavaScript, the dark device setting, the header staying in place when the language changes). Q2 without JavaScript needs `Referrer-Policy: same-origin` (ADR 0007).
- Q5 items 1, 2, 4 and 5: `availability-grid.tsx`, `best-windows.tsx` and `event-board.tsx` in `apps/web/src/components/event/`; item 4 is tested in `start-page.spec.ts`.
- L1, L4, L6 and L7: `apps/web/src/domain/levels.ts` (levels, score, heads, the saved shape), `heat.ts` and `best-windows.ts`; tested in `levels.test.ts`, `heat.test.ts` and `best-windows.test.ts` beside them. Storage: the `level` column of both availability tables, added by `apps/web/drizzle/0004_availability_level.sql` with a default, so a release before levels keeps writing rows that read as available; `apps/web/src/server/responses.ts` saves, and `responses.db.test.ts` covers the migration, the kept levels and the refusals.
- L2, L3 and L5: `level-marks.tsx` (the brush and the legend), `availability-grid.tsx`, `slot-detail.tsx`, `count.ts` and `best-windows.tsx` in `apps/web/src/components/event/`, the hatching in `apps/web/src/app/globals.css`; tested in `apps/web/e2e/if-need-be.spec.ts` by touch and keyboard. The stripes' contrast is a pair of the `json contrast` block (Q1).
- A19 and A20: `apps/web/src/server/api/schemas.ts`, `mapping.ts` and the availability route; tested in `participants-api.db.test.ts` and `events-api.db.test.ts`.
- N1, N3 and N5: `apps/web/src/domain/final-time.ts` (the window, the weekday date, the slots inside it and what clears it); tested in `final-time.test.ts` beside it. Storage: five `final_*` columns of `events`, added by `apps/web/drizzle/0005_final_time.sql` with defaults and a check that a chosen final time has both ends, so a release before it reads every event as having none. A dated event's window is a run of slots with no gap between them; it is not split at midnight in the reference zone, so a window that one column of the organizer's grid shows is accepted in any zone.
- N1, N4 and N5 on the server: `apps/web/src/server/final.ts` (pick and clear, each moving the version once and a repeated pick moving nothing) and the confirmation in `manage.ts`; tested in `final.db.test.ts`.
- N1 and N2 on the web: `apps/web/src/components/final-picker.tsx` on the manage page, `final-time.tsx` (the banner and the legend) and `availability-grid.tsx` (the sewn frame and the flag) in `apps/web/src/components/event/`, the frame in `apps/web/src/app/globals.css`, the actions in `apps/web/src/server/event-actions.ts`; tested in `apps/web/e2e/final-time.spec.ts`.
- N6: `apps/web/src/domain/retention.ts` and the purge in `apps/web/src/server/maintenance.ts`; tested in `retention.test.ts` and `retention.db.test.ts`, which checks that the purge and the pages agree.
- U8 to U10: `apps/web/src/domain/usage.ts`, `apps/web/src/server/usage.ts` and the counts in `maintenance.ts`; tested in `usage.test.ts`, `usage.db.test.ts` and `final.db.test.ts`.
- C1 to C4: `apps/web/src/domain/calendar.ts` (the file, its folding and escaping, and the Google Calendar and Outlook.com links) and `shareUrl` in `event-address.ts`, a share link without a language so the page opens in the follower's language; tested in `calendar.test.ts` beside them. The actions sit in the banner in `apps/web/src/components/event/final-time.tsx`; tested in `apps/web/e2e/final-time.spec.ts`, which also follows the file's link.
- A23: the route in `apps/web/src/app/api/v1/events/[id]/final.ics/`, `apps/web/src/server/calendar.ts` and the `text/calendar` answer in `openapi.ts`; tested in `final-api.db.test.ts` and both SDK acceptance suites.
- O1, O2, O4 and O6 in the domain: `apps/web/src/domain/schedule.ts` (the poll schedule and its option slots), `poll.ts` (the option limits and the best options) and the poll branches of `final-time.ts`, `retention.ts` and `event-edit.ts` (the kind locked once people joined); tested in `poll.test.ts` beside them. Storage: `apps/web/drizzle/0006_poll.sql` adds `kind` with the default `grid`, makes the grid columns nullable under a check that they match the kind, and adds `poll_options` and `poll_availability`, whose foreign keys keep an answer inside its event. A release before it writes only grid events, which keep every column. The final option is the option with the final start and end, which are unique within an event, so no column names it. `schema.db.test.ts` covers the check.
- O5, O6 and A21 on the server: `apps/web/src/server/events.ts`, `event-rows.ts`, `manage.ts` (kept, added and removed options, and the confirmation), `responses.ts` and the purge in `maintenance.ts`; the API in `schemas.ts`, `mapping.ts` and `openapi.ts` in `apps/web/src/server/api/`. Tested in `poll-api.db.test.ts`, `retention.db.test.ts` and both SDK acceptance suites. `oasdiff-err-ignore.txt` accepts `firstDayOfWeek` becoming optional in the event, which only a poll leaves out.
- O1, O3 to O5 and N1 for a poll on the web: the kind choice in `apps/web/src/components/event-form.tsx` and the option list in `poll-options-editor.tsx`, which sends new options as instants in the reference zone and names kept ones by id; the event page in `apps/web/src/components/event/poll-board.tsx` and `poll-table.tsx` (one row per option, a card in a narrow container, three answer buttons, the heads and the names by level, and the best options without filters, ranked on the server in `apps/web/src/server/board.ts`); the final option on the manage page in `apps/web/src/components/poll-final-picker.tsx`. The grid and the poll share the participant in `use-participation.ts`, the save bar in `save-bar.tsx` and the zone notice in `zone-notice.tsx`. Tested in `apps/web/e2e/poll.spec.ts`, which also covers the confirmation of O5 and N5 and checks that the answer buttons stay in place; `steady.spec.ts` presses the kind choice.
- A22 and A24: the final route in `apps/web/src/app/api/v1/events/[id]/final/`, `schemas.ts`, `mapping.ts` and `openapi.ts` in `apps/web/src/server/api/`; tested in `final-api.db.test.ts`.
- S1 to S5: the settings in `apps/web/src/env.ts`; the trigger in `apps/web/drizzle/0007_live_updates.sql`, which a release before it ignores; the listening connection in `apps/web/src/server/live.ts`, tested in `live.db.test.ts`; the stream in `apps/web/src/app/api/live/[id]/route.ts`, which answers `404` with `poll` and `503` when the server cannot listen; the page side in `apps/web/src/lib/live-updates.ts` (stream, checks, fallback, hidden and idle pages) and the paused notice in `apps/web/src/components/live-updates.tsx`, rendered by the event page and the manage page, whose participants reload with each version. Tested in `apps/web/e2e/freshness.spec.ts` against a streaming server and a second one with `poll`.
