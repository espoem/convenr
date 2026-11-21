# Phase 5 functional specification: browser identity and optional accounts

Status: agreed 2026-11-21. This document defines Phase F5 of the [roadmap](../roadmap.md). It builds on the specifications of [Phase 1](phase-1.md), [Phase 2](phase-2.md), [Phase 3](phase-3.md) and [Phase 4](phase-4.md): every earlier rule still holds unless a rule here replaces it. Identifiers and secrets are in [ADR 0003](../adr/0003-identifiers-and-secrets.md), the browser identity in [ADR 0008](../adr/0008-browser-identity-cookie.md), and accounts in [ADR 0009](../adr/0009-accounts-with-better-auth.md). Problem codes are listed in [problem-codes.md](problem-codes.md).

The spec is written as domain rules. Each rule has an id so that the spec can map it to code and tests; code and tests do not cite the ids.

## 1. Scope

Phase 5 ships in two steps. In the first step the server learns from one cookie which participants a browser has joined as, so the event page arrives already showing the participant's line and grid. In the second step a person can sign in with an email link or a passkey, add the events of a browser to an account, keep an organized event without a time limit, and get emails about responses, the final time and reminders. Accounts stay optional: everything earlier phases allow without an account still works without one.

Phase 5 does not include:

- sign-in with Google, Facebook, Seznam or GitHub; it waits for a later step of F5 (roadmap);
- account endpoints in the public API, account tokens or changes to the SDKs; the API stays anonymous;
- account passwords, names or profile pictures;
- protection against automated abuse beyond the email limits of AU6; decision D5 stays open;
- turning accounts on for the public instance before the privacy policy exists (roadmap section 6).

## 2. Terms

- **Browser key:** a random secret held in one HttpOnly cookie, which the server reads on each request and never stores.
- **Browser token:** a participant token derived from the browser key and an event id (Y2).
- **Account:** an email address with its passkeys, sessions, language and notification settings. An account has no name.
- **Linked participant:** a participant that belongs to an account.
- **Owner:** the account an event belongs to after its organizer claimed it.
- **Outbox:** the stored emails waiting to be sent.

## 3. Browser identity rules

These rules replace Phase 1 rules B1 and B2 and ADR 0003 item 10. B3 and B4 still hold.

**Y1. Cookie.** The first time a browser joins an event or proves a password, the server sets the cookie `__Host-convenr-key`: 32 random bytes in base64url, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, with a lifetime of 400 days. A response renews the lifetime when the cookie is more than a day older than its last renewal. A browser that only reads events gets no cookie.

**Y2. Browser token.** A browser's token for an event is the HMAC-SHA-256 of the event id under the browser key. The server stores only the SHA-256 hash of the token, in the same place as every other participant token (P8). It stores neither the key nor anything that links two events of one browser.

**Y3. Recognizing.** On every request for an event, the server derives the browser token from the cookie and looks up the participant it belongs to. The event page is rendered for that participant on the first response, with the joined line and the participant's own grid or poll answers, also without JavaScript. Saving, setting a password and leaving read the cookie in the action; the page holds no participant token.

**Y4. Moving old tokens.** A browser that still holds participant tokens in local storage sends each one once to the server, which adds the browser token of that event to the same participant and answers whether it did. The page then deletes the token from local storage. A token the server does not know is deleted as well.

**Y5. Local storage.** Local storage keeps, per event, the event id, the event name, the admin secret if the browser has it, and the participant's name if it joined. It keeps no participant token. The start page list (B3) reads it as before.

**Y6. Losing the cookie.** A browser without the cookie, or with a key that matches no participant, gets the join form. Joining under the same name with the password, when one is set, adds a new browser token (P4). A participant without a password cannot be taken back from another browser except by joining under the name, as before (ADR 0003, consequences).

**Y7. No banner.** The cookie is needed for joining to work, so the application asks for no consent. The privacy policy names the cookie, as it names the theme cookie and the session cookie (AU7).

## 4. Account rules

**AU1. Availability.** Accounts exist on an instance only when the settings `SMTP_URL`, `MAIL_FROM`, `AUTH_SECRET` and `PUBLIC_URL` are all set. When one is missing, no page shows sign-in, the account address answers not found, and every earlier rule works as before. An instance that sets some but not all of them refuses to start and names the missing ones.

