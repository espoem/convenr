# convenr product roadmap

Status: agreed 2026-11-16. The detailed rules for the first phase are in the [Phase 1 specification](spec/phase-1.md). The technology decisions are in the [ADRs](adr/).

## 1. Problem and positioning

A group of people needs to find a time that works for most of them. They don't want to pay, sign up, see ads, or be tracked.

What the market offered when this roadmap was written (survey of public product and pricing pages, November 2026):

| Need | Who serves it | Gap |
|---|---|---|
| Availability grid | When2meet, Crab Fit, Timeful, LettuceMeet, WhenIsGood | Weak on phones and across time zones, by third-party reports. Calendar overlay exists only in a few. |
| Date and time poll | Doodle, Rallly, Srazovník, Nuudel, WhenAvailable, Calendly polls | Free tiers are limited or carry ads, or the organizer must give an email address. |
| One-to-one booking page | Cal.com, Calendly, Easy!Appointments, Reservio, reenio | A different product. **Out of scope.** |
| Recurring club attendance | Club member apps | They need accounts and are managed by the club. |

**Positioning:** free, no ads, no trackers, and usable without an account by both organizer and participants. Optional sign-in adds convenience and never gates the core. It works well on a phone, converts time zones correctly, and is available in Czech and English from the first release. The source is open under AGPL-3.0.

**Non-goals:** booking pages, payments, SMS, and enterprise single sign-on.

## 2. Principles

1. **Anonymous first.** Creating an event and responding never require an account. The organizer gets a secret admin link. A participant identifies inside one event by a display name that is unique in that event, plus an optional password for that event.
2. **Privacy is the product.** No third-party analytics, no ads, no stored visitor addresses. Every event shows the date on which it will be deleted.
3. **Phone first.** The grid is painted by touch, and nothing depends on hover.
4. **Time zones are correct by construction.** See [ADR 0002](adr/0002-time-representation.md).
5. **Accounts add, never gate.** Sign-in only adds dashboards, notifications, calendar overlay, groups and unlimited retention.
6. **One runnable exit criterion per phase.** A phase is done when its test passes on a clean clone.

## 3. Phases

Each phase ships on its own and is usable by real people.

### F0: Foundation

- Repository skeleton as laid out in [ADR 0001](adr/0001-technology-stack.md): `apps/web`, `docs/`, `.agents/`, `AGENTS.md`, `DESIGN.md`, `compose.yaml`, `.mise.toml`.
- Tooling: mise, nub, strict TypeScript, oxlint, oxfmt, Vitest, Playwright.
- A compose file that starts the application and PostgreSQL with Docker or Podman.
- The theme generated from the tokens in `DESIGN.md`.
- CI on GitHub Actions: lint, format check, type check, unit tests, build, and a second job under Bun.
- Project skills for coding agents and the GitHub issue tracker set up.
- A README with the steps to run locally and to deploy the container anywhere.

*Exit criterion:* on a clean clone, `mise run check` exits with code 0, and `mise run up` serves the start page in Czech and English.

### F1: Create and respond

- Create an event without an account: name, optional description, days chosen as a date range, specific dates or weekdays, a daily time range, a slot length, a reference zone and the first day of the week.
- Share link and admin link.
- Join by display name with an optional password. Paint availability by touch, mouse or keyboard.
- Heat map of the overlap, with the names behind every slot.
- Czech and English.
- The browser remembers the person's events.

