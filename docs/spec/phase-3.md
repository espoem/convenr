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
| `POST /api/v1/events/{id}/participants` | none, or the password of P4 | Joins (P4, A16). Returns `200` with the participant and a participant token. |
| `GET /api/v1/events/{id}/participants/me` | participant | The participant the token belongs to. |
| `PUT /api/v1/events/{id}/participants/me/availability` | participant | Replaces the availability as a whole (R2 to R4). |
| `PUT /api/v1/events/{id}/participants/me/password` | participant | Sets or changes the password (P6, A16). |
| `DELETE /api/v1/events/{id}/participants/me/password` | participant | Removes the password (P6). |
| `DELETE /api/v1/events/{id}/participants/me` | participant | Leaves the event (P9). |
| `GET /api/v1/openapi.json` | none | The OpenAPI document (G1). |

"None" means the request needs no secret: knowing the event id is enough, as with the share link (V1). A participant changes only their own data, through `me`. Another participant's id appears in a path only on the organizer's endpoint.

A path that has `GET` also answers `HEAD`. Every other method of `GET`, `HEAD`, `POST`, `PUT`, `PATCH` and `DELETE` that a path in the table does not list gets `405` with the code `method_not_allowed` and an `Allow` header that lists the path's methods, after the query string check of K4. Any other path under `/api/v1` gets `404` with `not_found` for every method, `OPTIONS` included. A method outside these seven is refused by the framework with an empty `400` before the API sees it.

An `{id}` or `{participantId}` that is not a public id (ADR 0003 item 1, A7) cannot exist: it gets `not_found` on an endpoint that needs no secret, and the `401` of K3 on one that does, after the secret's kind is checked (K2).

**A4. Format.** Requests and responses are JSON in UTF-8. A request body is at most 64 KB. A request body of another type, invalid JSON or a body that does not match the schema is refused with a problem (A8). A request object holds only the fields its schema names: an unknown field, such as a misspelt optional one, is refused with `invalid_request` and the field code `not_allowed` at its pointer, so a typo never passes as a missing field. Query parameters an endpoint does not name are ignored.

**A5. Schedule.** An event has a `schedule` object tagged by `mode`, which alone decides the kind of event:

- `mode: "dates"` with `dates` (a list of `YYYY-MM-DD`), or `mode: "range"` with `first` and `last`. Their slots are `{ "start": "2027-04-05T07:00:00Z" }`, an RFC 3339 instant in UTC.
- `mode: "weekdays"` with `weekdays` (a list of ISO days, 1 for Monday to 7 for Sunday). Its slots are `{ "weekday": 1, "minute": 1080 }`, a wall-clock time in the reference zone (ADR 0002).

Every mode also has `dailyStart` and `dailyEnd` (`HH:MM`, with `24:00` allowed as the end) and `slotMinutes` (15, 30 or 60). In a response the schedule also holds `slots`, every slot of the event in time order. A request sends the schedule without `slots`, because the server derives them (E4, E5).

**A6. Event and participants.** A response describes an event with `id`, `name`, `description`, `referenceZone`, `firstDayOfWeek`, `schedule`, `retention` and `participants`. `retention` is `{ "kind": "until", "date": "YYYY-MM-DD" }` or `{ "kind": "kept" }` (X2). Each participant is `{ id, name, availability }`. The id is the participant's public id (A7). The availability is a list of slots in the same shape as the schedule's `slots`. A response says nothing about a participant's password, not even whether one is set.

**A7. Nothing internal.** A response carries no database key, no internal slot key, no hash and no secret other than the one just issued. A participant has a public id: 12 characters from the alphabet of ADR 0003 item 1, made when the participant joins. Its database key stays inside the server.

