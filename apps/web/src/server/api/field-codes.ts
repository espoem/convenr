// The codes a field error of the API carries when a value has the wrong form. zod's issue codes
// are an implementation detail that changes between versions, so they are mapped here, once, to
// a closed set the API owns. Rule codes such as `date_in_past` come from the server functions
// and are not mapped.
import { z } from "zod";

export const FIELD_CODES = [
	"required",
	"wrong_type",
	"too_short",
	"too_long",
	"too_small",
	"too_large",
	"invalid_format",
	"not_allowed",
	"invalid_value",
] as const;

export type FieldCode = (typeof FIELD_CODES)[number];

/** An issue as zod reports it; a code zod adds later still has this shape. */
export type FieldIssue = z.core.$ZodIssue | z.core.$ZodIssueBase;

/** A value at fault, at its path into the checked input. */
export type FieldError = { path: PropertyKey[]; code: FieldCode };

/** Origins whose size is a length: a string's characters or a list's items. */
const LENGTH_ORIGINS = new Set(["string", "array", "set", "file"]);

/** The input of a tagged union: an object whose tag may be missing. */
const taggedInput = z.record(z.string(), z.unknown());

/**
 * The field code of one issue. A missing value is told from a wrong one by the issue's `input`,
 * so the value is parsed with zod's `reportInput`.
 */
export function fieldCode(issue: FieldIssue): FieldCode {
	if (!("code" in issue) || issue.code === undefined) {
		return "invalid_value";
	}

	switch (issue.code) {
		case "invalid_type":
			return issue.input === undefined ? "required" : "wrong_type";
		case "invalid_value":
			// A literal or one of a list of values, such as a slot length.
			return issue.input === undefined ? "required" : "invalid_value";
		case "too_small":
			return "origin" in issue && LENGTH_ORIGINS.has(String(issue.origin))
				? "too_short"
				: "too_small";
		case "too_big":
			return "origin" in issue && LENGTH_ORIGINS.has(String(issue.origin))
				? "too_long"
				: "too_large";
		case "invalid_format":
			return "invalid_format";
		case "unrecognized_keys":
			return "not_allowed";
		case "invalid_union": {
			// A tagged object whose tag is missing, rather than one the union does not know.
			const tag = "discriminator" in issue ? issue.discriminator : undefined;
			const input = taggedInput.safeParse(issue.input);

			return tag !== undefined && input.success && !Object.hasOwn(input.data, tag)
				? "required"
				: "invalid_value";
		}

		default:
			return "invalid_value";
	}
}

/**
 * Every value at fault in `issues`, with its path. Each unknown key is its own error. A value
 * that matches no alternative of a union is reported as the closest alternative sees it: the
 * one with the fewest issues.
 */
export function fieldErrors(
	issues: readonly FieldIssue[],
	at: readonly PropertyKey[] = [],
): FieldError[] {
	return issues.flatMap((issue): FieldError[] => {
		const path = [...at, ...issue.path];

		if ("keys" in issue && issue.code === "unrecognized_keys") {
			return issue.keys.map((key) => ({ path: [...path, key], code: "not_allowed" }));
		}

		if ("errors" in issue && issue.code === "invalid_union" && issue.errors.length > 0) {
			const closest = issue.errors.reduce((best, next) =>
				next.length < best.length ? next : best,
			);

			return fieldErrors(closest, path);
		}

		return [{ path, code: fieldCode(issue) }];
	});
}
