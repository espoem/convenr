import type { ReactNode } from "react";

/** A text of the API description, where a span between backticks is code. */
export function InlineCode({ text }: { text: string }): ReactNode {
	let offset = 0;

	// Splitting on backticks puts code at every odd position. Each part is keyed by where it
	// starts in the text, which no other part shares.
	return text.split("`").map((part, index) => {
		const start = offset;

		offset += part.length + 1;

		return index % 2 === 1 ? (
			<code key={start} className="font-mono break-words">
				{part}
			</code>
		) : (
			part
		);
	});
}
