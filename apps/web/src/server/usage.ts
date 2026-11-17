// Usage counts recorded inside the server's own changes: Phase 2 rules U2, U5 and, for an
// organizer's deletion, U3 and U4. Counts hold no names, contents or ids (U1). Events reaching
// an age and expired events are counted by the maintenance pass (`maintenance.ts`). The
// `*_counted_at` columns make each event add to U3, U4 and U5 at most once (U6).
import { count, eq, sql } from "drizzle-orm";

import { events, participants, usageCounts } from "@/db/schema";
import { ACTIVATED_AT, firstResponseBucket, MAX_GROUP_BUCKET } from "@/domain/usage";

import type { EventRow, Queries } from "./event-rows";

type Metric = (typeof usageCounts.$inferInsert)["metric"];

/** Adds one to the count of `metric` and `bucket` on the UTC day of `now` (U1). */
async function add(queries: Queries, now: Temporal.Instant, metric: Metric, bucket = 0) {
	const day = now.toZonedDateTimeISO("UTC").toPlainDate().toString();

	await queries
		.insert(usageCounts)
		.values({ day, metric, bucket, count: 1 })
		.onConflictDoUpdate({
			target: [usageCounts.day, usageCounts.metric, usageCounts.bucket],
			set: { count: sql`${usageCounts.count} + 1` },
		});
}

/** U2: an event was created at `now`. */
export async function countCreated(queries: Queries, now: Temporal.Instant) {
	await add(queries, now, "events_created");
}

/** U5: the first participant of `event` joined at `now`. */
export async function countFirstResponse(queries: Queries, event: EventRow, now: Temporal.Instant) {
	if (event.firstResponseCountedAt !== null) {
		return;
	}

	const created = Temporal.Instant.from(event.createdAt);

	await queries
		.update(events)
		.set({ firstResponseCountedAt: now.toString() })
		.where(eq(events.id, event.id));
	await add(queries, now, "first_response", firstResponseBucket(created, now));
}

/**
 * U3 and U4 for an event the organizer deletes at `now`, unless the maintenance pass counted it
 * already. Call it with the event row locked, before the delete.
 */
export async function countDeleted(queries: Queries, event: EventRow, now: Temporal.Instant) {
	const [total] = await queries
		.select({ value: count() })
		.from(participants)
		.where(eq(participants.eventId, event.id));

	const people = total?.value ?? 0;

	if (event.activationCountedAt === null) {
		await add(queries, now, "activation_evaluated");

		if (people >= ACTIVATED_AT) {
			await add(queries, now, "activated");
		}
	}

	if (event.sizeCountedAt === null) {
		await add(queries, now, "group_size", Math.min(people, MAX_GROUP_BUCKET));
	}
}