**A8. Problems.** A refused request gets an RFC 9457 response of type `application/problem+json` with `type`, `status`, `title`, `code` and, when input fields are at fault, `errors`: a list of `{ "pointer": "/schedule/dates/2", "code": "date_in_past" }`, where the pointer is an RFC 6901 JSON Pointer into the request body. `type` is `https://convenr.party/problems/` followed by the code. It is an identifier: a client compares it as a string and never needs to fetch it. The address resolves to the code's description on the reference page of H1, in the visitor's language. `title` is a short English text that is the same for every problem with that code; a client shows its own message by `code` instead. The code is a snake_case name that a reader understands without the docs. A field error's code is a rule code or one of the closed set of field codes, such as `required` or `too_long`. [problem-codes.md](problem-codes.md) lists every code and field code with its HTTP status and the rules behind it. An error inside the server gets `500` with the code `internal_error` and `Cache-Control: no-store`; the server logs only the class of the error, never its message, since a query's message holds its parameters (K6).

**A9. Forward compatibility.** Within one version, these changes are not breaking and may happen at any time: a new field in a response, a new optional request field or query parameter, a new endpoint, a new problem code, a new field code and a new value of a response enum. A client must therefore ignore fields it does not know, handle an unknown problem code as a general failure that keeps its `code`, and accept enum values it does not know. Responses carry fields a client does not know; requests may not (A4), so a client sends only the fields of the version it was written for. Removing or renaming a field, making an optional request field required and changing a field's type are breaking.

**A10. Conditional read.** `GET /api/v1/events/{id}` sends the event's version (F5) as an `ETag`. A request with a matching `If-None-Match` gets `304 Not Modified` with no body, so a client can check for changes cheaply.

**A11. Cross-origin use.** The API allows requests from any origin without credentials (`Access-Control-Allow-Origin: *`), answers preflight requests, and lists `Authorization`, `Content-Type` and `If-None-Match` as allowed headers. It exposes `Allow`, `ETag`, `Location`, `Retry-After` and `WWW-Authenticate` to scripts. Either list may grow within a version; adding a header is not breaking. No cookie is read or set.

**A12. Unknown and expired events.** An event id that does not exist or has expired (X3) gets `404` with the code `not_found` on an endpoint that needs no secret. On an endpoint that needs a secret, it gets the `401` of rule K3, so the answer does not reveal whether the event exists. An expired event behaves as unknown in every server function, before any name, password or token is looked at: no token is issued and no failed attempt counted for it.

**A13. Changing an event.** `PATCH /api/v1/events/{id}` changes the top-level fields it names, each on its own, and keeps the stored value of every field it leaves out. `schedule` is replaced as a whole: a request that names it sends every field of A5 for its mode. A change after which every value is the same as before, `{}` included, writes nothing, keeps the version and the deletion date, and returns `200` with the event as it is. A successful change returns `200` with the changed event.

**A14. Confirming lost availability.** A change that removes slots from participants' availability (M5) is refused with `409` and the code `confirmation_required`, whose `losing` says how many participants lose part of their availability. The client repeats the same change with `confirmedLosing` set to that number. When the number changed in the meantime, the change is refused again with the new number.

**A15. Unknown participant token.** A participant token that is not known, because it never existed or its participant left or was deleted, gets the `401` of K3 with `unauthorized`, not the web's `not_joined`: the two cases look the same, and a client starts over by joining. A participant who leaves or is deleted while their request is being answered, for example while their current password is checked, gets the same answer.

**A16. Passwords in a request.** The join body has `name`, an optional `password` and an optional `newPassword`, and says which it means:

- `password` proves who the participant is when the name is used and has a password (P4). It is refused with `no_password` when the name is used but has no password, and with `name_unknown` when nobody uses the name.
- `newPassword` sets the password of a new name (P5). It is refused with `name_exists` when the name is already used.
- Neither is enough for a new name and for a used name without a password; a used name with a password gets `password_required`.
- Both at once are refused with `invalid_request` and `not_allowed` at `/newPassword`, because one of them would always be refused.

The join returns `200` for a new name and for a used one alike, with no field that tells them apart: the request already says which it means once a password is involved, and without one P4 makes the result the same, a token for the participant under that name. The web form has one password field and keeps the behaviour of P4: it checks a used name's password or sets a new name's.