**AU2. Content.** An account holds one email address, its passkeys, its sessions, the language of its emails and its notification settings (NT1). It has no name or other profile data. The email address is stored as entered after trimming and lower-casing its domain, and two accounts cannot share one address.

**AU3. Sign-in link.** The sign-in page takes an email address and sends a link to it. Following the link signs the browser in, creating the account when the address has none. A link works once, for 15 minutes, in any browser. The page says the same thing whether or not the address has an account. An account created this way takes the language of the page that asked for the link.

**AU4. Passkeys.** A signed-in account can add passkeys from the account page, name them and remove them. The sign-in page offers sign-in with a passkey next to the email field, and offers passkeys in the browser's autofill where the browser supports it, detected at run time. Removing the last passkey is allowed, because the email link always works.

**AU5. Changing the address.** A signed-in account can change its address. The new address gets a link, and the change takes effect only when that link is followed within 15 minutes. The old address gets a notice of the change.

**AU6. Email limits.** The server sends at most 3 sign-in or address-change emails per address per hour, and at most `MAIL_HOURLY_LIMIT` emails of all kinds per hour in total (default 300). It counts an address by its HMAC under `AUTH_SECRET`, so it stores no address that never signs in, and it deletes the counts after a day. A request over a limit is refused with `too_many_emails`. The server stores no visitor address for these limits (ADR 0003 item 8).

**AU7. Sessions.** A session lives in one cookie that is `HttpOnly`, `Secure` and `SameSite=Lax` with the `__Secure-` prefix. It lasts 30 days and is renewed at most once a day while in use. The cookie carries the session token signed with the instance secret `AUTH_SECRET`, and the server accepts a session only with a valid signature, so a copy of the database alone signs nobody in; changing `AUTH_SECRET` ends every session. Besides the token, the server stores only the session's creation time and the family of the browser that created it (such as "Firefox on Android"), never the full user agent or the visitor's address. The account page lists the sessions by creation time and browser family and can end each one or all others. Signing out ends the current session.

**AU8. Signed-in joins.** A signed-in visitor who joins an event creates a linked participant. The browser gets no browser token for it, so signing out on a shared device leaves no access behind. A linked participant is recognized on every browser where its account is signed in. A signed-in visitor cannot join anonymously.

**AU9. Unlinking.** From the account page, a linked participant can be unlinked. It then stays in its event like any participant; the browser that unlinks it gets a browser token for it, so it stays joined there.

**AU10. Deleting the account.** The account page deletes the account after a confirmation. When the session is more than a day old, the confirmation is a link sent by email. Deleting removes the account, its sessions, passkeys and settings and every email of it in the outbox. Its owned events lose their owner (OW5) and its linked participants become ordinary participants; nothing else of the events changes. The admin links and the browser tokens keep working.

## 5. Ownership rules

**OW1. Claiming.** The account page lists the events the browser knows from local storage (Y5) that are not in the account, each with a button to add it, and a button to add them all. Adding an event the browser organizes sends its admin secret; the server checks it and makes the account the owner. Adding an event the browser joined links the browser's participant to the account.

**OW2. One owner.** An event has at most one owner. Adding an event that has another owner is refused with `event_has_owner` and changes nothing. Adding an event the account already owns changes nothing.

**OW3. Owner access.** The owner opens the manage page from any browser where it is signed in, without the admin link. The event page shows the owner a link to the manage page. The admin link keeps working for anyone who has it, and its holder can do everything the owner can except keeping the event (OW4) and removing it from the account (OW6).

**OW4. Keeping without a time limit.** The manage page shows the owner a switch to keep the event without a time limit. While it is on, the event is never deleted for its age, and the event page says that its organizer keeps it, in place of a deletion date. The instance setting `RETENTION_DAYS=never` (X1) keeps every event regardless of the switch.

**OW5. Ending the keeping.** When the owner turns the switch off, or the event loses its owner, the event's deletion date is the later of its date under E7 and the end of the day of that change plus the retention period, in the reference zone. An event whose E7 date has long passed therefore gets a full retention period, and is not deleted at once. The switch and the time it was turned off are stored in one field that cannot hold a contradiction.

**OW6. Releasing.** The owner can remove an event from the account. The event loses its owner as in OW5, and the browser that removes it keeps the admin secret in local storage only if it already had it.

## 6. Notification and email rules

**NT1. Kinds.** An account can turn on three kinds of notification, each off by default:

