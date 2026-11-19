// The version of an event: a count of its changes, kept apart from every instant.
import { z } from "zod";

/**
 * How many changes an event has had, starting at 1 for the new event (the column's default). A
 * branded bigint, so the type system does not let anyone pass a time or another number as one.
 */
export const eventVersionSchema = z.bigint().min(1n).brand<"EventVersion">();

export type EventVersion = z.infer<typeof eventVersionSchema>;

/** The version as the database returned it. */
export function asEventVersion(value: bigint): EventVersion {
	return eventVersionSchema.parse(value);
}

/** The version in the text a header or a request names it by: decimal digits. */
export function versionText(version: EventVersion): string {
	return version.toString();
}

/** The version named by `text`, or `undefined` when `text` is not what `versionText` makes. */
export function parseVersion(text: string): EventVersion | undefined {
	return /^[1-9][0-9]{0,18}$/u.test(text) ? asEventVersion(BigInt(text)) : undefined;
}
