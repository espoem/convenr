# ADR 0003: Identifiers and secrets

Status: accepted, 2026-11-16.

## Context

convenr has no accounts in its first phases. Access depends on three things: knowing an event's address, holding the organizer's secret, and holding a participant's secret or password. Each must be hard to guess and none may be stored in a form that leaks it.

## Decision

1. **Event id.** 12 characters from a 57-character alphabet that leaves out look-alike characters (`0`, `O`, `1`, `l`, `I`). It is generated from the operating system's secure random source and gives about 70 bits. It appears in the address and is not a secret, but it cannot be enumerated. The address also carries a slug made from the event name, as `/e/{slug}-{id}`. Routing uses only the id, which is the text after the last hyphen. The slug is never used to find or authorize anything, and a wrong slug redirects to the current one.
2. **Admin secret.** 32 random bytes, shown as base64url. The admin link carries it in the URL fragment: `/e/{slug}-{id}/manage#{secret}`. A fragment is not sent to the server in the request line and does not appear in referrer headers. The page reads it and sends it in a request header. The server stores only its SHA-256 hash.
3. **Participant token.** 32 random bytes, base64url. The browser keeps it in local storage and sends it in a request header. The server stores only its SHA-256 hash. One participant may have several tokens.
4. **Why SHA-256 for secrets.** The secrets are long and random, so a fast hash is enough and lookups stay cheap.
5. **Password hash.** Argon2id with a per-password random salt, using the parameters OWASP currently recommends as its minimum for Argon2id. The parameters are stored with each hash so they can be raised later. The implementation is the runtime's built-in one if the pinned Node.js LTS has it, otherwise a maintained native binding. F0 records which.
6. **Comparison.** Secrets and hashes are compared in constant time.
7. **Lockout.** Failed password attempts are counted on the participant row (spec rule P7). No visitor address is stored for this.
8. **No secrets in logs.** Request logging records neither headers nor fragments. The address of a visitor is not written to logs or to the database.
9. **Deleting.** Deleting a participant deletes its tokens and password hash. Deleting an event deletes everything that refers to it, through foreign keys with cascading delete.

## Consequences

- A lost admin link or forgotten password cannot be recovered, by design.
- Anyone with the share link can read the event. Anyone with the share link who knows the name of a participant without a password can edit that response. The page says so where a password can be set.
- Counting failed attempts per participant lets a stranger lock a named participant out for 15 minutes at a time. This is accepted for now. Protection against automated abuse is an open decision in the roadmap and must be settled before the public launch.