1. **New responses:** for events it owns, the names of participants who joined or saved a change since the last such email. It holds no availability.
2. **Final time:** for events where it has a linked participant, an email when the final time is picked or changed, with the `.ics` file of C2 attached, and a notice when it is cleared.
3. **Reminder:** for events where it owns the event or has a linked participant, an email before the final time starts.

The settings on the account page apply to all events. On an event page and a manage page, a signed-in account can override each kind for that event.

**NT2. Timing.** The instance settings choose the timing: `NOTIFY_DIGEST_MINUTES` (default 60) is the least time between two new-responses emails for one account and event, and `REMINDER_HOURS` (default 24) is how long before the final time a reminder is due. A first new response after a quiet period is sent at once. Later ones wait until the interval has passed and go into one email. A reminder is sent by the first maintenance pass at or after its due time and before the final time starts; it is never sent early. A final time that changes before its reminder moves the reminder, and one picked less than `REMINDER_HOURS` ahead gets no reminder.

**NT3. Outbox.** An email is written to the outbox in the same transaction as the change that causes it. The server sends it after the response, and the maintenance pass sends what is still waiting and retries a failed email up to 5 times over at least a day. A sign-in or address-change email is sent within the request, because the visitor waits for it, and the page says when sending failed. An email is deleted from the outbox once it is sent or has failed for the last time.

**NT4. Content.** Every email has a plain-text part and an HTML part, in the account's language. The HTML uses the colors and type of `DESIGN.md` and holds no image, no content from another host and no tracking of any kind. Every text lives in `cs.json` and `en.json`. An email about an event names it and links to its share link, never to the admin link.

**NT5. Unsubscribing.** Every notification email has an unsubscribe link and the `List-Unsubscribe` and `List-Unsubscribe-Post` headers of RFC 8058. Following the link turns off that kind for that event, without signing in. The link carries a value signed with `AUTH_SECRET` that names the account, the event and the kind, and nothing else.

**NT6. Changing language.** The account page sets the language of the account's emails.

## 7. Retention rules

These rules extend Phase 2 rules X1 to X4.

**X5. Kept events.** An event kept by its owner (OW4) does not expire and is not purged for its age. OW5 sets its deletion date when the keeping ends.

**X6. Sign-in data.** The maintenance pass deletes expired sessions, used and expired sign-in links, the email counts of AU6 older than a day, and outbox emails as in NT3.

## 8. Usage rules

These rules extend Phase 2 rules U1 to U7 and Phase 4 rules U8 to U10.

**U11. Accounts created.** Each new account adds one to the day's count.

**U12. Return organizers.** When the first event an account owns becomes 90 days old, the day's count of evaluated organizers grows by one, and the count of returning organizers grows by one if the account owns a second event created in those 90 days. An event counts from its creation, not from when it was claimed. Each account adds to U12 at most once; an account deleted before the 90 days adds nothing.

**U13. Output.** The command of U7 also prints the accounts created and the share of returning organizers.

## 9. Pages

| Page | Address | Change |
|---|---|---|
| Event | `/{locale}/e/{slug}-{id}` | Rendered for the recognized participant (Y3), the owner's manage link (OW3), the per-event notification settings (NT1). |
| Manage | `/{locale}/e/{slug}-{id}/manage` | Opens for the owner without the admin link (OW3), the keeping switch (OW4), the per-event notification settings (NT1). |
| Sign-in | `/{locale}/sign-in` | The email field and the passkey button (AU3, AU4). |
| Account | `/{locale}/account` | The lists "I organize" and "I joined", each event with its name, deletion date or that it is kept, final time and link; the events of this browser not in the account (OW1); passkeys, sessions, address, language, notification settings and deletion (AU4 to AU10, NT1, NT6). |
| Unsubscribe | `/{locale}/unsubscribe` | Confirms NT5. |
| Every page | | A sign-in link in the header, or the account menu when signed in, when accounts are on (AU1). |

## 10. Errors

Phase 1 section 12 and Phase 2 section 9 apply. The new codes are listed in [problem-codes.md](problem-codes.md): `sign_in_link_invalid`, `too_many_emails`, `email_not_sent`, `event_has_owner`, `wrong_admin_secret`, `passkey_not_recognized` and `confirmation_link_invalid`.

## 11. Review

As the roadmap requires, the phase ends with a UI and UX review of the new pages and of the event, manage and start pages it changed: layout and widths, flow, copy, accessibility and behavior on a phone. Its defects are listed here and fixed before the phase is done.

