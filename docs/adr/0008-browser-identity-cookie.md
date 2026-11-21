# ADR 0008: One cookie for the browser's identity

Status: accepted, 2026-11-21. It replaces item 10 of ADR 0003; the rest of that ADR stands.

## Context

Since Phase 1 a browser keeps each participant token in local storage (ADR 0003 item 10). The server sees a token only when the page's script sends it, so the server cannot render the joined state: the page first shows the join form and then swaps in the participant's line and grid. The roadmap lists this for F5.

ADR 0003 rejected cookies because a cookie per event adds up: every request carries all of them, and browsers cap the number of cookies per site. A single cookie that maps a browser to its participations on the server avoids the cap, but it gives the server a lasting identifier that ties one browser to all its events. The roadmap rules such an identifier out (principle 2, section 5).

## Decision

1. **One cookie.** `__Host-convenr-key` holds 32 random bytes in base64url. It is `HttpOnly`, `Secure`, `SameSite=Lax` and `Path=/`, lives 400 days (the most browsers allow) and is renewed when a response finds it more than a day old. The server sets it on the first join or password proof, never for a visitor who only reads.
2. **Derived tokens.** A browser's token for an event is `HMAC-SHA-256(key, eventId)`. The server stores its SHA-256 hash among the participant's tokens (ADR 0003 item 3), never the key. Stored data therefore cannot tie two events to one browser; only a request that carries the cookie can, and requests are not logged (ADR 0003 item 8).
3. **No token on the page.** Server Actions read the cookie. The page's script never sees a participant token, so a cross-site scripting flaw can no longer read one.
4. **Moving old tokens.** A page that finds a participant token in local storage sends it once; the server adds the derived token's hash to that participant, and the page deletes the stored token.
5. **The API is unchanged.** API clients keep their `cvp_` tokens in `Authorization` (ADR 0004). The cookie is not read under `/api/v1`.

## Consequences

- The event page arrives already joined, also without JavaScript.
- Clearing cookies loses every participation of a browser, as clearing local storage does today. A password still recovers a participant.
- A request to another site cannot use the cookie for a state change: `SameSite=Lax` keeps it off cross-site `POST`s, and Next.js checks the origin of a Server Action.
- Rollback: the derived hashes stay valid tokens, so a release before this one ignores the cookie and shows the join form; participants recover by name and password.
