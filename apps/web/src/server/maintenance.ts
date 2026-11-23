// The maintenance pass: the usage counts of events that reach an age
// and the purge of expired events, which counts them first when they were deleted before
// those ages. It imports only the usage constants, so that the purge command
// (`scripts/purge.mts`) runs it with plain Node, also in the container image.
import {
	ACTIVATED_AT,
	ACTIVATION_AGE_DAYS,
	GROUP_SIZE_AGE_DAYS,
	MAX_GROUP_BUCKET,
} from "../domain/usage.ts";

/** The part of a `pg` client or pool the pass needs. */
export type MaintenanceClient = {
	query: (text: string, values: (string | number)[]) => Promise<{ rows: Record<string, number>[] }>;
};

// Each statement marks an event counted in the same step that counts it, and a concurrent run
// waits for the row and then finds it marked, so several servers may run the pass side by side
// and every event still adds at most once. An event that reaches an age counts on the UTC
// day it did, so a late run counts the same.
const COUNT_AGES = `
with counted as (
  update events
  set
    activation_counted_at = case
      when activation_counted_at is null and created_at + make_interval(hours => $1 * 24) <= $3
      then $3 else activation_counted_at end,
    size_counted_at = case
      when size_counted_at is null and created_at + make_interval(hours => $2 * 24) <= $3
      then $3 else size_counted_at end
  where (activation_counted_at is null and created_at + make_interval(hours => $1 * 24) <= $3)
     or (size_counted_at is null and created_at + make_interval(hours => $2 * 24) <= $3)
  returning
    old.activation_counted_at is null and new.activation_counted_at is not null as activation,
    old.size_counted_at is null and new.size_counted_at is not null as size,
    created_at,
    final_state = 'chosen' as finalized,
    (select count(*) from participants where participants.event_id = events.id)::integer as people
),
counts as (
  select (created_at + make_interval(hours => $1 * 24)) at time zone 'UTC' as reached,
    'activation_evaluated' as metric, 0 as bucket
  from counted where activation
  union all
  select (created_at + make_interval(hours => $1 * 24)) at time zone 'UTC', 'activated', 0
  from counted where activation and people >= $4
  union all
  select (created_at + make_interval(hours => $2 * 24)) at time zone 'UTC', 'group_size',
    least(people, $5)
  from counted where size
  union all
  select (created_at + make_interval(hours => $2 * 24)) at time zone 'UTC', 'finalized', 0
  from counted where size and finalized
)
insert into usage_counts (day, metric, bucket, count)
select reached::date, metric, bucket, count(*) from counts group by reached::date, metric, bucket
on conflict (day, metric, bucket) do update set count = usage_counts.count + excluded.count`;

// The expiry is the SQL form of `expiresAt` in `src/domain/retention.ts`: the end of the
// deletion date in the reference zone. A database test keeps the two in step. A weekday event
// whose final date lies after its planned deletion date is kept until the retention after the
// final date. An event its owner keeps is never deleted, and once the keeping ended the event
// lasts at least the retention after that day (greatest skips a null). Deleting an event
// deletes its participants, tokens and responses through the foreign keys.
const PURGE = `
with gone as (
  delete from events
  where kept_until is distinct from 'infinity' and ((
    greatest(
      case
        when kind = 'poll' then (
          select max((start at time zone reference_zone)::date)
          from poll_options where poll_options.event_id = events.id
        )
        when day_mode = 'range' then range_last
        when day_mode = 'dates' then (select max(day) from unnest(dates) as day)
        when final_state = 'chosen' and (final_start at time zone reference_zone)::date
          > (changed_at at time zone reference_zone)::date + $1::integer
          then (final_start at time zone reference_zone)::date
        else (changed_at at time zone reference_zone)::date
      end,
      (kept_until at time zone reference_zone)::date
    ) + $1::integer + 1
  )::timestamp at time zone reference_zone
  ) <= $2::timestamptz
  returning
    activation_counted_at is null as activation,
    size_counted_at is null as size,
    final_state = 'chosen' as finalized,
    (select count(*) from participants where participants.event_id = events.id)::integer as people
),
counts as (
  select 'activation_evaluated' as metric, 0 as bucket from gone where activation
  union all
  select 'activated', 0 from gone where activation and people >= $3
  union all
  select 'group_size', least(people, $4) from gone where size
  union all
  select 'finalized', 0 from gone where size and finalized
),
added as (
  insert into usage_counts (day, metric, bucket, count)
  select ($2::timestamptz at time zone 'UTC')::date, metric, bucket, count(*)
  from counts group by metric, bucket
  on conflict (day, metric, bucket) do update set count = usage_counts.count + excluded.count
)
select count(*)::integer as deleted from gone`;

// Sign-in data that is no longer needed. Better Auth deletes a sign-in link when it is used, so
// only the expired ones remain here. An email count limits one hour, so a day keeps every count
// the limits read.
const CLEAN_SIGN_IN = `
with sessions as (delete from auth_sessions where expires_at <= $1::timestamptz),
links as (delete from auth_verifications where expires_at <= $1::timestamptz)
delete from email_counts where hour < $1::timestamptz - interval '1 day'`;

/**
 * Counts the events that reached 7 or 30 days by `now`, deletes expired sign-in data, then
 * deletes every event that expired by `now` and returns how many it deleted. A second run at
 * the same `now` changes nothing. With retention `never`, no event expires.
 */
export async function runMaintenance(
	client: MaintenanceClient,
	retention: number | "never",
	now: string,
): Promise<number> {
	await client.query(COUNT_AGES, [
		ACTIVATION_AGE_DAYS,
		GROUP_SIZE_AGE_DAYS,
		now,
		ACTIVATED_AT,
		MAX_GROUP_BUCKET,
	]);
	await client.query(CLEAN_SIGN_IN, [now]);

	if (retention === "never") {
		return 0;
	}

	const result = await client.query(PURGE, [retention, now, ACTIVATED_AT, MAX_GROUP_BUCKET]);

	return result.rows[0]?.["deleted"] ?? 0;
}
