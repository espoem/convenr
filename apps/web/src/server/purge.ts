// The purge of expired events: Phase 2 rule X4. This file imports nothing, so that the purge
// command (`scripts/purge.mts`) can run it with plain Node, also in the container image.

/** The part of a `pg` client or pool the purge needs. */
export type PurgeClient = {
	query: (text: string, values: (string | number)[]) => Promise<{ rowCount: number | null }>;
};

// The SQL form of `expiresAt` in `src/domain/retention.ts` (X3): the end of the deletion date
// in the reference zone. A database test keeps the two in step. Deleting an event deletes its
// participants, tokens and responses through the foreign keys.
const PURGE = `
delete from events
where (
  (
    case day_mode
      when 'range' then range_last
      when 'dates' then (select max(day) from unnest(dates) as day)
      else (changed_at at time zone reference_zone)::date
    end + $1::integer + 1
  )::timestamp at time zone reference_zone
) <= $2::timestamptz`;

/**
 * Deletes every event that expired at `now` and returns how many. Running it twice in a row
 * deletes nothing the second time. With retention `never`, nothing expires.
 */
export async function purgeExpired(
	client: PurgeClient,
	retention: number | "never",
	now: string,
): Promise<number> {
	if (retention === "never") {
		return 0;
	}

	const result = await client.query(PURGE, [retention, now]);

	return result.rowCount ?? 0;
}
