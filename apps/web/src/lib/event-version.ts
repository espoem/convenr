// The version of an event: a count of its changes, kept apart from every instant.

declare const EVENT_VERSION_BRAND: unique symbol;

/**
 * How many changes an event has had, starting at 1 for the new event (the column's default). A
 * branded bigint, so the type system does not let anyone pass a time or another number as one.
 */
export type EventVersion = bigint & { readonly [EVENT_VERSION_BRAND]: true };

function isPositiveVersion(value: bigint): value is EventVersion {
	return value >= 1n;
}

/** The version as the database returned it. */
export function asEventVersion(value: bigint): EventVersion {
	if (!isPositiveVersion(value)) {
		throw new RangeError("Event version must be at least 1.");
	}

	return value;
}

/** The version in the text a header or a request names it by: decimal digits. */
export function versionText(version: EventVersion): string {
	return version.toString();
}

/** The version named by `text`, or `undefined` when `text` is not what `versionText` makes. */
export function parseVersion(text: string): EventVersion | undefined {
	return /^[1-9][0-9]{0,18}$/u.test(text) ? asEventVersion(BigInt(text)) : undefined;
}