## 12. Acceptance test

Phase 5 is done when this end-to-end test passes on a clean clone in CI, with Mailpit as the mail server:

1. A visitor joins an event. With JavaScript turned off, a reload shows the participant's line and grid in the server's first response.
2. A visitor creates an event without an account, then signs in with the link read from Mailpit, adds the event to the account and turns on keeping it. The event page says that its organizer keeps it.
3. A second visitor in another browser context signs in, turns on final-time emails, and joins the event as a linked participant.
4. The organizer picks the final time. Mailpit receives the final-time email for the second visitor, and the `DTSTART` and `DTEND` of its attached `.ics` file equal the start and end of the chosen window in UTC.

## 13. Rule coverage outside the acceptance test

The tests name no rule numbers. This list is the only link from rules to tests. Each branch of the phase adds its files here.

- Unit tests of the domain cover Y2 (the derivation), OW5 (the deletion date after keeping), NT2 (when a digest and a reminder are due), NT5 (the signed value) and U12.
- Database tests cover Y3, Y4, AU6, AU8 to AU10, OW1 to OW6, NT3, X5, X6 and U11 to U13 in the server functions.
- End-to-end tests cover Y1, Y3 and Y4 (a browser that held a token in local storage before the change), AU3 to AU5 and AU7 with Mailpit, AU4 with a virtual authenticator, OW3, NT1 and NT5.

Files so far:

- Y1 and Y2: `apps/web/src/server/browser-key.ts` (the cookie, its value of key and renewal date, the derived token); the daily renewal in `apps/web/src/proxy.ts`, which also tells the server whether the request came over HTTPS. An instance served over plain HTTP gets the cookie `convenr-key` without the `__Host-` prefix, which needs a secure origin; a secure instance reads only the prefixed cookie. Tested in `browser-key.test.ts`.
- Y3, Y4 and Y6: the actions in `apps/web/src/server/participant-actions.ts` read the cookie and pass no token to the page; `join` takes the browser's token, `moveToken` and `forgetToken` in `apps/web/src/server/participants.ts`, tested in `participants.db.test.ts`. "Not you?" removes the browser's token for the event and keeps the participant. The event page renders the recognized participant (`apps/web/src/app/[locale]/e/[segment]/page.tsx`), and `apps/web/src/components/event/use-participation.ts` moves an old token and notices a participant the server no longer knows. Tested in `apps/web/e2e/identity.spec.ts`; the dropped participant in `freshness.spec.ts`.
- Y5: `apps/web/src/lib/local-events.ts` keeps the name only.
- AU1: the settings and the `accounts` switch in `apps/web/src/env.ts`, tested in `env.test.ts`; `auth()` in `apps/web/src/server/auth.ts` is undefined while accounts are off, the route `apps/web/src/app/api/auth/[...all]/route.ts` and the sign-in and account pages answer 404, and `apps/web/src/components/page-shell.tsx` shows no sign-in link. Tested in `apps/web/e2e/accounts.spec.ts` on the second server, which has no mail settings.
- AU2 to AU5 and AU7: Better Auth with the email-link and passkey plugins in `apps/web/src/server/auth.ts`, the Server Actions in `apps/web/src/server/account-actions.ts`, the pages `apps/web/src/app/[locale]/sign-in/page.tsx` and `apps/web/src/app/[locale]/account/page.tsx`, and the passkey buttons `apps/web/src/components/passkey-sign-in.tsx` and `add-passkey.tsx`. Sessions keep the browser family from `apps/web/src/domain/browser-family.ts` and no address. The tables are in `apps/web/src/db/schema.ts`, migration `0008_accounts.sql`. The email texts are in `apps/web/src/server/email/emails.tsx`, in the one MJML layout `layout.tsx` with the email tokens that `mise run theme` generates from `DESIGN.md` (NT4 for these emails), tested in `emails.test.ts`. Tested in `apps/web/e2e/accounts.spec.ts` with Mailpit (`apps/web/e2e/mail.ts`) and a virtual authenticator, and in `browser-family.test.ts`.
- AU7: a session needs the cookie signed with `AUTH_SECRET`; the token from the database alone, or signed with another secret, signs nobody in. Tested in `apps/web/src/server/auth.db.test.ts`.
- AU6: `takeEmailSlot` in `apps/web/src/server/mail.ts` counts an HMAC of each address and the instance total per hour. Tested in `mail.db.test.ts`.
