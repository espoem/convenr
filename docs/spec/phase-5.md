# Phase 5 functional specification: browser identity and optional accounts

Status: agreed 2026-11-21. This document defines Phase F5 of the [roadmap](../roadmap.md). It builds on the specifications of [Phase 1](phase-1.md), [Phase 2](phase-2.md), [Phase 3](phase-3.md) and [Phase 4](phase-4.md): every earlier rule still holds unless a rule here replaces it. Identifiers and secrets are in [ADR 0003](../adr/0003-identifiers-and-secrets.md), the browser identity in [ADR 0008](../adr/0008-browser-identity-cookie.md), accounts in [ADR 0009](../adr/0009-accounts-with-better-auth.md), and sign-in through providers in [ADR 0012](../adr/0012-provider-sign-in.md). Problem codes are listed in [problem-codes.md](problem-codes.md).

The spec is written as domain rules. Each rule has an id so that the spec can map it to code and tests; code and tests do not cite the ids.

## 1. Scope

Phase 5 ships in three steps. In the first step the server learns from one cookie which participants a browser has joined as, so the event page arrives already showing the participant's line and grid. In the second step a person can sign in with an email link or a passkey, add the events of a browser to an account, keep an organized event without a time limit, and get emails about responses, the final time and reminders. In the third step a person can also sign in through Google or GitHub. Accounts stay optional: everything earlier phases allow without an account still works without one.

Phase 5 does not include:

- sign-in with Seznam, which waits for Seznam's approval, or with Facebook, which waits for Meta's;
- account endpoints in the public API, account tokens or changes to the SDKs; the API stays anonymous;
- account passwords, names or profile pictures;
- protection against automated abuse beyond the email limits of AU6; decision D5 stays open;
- turning accounts on for the public instance before the privacy policy exists (roadmap section 6).

## 2. Terms

- **Browser key:** a random secret held in one HttpOnly cookie, which the server reads on each request and never stores.
- **Browser token:** a participant token derived from the browser key and an event id (Y2).
- **Account:** an email address with its passkeys, providers, sessions, language and notification settings. An account has no name.
- **Provider:** a service, such as Google, that tells convenr who signed in.
- **Linked participant:** a participant that belongs to an account.
- **Owner:** the account an event belongs to after its organizer claimed it.
- **Outbox:** the stored emails waiting to be sent.

## 3. Browser identity rules

These rules replace Phase 1 rules B1 and B2 and ADR 0003 item 10. B3 and B4 still hold.

**Y1. Cookie.** The first time a browser joins an event or proves a password, the server sets the cookie `__Host-convenr-key`: 32 random bytes in base64url, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, with a lifetime of 400 days. A response renews the lifetime when the cookie is more than a day older than its last renewal. A browser that only reads events gets no cookie. An instance served over plain HTTP, where a browser refuses the `__Host-` prefix, uses the cookie `convenr-key` without the prefix and without `Secure`; over HTTPS only the prefixed cookie is read.

**Y2. Browser token.** A browser's token for an event is the HMAC-SHA-256 of the event id under the browser key. The server stores only the SHA-256 hash of the token, in the same place as every other participant token (P8). It stores neither the key nor anything that links two events of one browser.

**Y3. Recognizing.** On every request for an event, the server derives the browser token from the cookie and looks up the participant it belongs to. The event page is rendered for that participant on the first response, with the joined line and the participant's own grid or poll answers, also without JavaScript. Saving, setting a password and leaving read the cookie in the action; the page holds no participant token.

**Y4. Moving old tokens.** A browser that still holds participant tokens in local storage sends each one once to the server, which adds the browser token of that event to the same participant, retires the old token and answers whether it did. The old token then exists nowhere else, so an API client that copied it loses access. The page then deletes the token from local storage. A token the server does not know is deleted as well.

**Y5. Local storage.** Local storage keeps, per event, the event id, the event name, the admin secret if the browser has it, and the participant's name if it joined. It keeps no participant token. The start page list (B3) reads it as before.