The password body of `PUT .../me/password` has `newPassword` and, exactly when a password is set, `currentPassword`; a `currentPassword` for a participant without one is refused with `no_password`. `DELETE .../me/password` takes `currentPassword`. Each refusal points at the field it concerns. The web's password panel keeps its behaviour: its one current password field is checked while a password is set and ignored when none is, so when another browser removed the password after the page loaded, the panel still sets the new one.

**A18. Answers from the write.** The response to a change is built from the change itself, not from a later read: the event of `POST /api/v1/events`, the participant of a join and the participant after a saved availability. A participant who leaves, or an event that expires, right after the change therefore cannot turn a change that happened into an error, and a client never loses a secret that was issued. Likewise the pointers of an `unknown_slot` refusal name the slots that the refused save itself found unknown.

**A17. Best windows.** `GET /api/v1/events/{id}/windows` returns the windows of W1 to W3 as the event page lists them. A dated event's windows are taken per day in the event's reference zone, since a client has no zone of its own to show. Without `minMinutes`, the minimum length is one slot; without `minPeople`, it is the most people in any window, and at least 1. The response echoes both filters as applied, defaults included. A query parameter that does not fit is refused with `invalid_request` and an error `{ "parameter": "minPeople", "code": "too_small" }` that names the parameter instead of a pointer.

## 4. Credential rules

**K1. Header.** A secret travels only in `Authorization: Bearer <secret>` (ADR 0004).

**K2. Kind.** An endpoint that needs an admin secret refuses a participant token, and the other way round, with the code `wrong_secret_kind`.

**K3. Refusal.** A missing or wrong secret gets `401` with `WWW-Authenticate: Bearer` and the code `unauthorized`. The response is the same whether the event exists or not. The server checks a secret before it locks the event for a change, so a wrong secret neither waits for nor holds the lock.

**K4. Query string.** A request whose query string holds a value that starts with `cva_` or `cvp_`, or a parameter named `token`, `secret` or `access_token`, is refused with `400` and the code `secret_in_query`, on every endpoint.

**K5. No caching.** A response that returns a secret sends `Cache-Control: no-store`. So does every response to a request that carried one.

**K6. Logs.** Phase 1 rules and ADR 0003 item 8 apply to the API as well: no header, request body or query string is logged.

## 5. Description and SDK rules

**G1. OpenAPI document.** The OpenAPI 3.1 document is built from the zod schemas that validate requests and shape responses, with zod's own JSON Schema output: input schemas for requests, output schemas for responses. A check that JSON Schema cannot express stops the build instead of disappearing from the document. Paths and operations are described by hand in one module. The server serves the document at `/api/v1/openapi.json`, and the repository holds a copy that CI compares with a freshly built one.

**G2. Tagged schedule.** The schedule is a `oneOf` with a `discriminator` on `mode` (A5), so both SDKs can narrow it.

**G3. Document checks.** CI lints the document with Redocly CLI, and `oasdiff` fails CI when the document changes in a way that is breaking under A9 compared with `main`.

**G4. SDKs.** The TypeScript SDK is generated with `@hey-api/openapi-ts` into `packages/sdk-ts`. The Python SDK is generated with `openapi-python-client` into `packages/sdk-python`. Both are committed. CI generates them again and fails when the result differs from the committed code. Both follow A9: they keep unknown fields and problem codes instead of failing on them.

**H1. Reference page.** The application serves a reference page at `/{locale}/api`, in Czech and English. The server renders it from the OpenAPI document, built with the texts of the page's language. It lists every endpoint, schema, problem code and field code, each with an anchor. It uses the tokens of `DESIGN.md` and fits the Content Security Policy of ADR 0003 item 9. Every part of it is in the HTML the server sends, so it reads and its links work with scripts turned off. It adds no client code of its own; the framework's runtime scripts still load, as on every page. The English page and the `title` of a problem response share one text for each code, so they cannot drift apart. The Czech page translates it.

