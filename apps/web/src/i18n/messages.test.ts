import { describe, expect, it } from "vitest";
import { z } from "zod";

import cs from "../../messages/cs.json";
import en from "../../messages/en.json";
import { routing } from "./routing";

type Entry = { kind: "text"; path: string; text: string } | { kind: "group"; entries: Entry[] };

// A catalog is a tree of groups whose leaves are message texts.
function catalogSchema(prefix: string): z.ZodType<Entry> {
	return z.union([
		z.string().transform((text): Entry => ({ kind: "text", path: prefix, text })),
		z.record(z.string(), z.unknown()).transform((group): Entry => ({
			kind: "group",
			entries: Object.entries(group).map(([key, value]) =>
				catalogSchema(prefix === "" ? key : `${prefix}.${key}`).parse(value),
			),
		})),
	]);
}

function texts(entry: Entry): { path: string; text: string }[] {
	return entry.kind === "text" ? [entry] : entry.entries.flatMap(texts);
}

// English is the reference catalog; Czech must have the same shape.
type Catalog = typeof en;

function parseCatalog(catalog: Catalog): { path: string; text: string }[] {
	return texts(catalogSchema("").parse(catalog)).toSorted((left, right) =>
		left.path.localeCompare(right.path),
	);
}

function paths(catalog: Catalog): string[] {
	return parseCatalog(catalog).map((message) => message.path);
}

/** Index right after the matching `}` for an opening `{` at `openIndex`. */
function afterMatchingBrace(input: string, openIndex: number): number {
	let depth = 1;
	let cursor = openIndex + 1;

	while (cursor < input.length && depth > 0) {
		if (input[cursor] === "{") {
			depth += 1;
		} else if (input[cursor] === "}") {
			depth -= 1;
		}

		cursor += 1;
	}

	return cursor;
}

/** Extracts sorted ICU placeholder names, including placeholders used inside plural branches. */
function icuPlaceholders(text: string): string[] {
	const found: string[] = [];

	const scanBranches = (rest: string) => {
		let cursor = 0;

		while (cursor < rest.length) {
			const open = rest.indexOf("{", cursor);

			if (open === -1) {
				break;
			}

			const end = afterMatchingBrace(rest, open);

			scan(rest.slice(open + 1, end - 1));
			cursor = end;
		}
	};

	const scan = (input: string) => {
		let index = 0;

		while (index < input.length) {
			const open = input.indexOf("{", index);

			if (open === -1) {
				break;
			}

			const cursor = afterMatchingBrace(input, open);
			const body = input.slice(open + 1, cursor - 1);
			const comma = body.indexOf(",");
			const name = (comma === -1 ? body : body.slice(0, comma)).trim();

			if (name !== "") {
				found.push(name);
			}

			if (comma !== -1) {
				scanBranches(body.slice(comma + 1));
			}

			index = cursor;
		}
	};

	scan(text);

	return found.toSorted();
}

/** Extracts sorted paired rich-text tag names such as `<strong>` or `<label>`. */
function richTextTags(text: string): string[] {
	return [...text.matchAll(/<([a-z][a-z0-9]*)>[^<]*<\/\1>/gu)]
		.map((match) => match[1] ?? "")
		.toSorted();
}

describe("message catalogs", () => {
	it("has one catalog per supported language", () => {
		expect(routing.locales.toSorted()).toEqual(["cs", "en"]);
	});

	it("defines the same keys, placeholders, and rich-text tags in Czech and English", () => {
		expect(paths(cs)).toEqual(paths(en));

		const csMap = new Map(parseCatalog(cs).map((message) => [message.path, message.text]));

		for (const message of parseCatalog(en)) {
			const czech = csMap.get(message.path) ?? "";

			expect([message.path, icuPlaceholders(czech)]).toEqual([
				message.path,
				icuPlaceholders(message.text),
			]);
			expect([message.path, richTextTags(czech)]).toEqual([
				message.path,
				richTextTags(message.text),
			]);
		}
	});

	it("leaves no message empty", () => {
		for (const catalog of [cs, en]) {
			const empty = parseCatalog(catalog).filter((message) => message.text.trim() === "");

			expect(empty).toEqual([]);
		}
	});
});