**Y6. Losing the cookie.** A browser without the cookie, or with a key that matches no participant, gets the join form. Joining under the same name with the password, when one is set, adds a new browser token (P4). A participant without a password cannot be taken back from another browser except by joining under the name, as before (ADR 0003, consequences). A browser holds one token per event: joining under a second name moves it to the new participant, and the first one stays and can be joined again under its name, as above. "Not you?" deletes the browser's token for the event on the server and keeps the participant.

**Y7. No banner.** The cookie is needed for joining to work, so the application asks for no consent. The privacy policy names the cookie, as it names the theme cookie and the session cookie (AU7).

## 4. Account rules

**AU1. Availability.** Accounts exist on an instance only when the settings `SMTP_URL`, `MAIL_FROM`, `AUTH_SECRET` and `PUBLIC_URL` are all set. When one is missing, no page shows sign-in, the account address answers not found, and every earlier rule works as before. An instance that sets some but not all of them refuses to start and names the missing ones.

**AU2. Content.** An account holds one proved email address, its passkeys, its providers (AU16), its sessions, the language of its emails and its notification settings (NT1). It has no name or other profile data. The email address is stored as entered after trimming and lower-casing its domain, and two accounts cannot share one address.

**AU3. Sign-in link.** The sign-in page takes an email address and sends a link to it. Following the link signs the browser in, creating the account when the address has none. A link works once, for 15 minutes, in any browser. The page says the same thing whether or not the address has an account. An account created this way takes the language of the page that asked for the link.

**AU4. Passkeys.** A signed-in account can add passkeys from the account page, name them and remove them. The sign-in page offers sign-in with a passkey next to the email field, and offers passkeys in the browser's autofill where the browser supports it, detected at run time. Removing the last passkey is allowed, because the email link always works.

**AU5. Changing the address.** A signed-in account can change its address. The new address gets a link, and the change takes effect only when that link is followed within 15 minutes. The old address gets a notice when the change is asked for, not when it takes effect, so a session in the wrong hands cannot change the address unnoticed.

**AU6. Email limits.** The server sends at most 3 sign-in or address-change emails per address per hour, and at most `MAIL_HOURLY_LIMIT` emails of all kinds per hour in total (default 300). It counts an address by its HMAC under `AUTH_SECRET`, so it stores no address that never signs in, and it deletes the counts after a day. A request over a limit is refused with `too_many_emails`. The server stores no visitor address for these limits (ADR 0003 item 8).

**AU7. Sessions.** A session lives in one cookie that is `HttpOnly`, `Secure` and `SameSite=Lax` with the `__Secure-` prefix. It lasts 30 days and is renewed at most once a day while in use. The cookie carries the session token signed with the instance secret `AUTH_SECRET`, and the server accepts a session only with a valid signature, so a copy of the database alone signs nobody in; changing `AUTH_SECRET` ends every session. Besides the token, the server stores only the session's creation time and the family of the browser that created it (such as "Firefox on Android"), never the full user agent or the visitor's address. The account page lists the sessions by creation time and browser family and can end each one or all others. Signing out ends the current session.

**AU8. Signed-in joins.** A signed-in visitor who joins an event creates a linked participant. The browser gets no browser token for it, so signing out on a shared device leaves no access behind. A linked participant is recognized on every browser where its account is signed in, and only there: linking retires every token the participant had, and a join under its name that does not come from its account, on the web or through the API, is refused with `name_in_account` before any password is tried. A signed-in visitor cannot join anonymously.

**AU9. Unlinking.** From the account page, a linked participant can be unlinked. It then stays in its event like any participant; the browser that unlinks it gets a browser token for it, so it stays joined there.

**AU10. Deleting the account.** The account page deletes the account after a confirmation. When the session is more than a day old, the page asks the visitor to sign out, sign in again and delete the account within a day. Deleting removes the account, its sessions, passkeys, providers and settings and every email of it in the outbox. Its owned events lose their owner (OW5) and its linked participants become ordinary participants; nothing else of the events changes. The admin links and the browser tokens keep working.