*Exit criterion:* the end-to-end test in the [Phase 1 specification](spec/phase-1.md#13-acceptance-test) passes: ten participants on a phone-sized screen find their one common evening window, and nobody creates an account.

### F2: Manage and life cycle

- Manage page behind the admin link: rename, extend the days or the time range, narrow them after a confirmation that names how many participants lose availability, delete a response, delete the event. Slot length, day mode and reference zone are locked once the first response exists.
- Best windows: filter by a minimum duration and a minimum number of people.
- A switch to show a dated event in the reference zone instead of the viewer's zone.
- The page checks every 15 seconds, and when it becomes visible again, whether the event has changed, and reloads the results only when it has.
- Retention: an expired event stops being served at once, and a scheduled command deletes it from the database. The period is an instance setting with the default 90 days. It can be set to keep events permanently.
- Aggregate usage counts (section 5).

*Exit criterion:* an end-to-end test deletes one event through the manage page and lets another expire, and then finds neither through the application nor in the database.

### F3: Public API and SDKs

- REST API served by the application, with an OpenAPI 3.1 description generated from the validation schemas.
- TypeScript SDK and Python SDK generated from that description.
- API documentation page.
- CI fails when a generated SDK is out of date.

*Exit criterion:* the test suites of both SDKs (Vitest and pytest) create an event, add two responses and read the overlap against a running instance.

### F4: Finalize and polish

- The organizer picks a final slot. Participants get an `.ics` download and an "add to calendar" link.
- An "if need be" level in addition to "available".
- Poll mode: yes, if need be, or no on a few hand-picked options, on the same event model.
- Light and dark theme: follows the system setting, with a manual switch.
- Visual review of the application, which may revise the palette and how the grid marks cells in `DESIGN.md`. Defects seen and fixed:
  1. A grid cell focused from the keyboard has too little contrast, and its outline is hard to see.
  2. A chosen best time in the list below the grid shifts its content by a pixel, because the mark widens the border from 1 to 2 px.
  3. The marks in the grid (availability, best time) have too little contrast against each other and the background.
  4. Switching the language shifts the layout.
  5. After switching the language, "Change password" and the rest of the line for the joined participant appear noticeably later than the other text. The board learns who has joined only after the browser sends its stored token to the server (`identifyAction` in `event-board.tsx`), so the line waits for that round trip on every page load.
  6. The parts of the event page had no common width, and short notes wrapped well before the line ended. `measure` now matches `form` at `42rem`.
  7. The hint under the participant filter wrapped in a column that was too narrow.
  8. After a click on a copy button, the "Copied." notice stayed on screen; it now clears after 2.5 seconds.
  9. A chosen best time could stay highlighted when filtered away; the highlight now resets when the option leaves the visible list.
  10. The best times list showed on both tabs; it now appears only on the "Group" tab.
  11. A reload switched the "Me"/"Group" tab back to its default; `?tab=` now preserves it.
- Live updates that replace the 15-second reload, using the technique that fits the hosting chosen by then.
- Guides for people who run convenr or build on it, as sections of the README. A guide that is too long for the README moves to `docs/guides/` and the README links to it. A guide is done when each of its commands runs on a clean clone.
  1. Local deployment: run the application and PostgreSQL in containers, the settings an instance takes, and how to update it and back up its data.
  2. Local API test: call a local instance with curl, from creating an event to its best windows, including the secrets and the problems a client meets.
  3. Local SDK usage: use the TypeScript and the Python SDK against a local instance.
  4. Local development: the tools mise installs, the development server, the tests and checks a change must pass, and how to regenerate the theme, the OpenAPI document and the SDKs.

*Exit criterion:* an end-to-end test finalizes an event and a participant downloads an `.ics` file whose start and end match the chosen slot.

### F5: Browser identity and optional accounts

The rules are in the [Phase 5 specification](spec/phase-5.md). F5 ships in three steps.

1. **Browser identity.** One HttpOnly cookie holds a browser key, and each participant token is derived from it per event ([ADR 0008](adr/0008-browser-identity-cookie.md)). The server renders the joined state on the first response, so the event page no longer swaps the join form for the joined line while it loads.
2. **Accounts** with Better Auth ([ADR 0009](adr/0009-accounts-with-better-auth.md)):
   - Passwordless sign-in by email link or passkey.
   - Claim the events created in this browser into the account.
   - Dashboard of my events and events I responded to.
   - A signed-in organizer can keep an event without a time limit.
   - Opt-in email notifications for new responses, finalization and reminders, with their timing set per instance.
   - Accounts stay off on the public instance until the privacy policy exists.
3. **Sign-in with providers** ([ADR 0012](adr/0012-provider-sign-in.md)): Google and GitHub first, then Seznam after Seznam's approval and Facebook after Meta's, and later Apple and mojeID. A provider creates an account only for an address it proves, and joins an existing account only from inside a signed-in session. Each provider stays off until an instance sets its client id and secret.

*Exit criterion:* the end-to-end test in the [Phase 5 specification](spec/phase-5.md#12-acceptance-test) passes: a reload without JavaScript shows a joined participant, an organizer signs in by email link, claims and keeps an event, and a signed-in participant receives the final time by email with a matching `.ics` file.

### F6: Calendar awareness

- Read-only free/busy overlay from Google, Microsoft or an ICS address, used to pre-fill the grid. It is fetched on demand and not kept.
- A calendar invite to participants who left an email address when the event is finalized.

### F7: Groups and recurring attendance

- A persistent group with members, an invite link and roles.
- Recurring events such as "training every Tuesday at 18:00" with a yes or no per occurrence and a reason for absence.
- Attendance history and opt-in reminders.
- Members can join with a name and a token. Accounts stay optional.

### F8: Openness and reach

- A documented self-hosting package and webhooks.
- An embeddable widget, installation as an app on a phone, and responding while offline.
- More languages, Slovak and German first.

F6 to F8 get an exit criterion when each is planned in detail.

Each of F5 to F8 ends with a UI and UX review of what it added and of the pages it changed: layout and widths, flow, copy, accessibility and behavior on a phone. Its defects are listed in the phase, as in F4, and fixed before the phase is done.

## 4. Decisions

| # | Decision | Outcome |
|---|---|---|
| D1 | License | Open source, AGPL-3.0. |
| D2 | Funding | Donations and low running cost. No paid tier for core features. Accepting donations waits for the legal review. |
| D3 | Retention | Set per instance. The default is 90 days after an event's last date, or after the last change for a weekday event. Backups expire within 35 days of a deletion. An instance can keep events permanently, and from F5 a signed-in organizer can too. |
| D4 | First mechanic | The availability grid. Poll mode follows in F4. |
| D5 | Protection against automated abuse | Deferred. It must be decided before the public launch. |
| D6 | Name and domain | convenr, at convenr.party. |
| D7 | Architecture | One Next.js application owns the data and the rules. See [ADR 0001](adr/0001-technology-stack.md). |
| D8 | Participant identity | Display name unique within the event, optional password, no separate edit link. See [ADR 0003](adr/0003-identifiers-and-secrets.md). |
| D9 | Legal documents | Privacy policy, terms of service and their review are postponed. They block the public launch, not development. |

## 5. Success metrics

All metrics are daily counts computed on the server. They hold no names, event contents or identifiers, and they remain after the events they were counted from are deleted.

| Metric | Definition | From phase |
|---|---|---|
| Events created | Number of events created per day. | F2 |
| Activation rate | Share of events that have at least 2 participants within 7 days of creation. | F2 |
| Group size | Median number of participants per event, measured at deletion or after 30 days, whichever comes first. | F2 |
| Time to first response | Median time from event creation to the first response. | F2 |
| Finalization rate | Share of events where the organizer picked a final slot. | F4 |
| Time to finalize | Median time from event creation to the final slot being picked. | F4 |
| Return organizers | Share of signed-in organizers who create a second event within 90 days. | F5 |

Return organizers can't be measured for anonymous users without a persistent identifier, which principle 2 rules out.

No targets are set yet. The first month of real use gives the baseline.

## 6. Before the public launch

These items do not block development. All of them block opening convenr.party to the public.

- Privacy policy and terms of service, reviewed.
- Decision D5.
- A hosting provider, chosen with the location of the data in mind.
- A check of trade mark registers for the name.
