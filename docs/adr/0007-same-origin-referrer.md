# ADR 0007: Referrer policy `same-origin`

Status: accepted, 2026-11-19. It replaces the referrer policy in item 9 of ADR 0003; the rest of that item stands.

## Context

ADR 0003 item 9 made every page send `Referrer-Policy: no-referrer`, so that an event's address never reaches another site through a link. An event's address is the key to the event.

Phase 4 adds forms that must work without JavaScript, starting with the theme menu. Without JavaScript a Next.js Server Action is a plain form `POST` to the page. Under `no-referrer` the browser sends that `POST` with `Origin: null`, as the Fetch standard requires. Next.js compares `Origin` with the host to stop cross-site request forgery, so it rejects the request. With JavaScript the same action is a `fetch` that still carries the origin, which is why the problem showed only without scripts.

## Decision

Every page sends `Referrer-Policy: same-origin`.

- A request to another site carries no referrer, as before, so an event's address still never leaves convenr through a link.
- A request to convenr itself carries the full referrer and the real `Origin`, so a Server Action posted by a plain form passes the Next.js origin check.
- The admin secret stays in the URL fragment (ADR 0003 item 2), which no referrer ever contains.

## Consequences

- Any form built on a Server Action works without JavaScript; the theme menu is the first.
- A request to convenr now carries a `Referer` header naming the previous convenr page. ADR 0003 item 8 keeps headers out of the logs, so it is not recorded.
- Rollback: send `no-referrer` again. Forms without JavaScript then fail again; nothing else changes.