**AU11. Providers.** An instance offers sign-in with Google when accounts are on and `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set, and with GitHub when accounts are on and `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are set. Each provider is on or off by itself. An instance that sets only one of a pair refuses to start and names the missing one. While accounts are off, the pairs do nothing. The sign-in page shows one button for each provider that is on, and the buttons work without JavaScript. The server asks a provider for the account's identifier and email address only: the scopes `openid email` at Google and `user:email` at GitHub.

**AU12. Proved addresses.** No account exists before its address is proved. A sign-in link proves the address it was sent to. A provider proves an address only where it is authoritative for it. Google proves an address that it marks as verified and that either ends in `@gmail.com` or comes with a hosted domain. GitHub proves none: it verifies an address once and never again, so a former holder of the address could still sign in with it. GitHub's address is its primary one, unless that ends in `@users.noreply.github.com`.

The first sign-in through a provider that proves an address without an account creates the account. The new account takes the language of the page the sign-in started on.

**AU13. Confirming the address.** A signed-out sign-in through a provider that is in no account, and whose address is not proved, is missing or already has an account, signs nobody in and changes nothing. The visitor reaches the page "Confirm your address", which sends a sign-in link (AU3) to an address the visitor can edit, filled in with the provider's address when there is one. It is the same for all three reasons and shows the provider's address to nobody but the browser that signed in. The provider identity and its address travel in a cookie signed by the server for 15 minutes from the provider's answer, never in a page's address; sending the link again does not extend them. When that link, and no other way of signing in, signs in, in the same browser, to the account at the address the link went to, the provider identity joins that account as by AU14, with its notice, and signs in to it directly from then on. A link opened in another browser only signs in, and the page says so: the provider can then be added from the account page. A sign-in that the visitor stops, or that fails, returns to the sign-in page with `provider_failed`.

**AU14. Adding a provider.** A signed-in account can add each provider that is on, once, from the account page. The provider's address may differ from the account's, which does not change, and may be unproved or missing. Adding needs a session under a day old, as deleting the account does (AU10), and the browser that returns from the provider must still be signed in to the account that started. The account's address gets a notice that names the provider. A provider identity belongs to at most one account: adding one that is in another account is refused with `provider_in_other_account`. From then on that identity signs in to the account directly, whatever its address.

**AU15. Removing a provider.** The account page lists the account's providers and removes each after a question inside the page. Removing the last one is allowed, because the email link always works. Removing needs a session under a day old.

**AU16. Stored data.** Of a provider's answer the server keeps the provider's name and its identifier of the person. It keeps no token, scope, name or picture, and it keeps the address only as the address of an account created by AU12.

## 5. Ownership rules

**OW1. Claiming.** The account page lists the events the browser knows from local storage (Y5) that are not in the account, each with a button to add it, and a button to add them all. Adding an event the browser organizes sends its admin secret; the server checks it and makes the account the owner. Adding an event the browser joined links the browser's participant to the account. An event created by a signed-in visitor belongs to the account from the start; the API creates events without an owner.

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

**NT5. Unsubscribing.** Every notification email has an unsubscribe link and the `List-Unsubscribe` and `List-Unsubscribe-Post` headers of RFC 8058. The link opens a page that turns off that kind for that event with one press, without signing in; opening it alone changes nothing, because mail scanners open links. A one-click request to the `List-Unsubscribe` address turns it off at once. The link carries a value signed with `AUTH_SECRET` that names the account, the event and the kind, and nothing else.

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
| Sign-in | `/{locale}/sign-in` | The email field, the passkey button and a button for each provider (AU3, AU4, AU11). |
| Confirm your address | `/{locale}/sign-in/confirm` | Sends a sign-in link after a provider's sign-in that signed nobody in (AU13). |
| Account | `/{locale}/account` | The lists "I organize" and "I joined", each event with its name, deletion date or that it is kept, final time and link; the events of this browser not in the account (OW1); passkeys, providers, sessions, address, language, notification settings and deletion (AU4 to AU10, AU14, AU15, NT1, NT6). |
| Unsubscribe | `/{locale}/unsubscribe` | Confirms NT5. |
| Every page | | A sign-in link in the header, or the account menu when signed in, when accounts are on (AU1). |

