import { Fragment, type ReactNode } from "react";

import { type JsonSchema, referencedName, schemaOf } from "@/server/api/openapi";

/** The page anchor of a schema component. */
export function schemaAnchor(name: string): string {
	return `schema-${name}`;
}

/** The page anchor of a problem code, where the code's `type` address leads. */
export function problemAnchor(code: string): string {
	return `problem-${code}`;
}

/** The page anchor of a field code. */
export function fieldAnchor(code: string): string {
	return `field-${code}`;
}

/** Each alternative of a union, by a key that its JSON text makes unique. */
function alternatives(parts: [key: string, node: ReactNode][]): ReactNode {
	return parts.map(([key, part], index) => (
		<Fragment key={key}>
			{index > 0 && " | "}
			{part}
		</Fragment>
	));
}

/** A JSON Schema type as a reader writes it: `string`, `Slot[]`, `"dates" | "range"`. */
export function SchemaType({ schema }: { schema: JsonSchema }): ReactNode {
	const name = referencedName(schema);

	if (name !== undefined) {
		return (
			<a href={`#${schemaAnchor(name)}`} className="text-action underline underline-offset-4">
				{name}
			</a>
		);
	}

	const variants = (schema.oneOf ?? schema.anyOf ?? []).flatMap(
		(variant): [string, ReactNode][] => {
			const described = schemaOf(variant);
			const key = JSON.stringify(described);

			return described === undefined ? [] : [[key, <SchemaType key={key} schema={described} />]];
		},
	);

	if (variants.length > 0) {
		return alternatives(variants);
	}

	if (schema.const !== undefined) {
		return JSON.stringify(schema.const);
	}

	if (schema.enum !== undefined) {
		return alternatives(
			schema.enum.map((value): [string, ReactNode] => [
				JSON.stringify(value),
				JSON.stringify(value),
			]),
		);
	}

	// Draft 2020-12 gives a list one schema for all its items.
	const items =
		schema.items === undefined || Array.isArray(schema.items) ? undefined : schemaOf(schema.items);

	if (schema.type === "array" && items !== undefined) {
		const several = (items.oneOf ?? items.anyOf ?? []).length > 1;

		return (
			<>
				{several && "("}
				<SchemaType schema={items} />
				{several && ")"}
				[]
			</>
		);
	}

	const types = schema.type === undefined ? [] : [schema.type].flat();
	const format = schema.format === undefined ? "" : ` (${schema.format})`;

	return types.length === 0 ? "any" : `${types.join(" | ")}${format}`;
}

const CONSTRAINTS = [
	"minLength",
	"maxLength",
	"minimum",
	"maximum",
	"exclusiveMinimum",
	"exclusiveMaximum",
	"minItems",
	"maxItems",
	"pattern",
] as const;

/** The limits a value must keep, as JSON Schema names them. */
export function constraints(schema: JsonSchema): string[] {
	return CONSTRAINTS.flatMap((keyword) => {
		const value = schema[keyword];

		return value === undefined ? [] : [`${keyword}: ${String(value)}`];
	});
}
