# ADR 0004: API credentials

Status: accepted, 2026-11-18. It replaces the transport and the format in items 2 and 3 of [ADR 0003](0003-identifiers-and-secrets.md); everything else in ADR 0003 holds.

## Context

The public REST API of phase F3 needs the admin secret and the participant token on every request that changes something. ADR 0003 sends both in the request body, which suits Server Actions but not an HTTP API: a client library, a proxy and an OpenAPI description all expect credentials in a header. The two secrets also look alike, so nothing tells a client, a log scrubber or a secret scanner which one it holds.

## Decision

1. **Typed secrets.** A secret starts with a prefix that names its kind: `cva_` for an admin secret and `cvp_` for a participant token, followed by 32 random bytes in base64url. The server stores the SHA-256 hash of the whole string, prefix included.
2. **One header.** The API reads both secrets from `Authorization: Bearer <secret>`, the scheme of RFC 6750. Each endpoint accepts one kind. A secret of the other kind is refused with its own problem code, so a mix-up is easy to see.
3. **Never in an address.** A request that carries a secret in its query string is refused, whatever the endpoint. The admin link keeps the secret in the URL fragment, as ADR 0003 item 2 says.
4. **Refusals reveal nothing.** A missing secret, a wrong secret and a secret for an event that does not exist all get the same `401` response with `WWW-Authenticate: Bearer`. A response cannot tell a caller that an event exists.
5. **No caching.** A response that returns a secret sends `Cache-Control: no-store`.
6. **The web keeps the body.** The web pages call Server Actions, which still take the secret in the request body. They use the same prefixed secrets and the same server functions as the API.

## Consequences

- Secrets issued before this ADR have no prefix and stop working. No instance was deployed when this was decided.
- `Authorization` is not a CORS-safelisted header, so a browser on another site sends a preflight request first. The API answers it.
- GitHub secret scanning and log filters can match the prefixes.