## 10. Errors

Phase 1 section 12 and Phase 2 section 9 apply. The new codes are listed in [problem-codes.md](problem-codes.md): `sign_in_link_invalid`, `too_many_emails`, `email_not_sent`, `event_has_owner`, `wrong_admin_secret`, `passkey_not_recognized`, `confirmation_link_invalid`, `sign_in_again`, `provider_failed`, `provider_in_other_account` and `address_not_proved`.

## 11. Review

As the roadmap requires, the phase ends with a UI and UX review of the new pages and of the event, manage and start pages it changed: layout and widths, flow, copy, accessibility and behavior on a phone. Its defects are listed here and fixed before the phase is done.

The review of 23 November 2026 found these defects, all fixed:

1. On a phone the header's account link wrapped onto two lines and shrank its icon. The link now reads "Account" ("Účet") and never wraps; on a screen narrower than 26rem it shows its icon alone and keeps its words for screen readers, since "Přihlásit se" beside the two menus would push the page sideways.
2. "Remove from account" released an owned event at once, although the owner may then have no way left to manage it. Removing an event now asks inside the page first, as `DESIGN.md` asks of a destructive action. The question says that only the admin link manages a released event and that a kept event gets a deletion date again; for a joined event, it says that the participant stays joined in this browser only.
3. In the account's lists the event name, "Manage" and "Remove from account" were three links of one weight in a row. The name and its details now stand on the left, as in the list of events in this browser, and removing is an outlined destructive button.
4. Checked boxes showed the browser's own blue. Check boxes and radio buttons now take the `ink` color.
5. The page after creating an event told a signed-in organizer that the admin link cannot be recovered, although the account owns the event. It now says that the account manages the event from any browser where it is signed in.
6. The joined line offered a linked participant a password, which nothing ever asks for (AU8). The line no longer offers it.
7. The unsubscribe page did not name the event, and its confirmation led nowhere. Both now name the event, and the confirmation links to it. A link to an event that no longer exists says so instead of calling the link invalid.
8. The manage page put keeping and the visitor's emails above the final time and the event form. They now stand after the participants, before deletion, and appear only once the page has opened the event.
9. The list of signed-in browsers read "Signed in 23 November 2026", and the Czech "Přihlášen" assumed a gender. It now reads "signed in on …" ("přihlášeno …"), and the Czech account page calls keeping "ponechat" throughout.

The revision with the operator found one more, also fixed:

10. Deleting an account led to the start page with no word that it happened. The start page now says that the account is deleted and that its events keep working through their links.

The code review that followed found two more, also fixed:

11. Removing a passkey happened at once. It now asks inside the page first and says that the email link keeps working.
12. A new account got its language only when its account page first opened, not when it was created (AU3). Creating the account from a sign-in link now stores the language of the page that asked for the link, which the link's return address names.

The review kept two choices on purpose. A returning participant opens on their own grid (Y3), because they come back to change it; the group grid is one tab away. The per-event email settings stay at the end of the event page, after the participants, because they are a setting a visitor changes rarely, and their selects change nothing else on the page.

## 12. Acceptance test

Phase 5 is done when this end-to-end test passes on a clean clone in CI, with Mailpit as the mail server:

1. A visitor joins an event. With JavaScript turned off, a reload shows the participant's line and grid in the server's first response.
2. A visitor creates an event without an account, then signs in with the link read from Mailpit, adds the event to the account and turns on keeping it. The event page says that its organizer keeps it.
3. A second visitor in another browser context signs in, turns on final-time emails, and joins the event as a linked participant.
4. The organizer picks the final time. Mailpit receives the final-time email for the second visitor, and the `DTSTART` and `DTEND` of its attached `.ics` file equal the start and end of the chosen window in UTC.

