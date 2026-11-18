import { isEventId } from "./event-id";
import { slugify } from "./slug";

/** The `{slug}-{id}` path segment of an event address. */
export function eventSegment(id: string, name: string): string {
	const slug = slugify(name);

	return slug === "" ? id : `${slug}-${id}`;
}

/**
 * The event id selected by a `{slug}-{id}` or `{id}` path segment, or `undefined` when the
 * text after the last hyphen is not an event id. The slug part is ignored.
 */
export function eventIdFromSegment(segment: string): string | undefined {
	const candidate = segment.slice(segment.lastIndexOf("-") + 1);

	return isEventId(candidate) ? candidate : undefined;
}
