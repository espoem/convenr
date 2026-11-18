import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { INPUT_CODES, inputProblems } from "@/server/events";

import { FIELD_CODES, fieldCode, fieldErrors } from "./field-codes";

/** The field errors `schema` reports for the JSON text `body`, each as `path: code`. */
function errorsOf(schema: z.ZodType, body: string): string[] {
	const parsed = schema.safeParse(JSON.parse(body), { reportInput: true });

	return parsed.success
		? []
		: fieldErrors(parsed.error.issues).map(({ path, code }) => `${path.join(".")}: ${code}`);
}

describe("field codes", () => {
	it("maps each kind of zod issue to the API's own code", () => {
		const schema = z.strictObject({
			name: z.string().min(2).max(3),
			count: z.int().min(1).max(9),
			days: z.array(z.int()).min(1).max(2),
			day: z.iso.date(),
			mode: z.literal(["a", "b"]),
			step: z.int().multipleOf(5),
		});

		expect(
			errorsOf(schema, '{"name":"a","count":0,"days":[],"day":"1.4.2027","mode":"c","step":7}'),
		).toEqual([
			"name: too_short",
			"count: too_small",
			"days: too_short",
			"day: invalid_format",
			"mode: invalid_value",
			"step: invalid_value",
		]);
		expect(errorsOf(schema, '{"name":"abcd","count":10,"days":[1,2,3],"extra":1}')).toEqual([
			"name: too_long",
			"count: too_large",
			"days: too_long",
			"day: required",
			"mode: required",
			"step: required",
			"extra: not_allowed",
		]);
		expect(
			errorsOf(schema, '{"name":1,"count":"1","days":{},"day":null,"mode":"a","step":5}'),
		).toEqual(["name: wrong_type", "count: wrong_type", "days: wrong_type", "day: wrong_type"]);
	});

	it("tells a missing tag from an unknown one, and reports a union by its closest alternative", () => {
		const schema = z.strictObject({
			schedule: z.discriminatedUnion("mode", [z.strictObject({ mode: z.literal("dates") })]),
			slots: z.array(
				z.union([
					z.strictObject({ start: z.string() }),
					z.strictObject({ weekday: z.int(), minute: z.int() }),
				]),
			),
		});

		expect(errorsOf(schema, '{"schedule":{},"slots":[{"start":"x","extra":1}]}')).toEqual([
			"schedule.mode: required",
			"slots.0.extra: not_allowed",
		]);
		expect(errorsOf(schema, '{"schedule":{"mode":"weeks"},"slots":[{"weekday":1}]}')).toEqual([
			"schedule.mode: invalid_value",
			"slots.0.minute: required",
		]);
	});

	it("gives a code zod adds later the general invalid_value", () => {
		expect(fieldCode({ code: "added_later", path: [], message: "" })).toBe("invalid_value");
		expect(fieldCode({ path: [], message: "" })).toBe("invalid_value");
		expect(FIELD_CODES).toContain(fieldCode({ code: "custom", path: [], message: "" }));
	});

	it("are each listed in the problem codes document", async () => {
		const document = await readFile(
			new URL("../../../../../docs/spec/problem-codes.md", import.meta.url),
			"utf8",
		);

		expect(INPUT_CODES.filter((code) => !document.includes(`\`${code}\``))).toEqual([]);
	});

	it("names a custom check by its own code only when the code is a known one", () => {
		const schema = z.object({
			zone: z.string().refine(() => false, { params: { code: "unknown_time_zone" } }),
			other: z.string().refine(() => false, { params: { code: "made_up" } }),
			bare: z.string().refine(() => false),
		});

		const parsed = schema.safeParse({ zone: "x", other: "x", bare: "x" });

		expect(
			parsed.success
				? []
				: inputProblems(parsed.error).map(({ code, path }) => `${path.join(".")}: ${code}`),
		).toEqual(["zone: unknown_time_zone", "other: invalid_value", "bare: invalid_value"]);
	});
});
