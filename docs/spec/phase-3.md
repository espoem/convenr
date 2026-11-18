# Phase 3 functional specification: public API and SDKs

Status: agreed 2026-11-18. This document defines Phase F3 of the [roadmap](../roadmap.md). It builds on the [Phase 1](phase-1.md) and [Phase 2](phase-2.md) specifications: every earlier rule still holds unless a rule here replaces it. The time model is in [ADR 0002](../adr/0002-time-representation.md), identifiers and secrets in [ADR 0003](../adr/0003-identifiers-and-secrets.md), and API credentials in [ADR 0004](../adr/0004-api-credentials.md). Problem codes are listed in [problem-codes.md](problem-codes.md).

The spec is written as domain rules. Each rule has an id so that the spec can map it to code and tests; code and tests do not cite the ids.

## 1. Scope

In Phase 3 everything a person can do on the web pages can also be done through a versioned REST API. The API is described by an OpenAPI 3.1 document built from the same validation schemas the server uses, and a TypeScript SDK and a Python SDK are generated from that document. The application serves a reference page for the API.

Phase 3 does not include:

- publishing the SDKs to npm or PyPI; the packages are ready to publish, and publishing is decided before the public launch;
- an interactive "try it" console on the reference page;
- rate limits and other protection against automated abuse (roadmap decision D5);
- idempotency keys for retried requests;
- pushing changes to clients (Phase 2 rule F6).

## 2. Terms

- **API:** the HTTP endpoints under `/api/v1`.
- **Admin secret, participant token:** the two secrets of ADR 0004, with the prefixes `cva_` and `cvp_`.
- **Problem:** a refused request, described by a stable code.
- **Breaking change:** a change after which a client written for the earlier description fails. Rule A9 lists what is not breaking.

## 3. API rules

**A1. Base path and version.** Every endpoint lives under `/api/v1`. A breaking change gets a new version, `/api/v2`, and the earlier version keeps working alongside it until a later decision retires it.

**A2. Same rules as the web.** An endpoint calls the same server function as the matching web action, so every rule of Phases 1 and 2 applies to it unchanged. The web pages keep calling Server Actions and do not go through the API.

**A3. Endpoints.**

| Method and path | Secret | Effect |
|---|---|---|
| `POST /api/v1/events` | none | Creates an event (E1 to E6). Returns `201` with the event and its admin secret. |
| `GET /api/v1/events/{id}` | none | The event, its slots and every participant with their availability. |
| `GET /api/v1/events/{id}/windows` | none | The best windows (W1 to W3). Query parameters `minMinutes` and `minPeople` set the filters of W2. |
| `PATCH /api/v1/events/{id}` | admin | Changes the event (M2 to M5). |
| `DELETE /api/v1/events/{id}` | admin | Deletes the event (M8). |
| `DELETE /api/v1/events/{id}/participants/{participantId}` | admin | Deletes a participant (M7). |
| `POST /api/v1/events/{id}/participants` | none, or the password of P4 | Joins (P4). Returns the participant and a participant token. |
| `GET /api/v1/events/{id}/participants/me` | participant | The participant the token belongs to. |
| `PUT /api/v1/events/{id}/participants/me/availability` | participant | Replaces the availability as a whole (R2 to R4). |
| `PUT /api/v1/events/{id}/participants/me/password` | participant | Sets or changes the password (P6). |
| `DELETE /api/v1/events/{id}/participants/me/password` | participant | Removes the password (P6). |
| `DELETE /api/v1/events/{id}/participants/me` | participant | Leaves the event (P9). |
| `GET /api/v1/openapi.json` | none | The OpenAPI document (G1). |

"None" means the request needs no secret: knowing the event id is enough, as with the share link (V1). A participant changes only their own data, through `me`. Another participant's id appears in a path only on the organizer's endpoint.

**A4. Format.** Requests and responses are JSON in UTF-8. A request body is at most 64 KB. A request body of another type, invalid JSON or a body that does not match the schema is refused with a problem (A8).

**A5. Schedule.** An event has a `schedule` object tagged by `mode`, which alone decides the kind of event:

- `mode: "dates"` with `dates` (a list of `YYYY-MM-DD`), or `mode: "range"` with `first` and `last`. Their slots are `{ "start": "2027-04-05T07:00:00Z" }`, an RFC 3339 instant in UTC.
- `mode: "weekdays"` with `weekdays` (a list of ISO days, 1 for Monday to 7 for Sunday). Its slots are `{ "weekday": 1, "minute": 1080 }`, a wall-clock time in the reference zone (ADR 0002).

Every mode also has `dailyStart` and `dailyEnd` (`HH:MM`, with `24:00` allowed as the end) and `slotMinutes` (15, 30 or 60). In a response the schedule also holds `slots`, every slot of the event in time order. A request sends the schedule without `slots`, because the server derives them (E4, E5).

