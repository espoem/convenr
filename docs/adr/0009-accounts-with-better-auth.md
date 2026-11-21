# ADR 0009: Accounts with Better Auth

Status: accepted, 2026-11-21.

## Context

Phase 5 adds optional accounts: sign-in by an email link, passkeys, sessions, and later sign-in with Google, Facebook, Seznam and GitHub. The options compared on 2026-11-20 from the projects' registries, releases and advisories:

- **Own module** from small parts: `@simplewebauthn/server` and `@simplewebauthn/browser` for passkeys, own links and sessions, and an OAuth client such as Arctic later. All tables and queries stay ours, but the security code is ours to keep correct.
- **Better Auth** (MIT): email links, passkeys and generic OAuth 2.0 with PKCE as plugins, and a Drizzle adapter. Releases come almost daily, and 2026 brought advisories, among them a critical one fixed in 1.7.7 (an OAuth state usable as a sign-in link) and one fixed in 1.7.16 (an unverified provider email treated as verified).
- **Auth.js v5**: still a beta, with passkeys marked as not ready for production.
- **An external identity provider** (Keycloak, Zitadel, Authentik): a second service to run, against D7 and the goal of low running cost.

The operator chose Better Auth: it covers every sign-in method F5 and its later OAuth step need, Seznam included through generic OAuth, and its fixes reach us through upgrades.

## Decision

1. **Better Auth** with its email link plugin, its passkey plugin and the Drizzle adapter for PostgreSQL. The version is pinned at or above the newest advisory fix and upgraded on purpose, reading its advisories each time.
2. **Its tables, our migrations.** Better Auth's schema (`user`, `session`, `account`, `verification`, `passkey`) is generated once into the Drizzle schema, and `mise run db:generate` turns it into our SQL migrations. An upgrade that changes the schema gets its own migration, which must leave the previous release working.
3. **One exception to explicit queries.** Only Better Auth's adapter writes to its tables. Our code reads them with explicit queries and links to them by foreign key (owner, linked participant, notification settings), but never writes to them.
4. **No visitor addresses.** Better Auth's rate limiter, which keys on the visitor's address, is off, and its IP tracking is disabled. AU6 of the Phase 5 spec limits emails by an HMAC of the email address instead. A session stores only the family of the browser, reduced from the user agent before it is written.
5. **No name.** Better Auth requires `user.name`; it is stored empty and never shown.
6. **Routes and policy.** Better Auth serves `/api/auth/*`, outside `/api/v1`, so it is not part of the public API or its OpenAPI document. Its client calls these routes from our own scripts, so the Content Security Policy of ADR 0003 item 9 stays as it is.
7. **Settings.** Accounts are on only when `SMTP_URL`, `MAIL_FROM`, `AUTH_SECRET` and `PUBLIC_URL` are all set (spec AU1). Email goes through SMTP with nodemailer, so any provider works; Vercel allows ports 465 and 587.

## Consequences

- A security fix in Better Auth reaches convenr only through an upgrade, so its advisories are part of dependency upkeep.
- Better Auth decides how its tables are queried. A query of ours that needs its data reads the table directly and is covered by a database test, so an upgrade that renames a column fails a test.
- Sign-in with Google, Facebook, Seznam and GitHub uses the generic OAuth plugin. Seznam speaks plain OAuth 2.0 without OpenID Connect, and its email can be missing, so a provider sign-in joins an existing account only from inside a signed-in session.
- Rollback: a release before accounts ignores Better Auth's tables. Turning accounts off on an instance is removing one of the AU1 settings.
