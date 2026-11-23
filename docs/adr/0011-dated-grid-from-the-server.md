# ADR 0011: The server lays out a dated grid in the reference zone

Status: accepted, 2026-11-23. It replaces the part of item 9 of [ADR 0002](0002-time-representation.md) about dated events; the rest of ADR 0002 holds.

## Context

Under ADR 0002 item 9, the server sends a dated event's slots, and the browser lays out the columns and rows in the viewer's zone. Until the browser has done so, the page reserves the grid's space. Without JavaScript the page therefore shows no grid at all.

Phase 5 recognizes a participant from the browser's cookie on the server. Its rule Y3 asks for the participant's own grid in the server's first response, also without JavaScript. The server does not know the viewer's zone: ADR 0002 keeps it out of cookies, and a request carries no zone.

## Decision

1. **The server lays out a dated grid in the event's reference zone** and sends it with the page, as it sends a weekday grid. `serverGridOf` in `apps/web/src/server/board.ts` returns the two cases as a tagged value: a weekday grid, which is final, or a dated grid in the reference zone.
2. **The browser keeps that layout until it knows the viewer's zone**, then lays the grid out in the viewer's zone as before. The first render in the browser matches the server's, so hydration does not differ.
3. **A participant the server recognized starts on their own grid**, the "me" tab; any other visitor starts on the group grid.

## Consequences

- Without JavaScript, every grid event shows a grid in its reference zone, which the event's header line names.
- A viewer whose zone equals the reference zone, the common case, sees no change after the page loads. A viewer in another zone sees the grid laid out again once the browser runs. ADR 0002 avoided that jump by reserving space; this decision accepts it for viewers in another zone so that the first response holds the grid.
- The final-time picker on the manage page still waits for the viewer's zone, because a picked window is read in it.
- Rollback: return the reserved space for a dated grid. Y3 then holds only for weekday events.