**A6. Event and participants.** A response describes an event with `id`, `name`, `description`, `referenceZone`, `firstDayOfWeek`, `schedule`, `retention` and `participants`. `retention` is `{ "kind": "until", "date": "YYYY-MM-DD" }` or `{ "kind": "kept" }` (X2). Each participant is `{ id, name, availability }`. The id is the participant's public id (A7). The availability is a list of slots in the same shape as the schedule's `slots`. A response says nothing about a participant's password, not even whether one is set.

**A7. Nothing internal.** A response carries no database key, no internal slot key, no hash and no secret other than the one just issued. A participant has a public id: 12 characters from the alphabet of ADR 0003 item 1, made when the participant joins. Its database key stays inside the server.

**A8. Problems.** A refused request gets an RFC 9457 response of type `application/problem+json` with `status`, `title`, `code` and, when input fields are at fault, `errors`: a list of `{ "pointer": "/schedule/dates/2", "code": "date_in_past" }`, where the pointer is an RFC 6901 JSON Pointer into the request body. The code is a snake_case name that a reader understands without the docs. [problem-codes.md](problem-codes.md) lists every code with its HTTP status and the rules behind it.

**A9. Forward compatibility.** Within one version, these changes are not breaking and may happen at any time: a new field in a response, a new optional request field or query parameter, a new endpoint, a new problem code and a new value of a response enum. A client must therefore ignore fields it does not know, handle an unknown problem code as a general failure that keeps its `code`, and accept enum values it does not know. Removing or renaming a field, making an optional request field required and changing a field's type are breaking.

**A10. Conditional read.** `GET /api/v1/events/{id}` sends the event's version (F5) as an `ETag`. A request with a matching `If-None-Match` gets `304 Not Modified` with no body, so a client can check for changes cheaply.

**A11. Cross-origin use.** The API allows requests from any origin without credentials (`Access-Control-Allow-Origin: *`), answers preflight requests, and lists `Authorization`, `Content-Type` and `If-None-Match` as allowed headers. No cookie is read or set.

**A12. Unknown and expired events.** An event id that does not exist or has expired (X3) gets `404` with the code `not_found` on an endpoint that needs no secret. On an endpoint that needs a secret, it gets the `401` of rule K3, so the answer does not reveal whether the event exists.

## 4. Credential rules

**K1. Header.** A secret travels only in `Authorization: Bearer <secret>` (ADR 0004).

**K2. Kind.** An endpoint that needs an admin secret refuses a participant token, and the other way round, with the code `wrong_secret_kind`.

**K3. Refusal.** A missing or wrong secret gets `401` with `WWW-Authenticate: Bearer` and the code `unauthorized`. The response is the same whether the event exists or not.

**K4. Query string.** A request whose query string holds a value that starts with `cva_` or `cvp_`, or a parameter named `token`, `secret` or `access_token`, is refused with `400` and the code `secret_in_query`, on every endpoint.

**K5. No caching.** A response that returns a secret sends `Cache-Control: no-store`. So does every response to a request that carried one.

**K6. Logs.** Phase 1 rules and ADR 0003 item 8 apply to the API as well: no header, request body or query string is logged.

## 5. Description and SDK rules

**G1. OpenAPI document.** The OpenAPI 3.1 document is built from the zod schemas that validate requests and shape responses, with zod's own JSON Schema output: input schemas for requests, output schemas for responses. A check that JSON Schema cannot express stops the build instead of disappearing from the document. Paths and operations are described by hand in one module. The server serves the document at `/api/v1/openapi.json`, and the repository holds a copy that CI compares with a freshly built one.

**G2. Tagged schedule.** The schedule is a `oneOf` with a `discriminator` on `mode` (A5), so both SDKs can narrow it.

**G3. Document checks.** CI lints the document with Redocly CLI, and `oasdiff` fails CI when the document changes in a way that is breaking under A9 compared with `main`.

**G4. SDKs.** The TypeScript SDK is generated with `@hey-api/openapi-ts` into `packages/sdk-ts`. The Python SDK is generated with `openapi-python-client` into `packages/sdk-python`. Both are committed. CI generates them again and fails when the result differs from the committed code. Both follow A9: they keep unknown fields and problem codes instead of failing on them.

**H1. Reference page.** The application serves a reference page at `/{locale}/api`, in Czech and English. The server renders it from the OpenAPI document. It uses the tokens of `DESIGN.md`, loads no client script, and fits the Content Security Policy of ADR 0003 item 9.

## 6. Errors

[problem-codes.md](problem-codes.md) adds an API section with the codes of A4, A8, K2, K3 and K4 and the HTTP status of every code. The web shows the same codes as messages, as before.

## 7. Acceptance test

Phase 3 is done when this test passes on a clean clone in CI, against a running instance with an empty database:

1. The test suite of the TypeScript SDK (Vitest) creates a dated event, joins two participants, saves an availability for each, and reads the event back. The overlap it computes from the read equals the best window that `/windows` returns.
2. The test suite of the Python SDK (pytest) does the same with a weekday event.
3. Both suites check that a participant token is refused on an admin endpoint with `wrong_secret_kind`, and that a second read with the returned `ETag` gets `304`.

## 8. Rule coverage outside the acceptance test

Rule coverage is listed by test file once the tests exist, as in the earlier phases.