## 13. Rule coverage outside the acceptance test

The tests name no rule numbers. This list is the only link from rules to tests. Each branch of the phase adds its files here.

- Unit tests of the domain cover Y2 (the derivation), OW5 (the deletion date after keeping), NT4 (the notification emails), NT5 (the signed value) and U12.
- Database tests cover Y3, Y4, AU6, AU8 to AU10, OW1 to OW6, NT1 to NT3, NT5, X5, X6 and U11 to U13 in the server functions; for AU7 and AU10 they go through Better Auth (`auth.db.test.ts`): signing out one or every other browser, and deleting with a fresh session but not with one older than a day.
- End-to-end tests cover Y1, Y3 and Y4 (a browser that held a token in local storage before the change), AU3 to AU5, AU7 and AU10 with Mailpit, AU4 with a virtual authenticator, OW3, NT1 and NT5.

Files so far:

- Y1 and Y2: `apps/web/src/server/browser-key.ts` (the cookie, its value of key and renewal date, the derived token); the daily renewal in `apps/web/src/proxy.ts`, which also tells the server whether the request came over HTTPS. An instance served over plain HTTP gets the cookie `convenr-key` without the `__Host-` prefix, which needs a secure origin; a secure instance reads only the prefixed cookie. Tested in `browser-key.test.ts`.
- Y3, Y4 and Y6: the actions in `apps/web/src/server/participant-actions.ts` read the cookie and pass no token to the page; `join` takes the browser's token, `moveToken` and `forgetToken` in `apps/web/src/server/participants.ts`, tested in `participants.db.test.ts`. "Not you?" removes the browser's token for the event and keeps the participant. The event page renders the recognized participant (`apps/web/src/app/[locale]/e/[segment]/page.tsx`), and `apps/web/src/components/event/use-participation.ts` moves an old token and notices a participant the server no longer knows. Tested in `apps/web/e2e/identity.spec.ts`; the dropped participant in `freshness.spec.ts`.
- Y5: `apps/web/src/lib/local-events.ts` keeps the name only.
- AU1: the settings and the `accounts` switch in `apps/web/src/env.ts`, tested in `env.test.ts`; `auth()` in `apps/web/src/server/auth.ts` is undefined while accounts are off, the route `apps/web/src/app/api/auth/[...all]/route.ts` and the sign-in and account pages answer 404, and `apps/web/src/components/page-shell.tsx` shows no sign-in link. Tested in `apps/web/e2e/accounts.spec.ts` on the second server, which has no mail settings.
- AU2 to AU5 and AU7: Better Auth with the email-link and passkey plugins in `apps/web/src/server/auth.ts`, the Server Actions in `apps/web/src/server/account-actions.ts`, the pages `apps/web/src/app/[locale]/sign-in/page.tsx` and `apps/web/src/app/[locale]/account/page.tsx`, and the passkey buttons `apps/web/src/components/passkey-sign-in.tsx` and `add-passkey.tsx`. Sessions keep the browser family from `apps/web/src/domain/browser-family.ts` and no address. The tables are in `apps/web/src/db/schema.ts`, migration `0008_accounts.sql`. The email texts are in `apps/web/src/server/email/emails.tsx`, in the one MJML layout `layout.tsx` with the email tokens that `mise run theme` generates from `DESIGN.md` (NT4 for these emails), tested in `emails.test.ts`. Tested in `apps/web/e2e/accounts.spec.ts` with Mailpit (`apps/web/e2e/mail.ts`) and a virtual authenticator, and in `browser-family.test.ts`.
- AU7: a session needs the cookie signed with `AUTH_SECRET`; the token from the database alone, or signed with another secret, signs nobody in. Tested in `apps/web/src/server/auth.db.test.ts`.
- AU11, AU12 and AU16 on the server: the settings in `apps/web/src/env.ts`; the decision whether an address is proved in `apps/web/src/domain/provider-address.ts`, tested in `provider-address.test.ts`; the providers as Better Auth takes them in `apps/web/src/server/providers.ts`; the hooks in `apps/web/src/server/auth.ts` that refuse an account with an unproved address and drop tokens, scopes, names and pictures. Tested with the providers' own code and stubbed answers in `apps/web/src/server/provider-sign-in.db.test.ts`.
- AU11 and AU13, the pages: the buttons `apps/web/src/components/provider-button.tsx` with the marks `provider-mark.tsx`; the page `apps/web/src/app/[locale]/sign-in/provider/route.ts`, which forwards to the provider; `apps/web/src/app/[locale]/sign-in/confirm/page.tsx`; the signed cookie with the provider identity and its address in `apps/web/src/server/pending-sign-in.ts` (tested in `pending-sign-in.test.ts`), set in `apps/web/src/app/api/auth/[...all]/route.ts`; the link's return `apps/web/src/app/[locale]/sign-in/attach/route.ts` with the decision in `apps/web/src/server/attach-provider.ts` (tested in `provider-sign-in.db.test.ts`). Tested in `apps/web/e2e/provider-sign-in.spec.ts`, where `provider-answers.mts` answers the server's requests to the providers.
- AU14 and AU15: the list and the buttons in `apps/web/src/app/[locale]/account/page.tsx` with `accountProviders` in `apps/web/src/server/account-providers.ts`; adding in `apps/web/src/app/[locale]/sign-in/provider/route.ts` and removing in `removeProviderAction` of `apps/web/src/server/account-actions.ts`, both with `isFresh` of `apps/web/src/server/session.ts`, tested in `session.db.test.ts`. The question before a removal is `apps/web/src/components/remove-question.tsx`. Tested in `apps/web/e2e/provider-sign-in.spec.ts` and `apps/web/src/server/provider-sign-in.db.test.ts`.
- AU14, once: the constraints `auth_accounts_identity` and `auth_accounts_provider` (migration `0016_unique_providers.sql`).
- AU14, the notice: `noticeProvider` in `apps/web/src/server/auth.ts` and `providerNotice` in `apps/web/src/server/email/emails.tsx`.
- OW1 for organized events, OW2 and OW3: `claimEvent`, `ownedEvents` and `owns` in `apps/web/src/server/ownership.ts` with the column `events.owner_id` (migration `0009_ownership.sql`), and `AdminAccess` in `apps/web/src/server/manage.ts`, which lets the admin secret or the owning account manage an event. The manage page sends a `ManageCredential` (`apps/web/src/lib/manage-credential.ts`) and asks as the owner when it holds no secret that fits. The account page lists owned events (`apps/web/src/components/account/account-events.tsx`) and the events this browser organizes that are not in the account (`claim-events.tsx`); the event page shows the owner the manage link. Tested in `ownership.db.test.ts` and in `apps/web/e2e/accounts.spec.ts`.
- AU8, AU9 and OW1 for joined events: the column `participants.account_id`, unique per event (migration `0010_linked_participants.sql`). `Holder` in `apps/web/src/server/event-rows.ts` names a participant by token or by account, and `currentHolder` in `apps/web/src/server/holder.ts` prefers the signed-in account's participant. `joinLinked`, `linkHeld` and `unlink` in `apps/web/src/server/participants.ts`; the join action joins a signed-in visitor as the account and retires the browser's token, and the join band shows no "Not you?" for the account's participant. The account page lists the joined events (`joinedEvents` in `ownership.ts`) with a button to remove each from the account. Tested in `linked-participants.db.test.ts` and in `apps/web/e2e/accounts.spec.ts`.
- OW4 to OW6 and X5: the column `events.kept_until` holds the keeping in one value: null when never kept, `infinity` while kept, the instant it ended otherwise; the check `events_kept_by_owner` allows `infinity` only on an owned event, and the trigger `events_keeping_ends_with_owner` ends the keeping whenever the event loses its owner, by release or with the account (migrations `0011_keeping.sql` and `0012_keeping_ends_with_owner.sql`, which also announces every version change, including one a trigger makes). `keepingOf` and `storedKeeping` in `apps/web/src/server/event-rows.ts` are the only TypeScript that knows the stored form. `deletionOf` in `apps/web/src/domain/retention.ts` gives the deletion date or who keeps the event, tested in `retention.test.ts`; the purge in `apps/web/src/server/maintenance.ts` follows it. `setKeeping`, `releaseEvent` and `ownerView` in `apps/web/src/server/ownership.ts`; `ownerView` decides what the event and manage pages show the owner, including the switch `apps/web/src/components/keep-event.tsx`, and the account page has the button to remove an owned event in `account-events.tsx`. Tested in `keeping.db.test.ts`, `live.db.test.ts` and `apps/web/e2e/accounts.spec.ts`.
- AU6: `takeEmailSlot` in `apps/web/src/server/mail.ts` counts an HMAC of each address and the instance total per hour. Tested in `mail.db.test.ts`.
- X6 for sign-in data: the statement `CLEAN_SIGN_IN` of the pass in `apps/web/src/server/maintenance.ts`; Better Auth deletes a sign-in link when it is used. The pass runs in the application (ADR 0010): `maintain` in `apps/web/src/server/maintain.ts`, from the server's timer and from `apps/web/src/app/api/maintenance/route.ts`, which the workflow `maintenance.yml` calls. Tested in `maintain.db.test.ts`.
- NT1 to NT5 and X6 for the outbox: the settings `account_notifications` and `event_notifications`, the digests `response_digests`, `events.reminded_sequence` and the outbox `outbox_emails` (migration `0013_notifications.sql`). `apps/web/src/server/notifications.ts` decides who gets which kind and writes the outbox in the transaction of the change: `noteResponse` from `apps/web/src/server/responses.ts` and `participants.ts`, `noteFinal` from `final.ts`, and `queueDue` in the maintenance pass for digests and reminders. `deliverOutbox` in `apps/web/src/server/outbox.ts` reads the address and language when it sends, drops an email whose final time has changed since, retries a failed one and deletes it after the last attempt; `sendSoon` sends after the response. The emails are `notificationEmail` in `apps/web/src/server/email/emails.tsx`. The account page, `apps/web/src/components/event-notifications.tsx` on the event and manage pages, and the page `apps/web/src/app/[locale]/unsubscribe/page.tsx` with the one-click route `apps/web/src/app/api/unsubscribe/route.ts` set the choices; the signed value is `apps/web/src/server/unsubscribe-value.ts`. Tested in `notifications.db.test.ts`, `emails.test.ts`, `unsubscribe-value.test.ts` and `apps/web/e2e/accounts.spec.ts`.
- U11 to U13: migration `0014_organizers.sql`. The trigger `auth_users_counted` counts each account Better Auth creates. The table `organizers` keeps the two earliest created events of each account that ever owned one, written by the triggers `events_owner_created` and `events_owner_gained`, so the count outlives deleted and released events and goes with the account. The statement `COUNT_ORGANIZERS` of the pass in `apps/web/src/server/maintenance.ts` counts each account once, at `RETURN_AGE_DAYS` in `apps/web/src/domain/usage.ts`, whose `usageReport` prints the two columns. Tested in `usage.db.test.ts` and `usage.test.ts`.
- The acceptance test: `apps/web/e2e/organizer-account.spec.ts`, with the browsers and sign-in of `apps/web/e2e/accounts.ts` and the attachments read from Mailpit in `mail.ts`. Y3 without JavaScript for a dated event: `serverGridOf` in `apps/web/src/server/board.ts` lays the grid out in the reference zone (ADR 0011), and `useBoardView` in `apps/web/src/components/event/board-view.ts` keeps it until the browser knows the viewer's zone; a recognized participant starts on their own grid in `event-board.tsx`.
