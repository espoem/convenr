// The final time for calendars: an iCalendar file (RFC 5545) and the pages of Google Calendar
// and Outlook.com that open a new entry filled in. Nothing here reaches a provider by itself;
// the visitor follows a link or opens the file.

/** What a calendar entry of an event holds. It never names a participant or the admin link. */
export type CalendarEntry = {
	id: string;
	name: string;
	description: string;
	/** The share link of the event page. */
	shareUrl: string;
	start: Temporal.Instant;
	end: Temporal.Instant;
	/** Counts picks and changes of the final time, so a later file replaces an earlier one. */
	sequence: number;
};

// A content line is at most 75 octets before its line break (RFC 5545 section 3.1).
const LINE_OCTETS = 75;

const encoder = new TextEncoder();

/** The description followed by the share link, or the link alone. */
function entryDetails(entry: CalendarEntry): string {
	return entry.description === "" ? entry.shareUrl : `${entry.description}\n\n${entry.shareUrl}`;
}

/** An instant in the UTC form of iCalendar and Google Calendar, like `20270405T150000Z`. */
function basicUtc(instant: Temporal.Instant): string {
	return instant.toString({ smallestUnit: "second" }).replaceAll(/[-:]/gu, "");
}

/** A TEXT value: backslash, semicolon and comma escaped, every line break as `\n`. */
function text(value: string): string {
	return value
		.replaceAll("\\", "\\\\")
		.replaceAll(";", "\\;")
		.replaceAll(",", "\\,")
		.replaceAll(/\r\n|\r|\n/gu, "\\n");
}

/** Folds a content line into lines of at most 75 octets, never inside a character. */
function fold(line: string): string {
	const parts: string[] = [];
	let current = "";
	let octets = 0;

	for (const character of line) {
		const size = encoder.encode(character).length;

		// A continuation line starts with a space, which counts toward its octets.
		if (octets + size > LINE_OCTETS) {
			parts.push(current);
			current = " ";
			octets = 1;
		}

		current += character;
		octets += size;
	}

	parts.push(current);

	return parts.join("\r\n");
}

/**
 * The calendar file of the final time: one `VEVENT` whose `UID` comes from the event id, so
 * every download of the event updates the same entry, with `DTSTAMP` at `now`.
 */
export function calendarFile(entry: CalendarEntry, now: Temporal.Instant): string {
	const lines = [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		"PRODID:-//convenr//convenr//EN",
		"CALSCALE:GREGORIAN",
		"METHOD:PUBLISH",
		"BEGIN:VEVENT",
		`UID:${entry.id}@convenr`,
		`DTSTAMP:${basicUtc(now)}`,
		`SEQUENCE:${entry.sequence}`,
		`DTSTART:${basicUtc(entry.start)}`,
		`DTEND:${basicUtc(entry.end)}`,
		`SUMMARY:${text(entry.name)}`,
		`DESCRIPTION:${text(entryDetails(entry))}`,
		`URL:${entry.shareUrl}`,
		"END:VEVENT",
		"END:VCALENDAR",
	];

	return `${lines.map((line) => fold(line)).join("\r\n")}\r\n`;
}

/** The Google Calendar page that opens a new entry with the final time filled in. */
export function googleCalendarUrl(entry: CalendarEntry): string {
	const query = new URLSearchParams({
		action: "TEMPLATE",
		text: entry.name,
		dates: `${basicUtc(entry.start)}/${basicUtc(entry.end)}`,
		details: entryDetails(entry),
	});

	return `https://calendar.google.com/calendar/render?${query.toString()}`;
}

/** The Outlook.com page that opens a new entry with the final time filled in. */
export function outlookCalendarUrl(entry: CalendarEntry): string {
	const query = new URLSearchParams({
		path: "/calendar/action/compose",
		rru: "addevent",
		subject: entry.name,
		startdt: entry.start.toString({ smallestUnit: "second" }),
		enddt: entry.end.toString({ smallestUnit: "second" }),
		body: entryDetails(entry),
	});

	return `https://outlook.live.com/calendar/0/deeplink/compose?${query.toString()}`;
}
