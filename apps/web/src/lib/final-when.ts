const DATE: Intl.DateTimeFormatOptions = {
	weekday: "long",
	day: "numeric",
	month: "long",
	year: "numeric",
};

const TIME: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };

export type FormatWhen = (
	key: "finalWhen" | "finalWhenAcross",
	values: Record<string, string>,
) => string;

/** Formats a final time or poll option in `zone`, handling ranges that cross midnight. */
export function formatWhen(
	final: { start: string; end: string },
	zone: string,
	locale: string,
	translate: FormatWhen,
): string {
	const start = Temporal.Instant.from(final.start).toZonedDateTimeISO(zone);
	const end = Temporal.Instant.from(final.end).toZonedDateTimeISO(zone);
	const date = (at: Temporal.ZonedDateTime) => at.toLocaleString(locale, DATE);
	const time = (at: Temporal.ZonedDateTime) => at.toLocaleString(locale, TIME);

	// A window that ends at midnight still ends on its own day.
	const lastDay = end.subtract({ nanoseconds: 1 }).toPlainDate();

	return Temporal.PlainDate.compare(start.toPlainDate(), lastDay) === 0
		? translate("finalWhen", { date: date(start), start: time(start), end: time(end) })
		: translate("finalWhenAcross", {
				startDate: date(start),
				start: time(start),
				endDate: date(end),
				end: time(end),
			});
}
