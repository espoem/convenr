import { isPublicId } from "./public-id";
import { slugify } from "./slug";

/** The `{slug}-{id}` path segment of an event address. */
export function eventSegment(id: string, name: string): string {
	const slug = slugify(name);

	return slug === "" ? id : `${slug}-${id}`;
}

/**
 * The share link outside the page, as in a calendar entry: without a language, so the event
 * page opens in the language of whoever follows it.
 */
export function shareUrl(origin: string, segment: string): string {
	return `${origin}/e/${segment}`;
}

/**
 * The event id selected by a `{slug}-{id}` or `{id}` path segment, or `undefined` when the
 * text after the last hyphen is not an event id. The slug part is ignored.
 */
export function eventIdFromSegment(segment: string): string | undefined {
	const candidate = segment.slice(segment.lastIndexOf("-") + 1);

	return isPublicId(candidate) ? candidate : undefined;
}
