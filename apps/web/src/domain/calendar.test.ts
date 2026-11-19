import { describe, expect, it } from "vitest";

import {
	calendarFile,
	type CalendarEntry,
	googleCalendarUrl,
	outlookCalendarUrl,
} from "./calendar";

const entry: CalendarEntry = {
	id: "abcdefghijkm",
	name: "Zkouška; sál, 2",
	description: "V klubovně.\nPřineste noty.",
	shareUrl: "https://convenr.test/e/zkouska-abcdefghijkm",
	start: Temporal.Instant.from("2027-04-05T15:00:00Z"),
	end: Temporal.Instant.from("2027-04-05T17:00:00Z"),
	sequence: 2,
};

const now = Temporal.Instant.from("2027-03-01T08:30:15.123Z");

/** The content lines of a file, with folded lines joined again. */
function unfolded(file: string): string[] {
	return file.replaceAll("\r\n ", "").split("\r\n");
}

describe("the calendar file", () => {
	it("holds one event with the final time in UTC, the name, the description and the share link", () => {
		const file = calendarFile(entry, now);

		expect(file.endsWith("\r\n")).toBe(true);
		expect(unfolded(file)).toEqual([
			"BEGIN:VCALENDAR",
			"VERSION:2.0",
			"PRODID:-//convenr//convenr//EN",
			"CALSCALE:GREGORIAN",
			"METHOD:PUBLISH",
			"BEGIN:VEVENT",
			"UID:abcdefghijkm@convenr",
			"DTSTAMP:20270301T083015Z",
			"SEQUENCE:2",
			"DTSTART:20270405T150000Z",
			"DTEND:20270405T170000Z",
			"SUMMARY:Zkouška\\; sál\\, 2",
			"DESCRIPTION:V klubovně.\\nPřineste noty.\\n\\nhttps://convenr.test/e/zkouska-abcdefghijkm",
			"URL:https://convenr.test/e/zkouska-abcdefghijkm",
			"END:VEVENT",
			"END:VCALENDAR",
			"",
		]);
	});

	it("keeps the uid for the same event and puts the link alone without a description", () => {
		const moved = calendarFile({ ...entry, description: "", sequence: 3 }, now);

		expect(unfolded(moved)).toContain("UID:abcdefghijkm@convenr");
		expect(unfolded(moved)).toContain("SEQUENCE:3");
		expect(unfolded(moved)).toContain("DESCRIPTION:https://convenr.test/e/zkouska-abcdefghijkm");
	});

	it("folds long lines at 75 octets without splitting a character", () => {
		const file = calendarFile({ ...entry, name: "ř".repeat(100) }, now);
		const lines = file.split("\r\n");
		const encoder = new TextEncoder();

		expect(lines.every((line) => encoder.encode(line).length <= 75)).toBe(true);
		expect(lines.filter((line) => line.startsWith(" ")).length).toBeGreaterThan(1);
		expect(unfolded(file)).toContain(`SUMMARY:${"ř".repeat(100)}`);
	});
});

describe("the calendar links", () => {
	it("fill in a new Google Calendar entry", () => {
		const url = new URL(googleCalendarUrl(entry));

		expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
		expect(Object.fromEntries(url.searchParams)).toEqual({
			action: "TEMPLATE",
			text: "Zkouška; sál, 2",
			dates: "20270405T150000Z/20270405T170000Z",
			details: "V klubovně.\nPřineste noty.\n\nhttps://convenr.test/e/zkouska-abcdefghijkm",
		});
	});

	it("fill in a new Outlook.com entry", () => {
		const url = new URL(outlookCalendarUrl(entry));

		expect(url.origin + url.pathname).toBe("https://outlook.live.com/calendar/0/deeplink/compose");
		expect(url.searchParams.get("subject")).toBe("Zkouška; sál, 2");
		expect(url.searchParams.get("startdt")).toBe("2027-04-05T15:00:00Z");
		expect(url.searchParams.get("enddt")).toBe("2027-04-05T17:00:00Z");
		expect(url.searchParams.get("body")).toContain("https://convenr.test/e/zkouska-abcdefghijkm");
	});
});