## 6. Errors

[problem-codes.md](problem-codes.md) adds an API section with the codes of A3, A4, A8, A14, A16, K2, K3 and K4, the field codes of A8 and the HTTP status of every code. The web shows the same codes as messages, as before.

## 7. Acceptance test

Phase 3 is done when this test passes on a clean clone in CI, against a running instance with an empty database:

1. The test suite of the TypeScript SDK (Vitest) creates a dated event, joins two participants, saves an availability for each, and reads the event back. The overlap it computes from the read equals the best window that `/windows` returns.
2. The test suite of the Python SDK (pytest) does the same with a weekday event.
3. Both suites check that a participant token is refused on an admin endpoint with `wrong_secret_kind`, and that a second read with the returned `ETag` gets `304`.

## 8. Rule coverage outside the acceptance test

The tests name no rule numbers. This list is the only link from rules to tests.

- `apps/web/src/server/secrets.test.ts` covers the typed secrets of ADR 0004 item 1.
- `apps/web/src/db/schema.db.test.ts` and `apps/web/src/server/participants.db.test.ts` cover the participant public id of A7.
- `apps/web/src/server/api/http.test.ts` covers A3 (path ids, unsupported methods), A4, A8 (type, title, internal errors and their log line), A10, A11 and K1 to K4 at the HTTP layer.
- `apps/web/src/server/api/field-codes.test.ts` covers the field codes of A8, including that a code the validation library adds later becomes `invalid_value`, that a custom check is named only by a known code, and that [problem-codes.md](problem-codes.md) lists every code a field error can carry.
- `apps/web/src/server/events.db.test.ts`, `apps/web/src/server/participants.db.test.ts` and `apps/web/src/server/responses.db.test.ts` cover A18: create, join and save answer with what they wrote, and a refused save names its unknown slots.
- `apps/web/src/server/password-attempts.db.test.ts` covers the participant deleted during a password check of A15.
- `apps/web/src/server/participants.db.test.ts` covers the web password panel of A16.
- `apps/web/src/server/api/events-api.db.test.ts` covers A3, A4, A5, A6, A8, A10 to A14, A17 and K2 to K5 on the event endpoints.
- `apps/web/src/server/api/participants-api.db.test.ts` covers A3, A6, A7, A8, A12, A15, A16, K2 and K3 on the participant endpoints, and a whole round from creating an event to its best windows.
- `apps/web/src/server/event-lock.db.test.ts` covers the lock order of K3.
- `apps/web/src/server/retention.db.test.ts` covers A12 in every server function.
- `apps/web/e2e/api.spec.ts` covers A3 (`405`, `HEAD` and unknown paths), A10 and A11 through the running server.
- `apps/web/src/server/api/openapi.test.ts` covers G1 (the committed copy, every endpoint, response objects open and request objects closed, a check that JSON Schema cannot express) and G2.
- `apps/web/e2e/api.spec.ts` covers that the running server serves the committed copy at `GET /api/v1/openapi.json` (G1).
- `mise run openapi:lint` and `mise run openapi:breaking`, both part of `mise run check`, cover G3.
- `apps/web/e2e/api-reference.spec.ts` covers H1 in both languages with scripts turned off, including that every endpoint, schema, problem code and field code has its anchor, and that a problem's `type` address of A8 resolves to the code on the reference page.
- `mise run sdk:check`, part of `mise run check`, covers that both committed SDKs match the ones generated from the committed document (G4).
- `packages/sdk-ts/src/sdk.test.ts` and `packages/sdk-python/tests/test_forward_compatibility.py` cover that both SDKs keep unknown response fields and problem codes (G4, A9).
- `packages/sdk-ts/acceptance/round.test.ts` and `packages/sdk-python/acceptance/test_round.py` are the acceptance test of section 7. `mise run sdk:acceptance` runs both against the production build on an empty database.
