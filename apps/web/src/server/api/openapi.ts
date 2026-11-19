// The OpenAPI document of the public API. Its schemas are the zod schemas that check requests
// and shape responses, turned into JSON Schema by zod itself: requests as zod reads them,
// responses as zod writes them. Paths and operations are written here. The texts come from the
// message catalog: the served document is English, and the reference page builds it in the
// visitor's language.
import { z } from "zod";

import { PUBLIC_ID_ALPHABET, PUBLIC_ID_LENGTH } from "@/domain/public-id";
import type { Locale } from "@/i18n/routing";

import cs from "../../../messages/cs.json" with { type: "json" };
import en from "../../../messages/en.json" with { type: "json" };
import { PROBLEM_STATUS, type ProblemCode } from "./http";
import {
	availabilityRequestSchema,
	createdEventSchema,
	createEventRequestSchema,
	datedSlotSchema,
	eventSchema,
	fieldErrorSchema,
	finalRequestSchema,
	finalSchema,
	joinedSchema,
	joinRequestSchema,
	participantSchema,
	problemSchema,
	removePasswordRequestSchema,
	retentionSchema,
	scheduleInputSchema,
	scheduleSchema,
	setPasswordRequestSchema,
	slotSchema,
	updateEventRequestSchema,
	weekdaySlotSchema,
	windowsQuerySchema,
	windowsSchema,
} from "./schemas";

export type JsonSchema = z.core.JSONSchema.JSONSchema;

type Io = "input" | "output";

type Component = [name: string, schema: z.ZodType];

type Reference = { $ref: string };

const COMPONENTS = "#/components/schemas/";

function ref(name: string): Reference {
	return { $ref: `${COMPONENTS}${name}` };
}

/** The component a `$ref` points to, or `undefined` for any other reference. */
export function referencedName(schema: { $ref?: string | undefined }): string | undefined {
	return schema.$ref?.startsWith(COMPONENTS) === true
		? schema.$ref.slice(COMPONENTS.length)
		: undefined;
}

const [datesSchedule, rangeSchedule, weekdaysSchedule] = scheduleSchema.options;
const [datesInput, rangeInput, weekdaysInput] = scheduleInputSchema.options;
const [retentionUntil, retentionKept] = retentionSchema.options;
const [pointerError, parameterError] = fieldErrorSchema.options;
const slotInputSchema = availabilityRequestSchema.shape.availability.element;
const [datedSlotInput, weekdaySlotInput] = slotInputSchema.options;
const [finalOpen, finalChosen] = finalSchema.options;

const OUTPUT_COMPONENTS: Component[] = [
	["Event", eventSchema],
	["Participant", participantSchema],
	["Schedule", scheduleSchema],
	["DatesSchedule", datesSchedule],
	["RangeSchedule", rangeSchedule],
	["WeekdaysSchedule", weekdaysSchedule],
	["Slot", slotSchema],
	["DatedSlot", datedSlotSchema],
	["WeekdaySlot", weekdaySlotSchema],
	["Retention", retentionSchema],
	["RetentionUntil", retentionUntil],
	["RetentionKept", retentionKept],
	["Final", finalSchema],
	["FinalOpen", finalOpen],
	["FinalChosen", finalChosen],
	["CreatedEvent", createdEventSchema],
	["Joined", joinedSchema],
	["Windows", windowsSchema],
	["Window", windowsSchema.shape.windows.element],
	["Problem", problemSchema],
	["FieldError", fieldErrorSchema],
	["PointerError", pointerError],
	["ParameterError", parameterError],
];

const INPUT_COMPONENTS: Component[] = [
	["CreateEventRequest", createEventRequestSchema],
	["UpdateEventRequest", updateEventRequestSchema],
	["ScheduleInput", scheduleInputSchema],
	["DatesScheduleInput", datesInput],
	["RangeScheduleInput", rangeInput],
	["WeekdaysScheduleInput", weekdaysInput],
	["JoinRequest", joinRequestSchema],
	["AvailabilityRequest", availabilityRequestSchema],
	["FinalRequest", finalRequestSchema],
	["SlotInput", slotInputSchema],
	["DatedSlotInput", datedSlotInput],
	["WeekdaySlotInput", weekdaySlotInput],
	["SetPasswordRequest", setPasswordRequestSchema],
	["RemovePasswordRequest", removePasswordRequestSchema],
];

/** Marks the values of a response enum until the text names them. */
const KNOWN_VALUES = "x-known-values";

/** Checks that zod writes as JSON Schema keywords. Any other check would be left out. */
const DESCRIBED_CHECKS = [
	z.core.$ZodCheckLessThan,
	z.core.$ZodCheckGreaterThan,
	z.core.$ZodCheckMultipleOf,
	z.core.$ZodCheckNumberFormat,
	z.core.$ZodCheckMaxLength,
	z.core.$ZodCheckMinLength,
	z.core.$ZodCheckLengthEquals,
	z.core.$ZodCheckStringFormat,
];

function isDescribed(check: z.core.$ZodCheck): boolean {
	return DESCRIBED_CHECKS.some((kind) => check instanceof kind);
}

/** A schema in place of `true` or `false`, which stand for any value and for none. */
export function schemaOf(value: z.core.JSONSchema._JSONSchema): JsonSchema | undefined {
	return value === true || value === false ? undefined : value;
}

/**
 * Adjusts zod's output to what the API promises and what the SDK generators read:
 * - a check that JSON Schema cannot express stops the build instead of being left out;
 * - a response object accepts fields added later (forward compatibility);
 * - a tagged union names its tag, so a client can narrow it;
 * - a set of whole numbers is typed as integers, and in a response it stays a plain integer, so
 *   that a client does not refuse a value a later version adds (the values go into the text);
 * - zod's safe-integer bounds and the pattern that repeats a date format are left out.
 */
function adjust(io: Io) {
	return ({ zodSchema, jsonSchema }: { zodSchema: z.core.$ZodType; jsonSchema: JsonSchema }) => {
		const checks = zodSchema instanceof z.ZodType ? (zodSchema.def.checks ?? []) : [];

		if (!checks.every((check) => isDescribed(check))) {
			throw new Error("A custom check cannot be described in JSON Schema.");
		}

		if (io === "output" && zodSchema instanceof z.ZodObject) {
			delete jsonSchema.additionalProperties;
		}

		if (zodSchema instanceof z.ZodDiscriminatedUnion) {
			jsonSchema["discriminator"] = { propertyName: zodSchema.def.discriminator };
		}

		const values = jsonSchema.enum ?? [];
		const whole = values.every((value) => Number.isInteger(value));

		if (jsonSchema.type === "number" && values.length > 0 && whole) {
			jsonSchema.type = "integer";
		}

		if (io === "output" && jsonSchema.type === "integer" && values.length > 0) {
			jsonSchema[KNOWN_VALUES] = values;
			delete jsonSchema.enum;
		}

		if (jsonSchema.minimum === -Number.MAX_SAFE_INTEGER) {
			delete jsonSchema.minimum;
		}

		if (jsonSchema.maximum === Number.MAX_SAFE_INTEGER) {
			delete jsonSchema.maximum;
		}

		if (jsonSchema.format === "date" || jsonSchema.format === "date-time") {
			delete jsonSchema.pattern;
		}
	};
}

const discriminatorSchema = z.object({ propertyName: z.string() });

/** The property that tells the variants of a tagged union apart, if `schema` is one. */
export function tagOf(schema: JsonSchema): string | undefined {
	return discriminatorSchema.safeParse(schema["discriminator"]).data?.propertyName;
}

/**
 * Maps each value of a union's tag to the component of its variant, as the SDK generators
 * need. Every variant must be a named component whose tag is a constant.
 */
function mapTags(schemas: Record<string, JsonSchema>): void {
	for (const schema of Object.values(schemas)) {
		const parsed = discriminatorSchema.safeParse(schema["discriminator"]);

		if (!parsed.success) {
			continue;
		}

		const key = parsed.data.propertyName;
		const mapping: Record<string, string> = {};

		for (const variant of schema.oneOf ?? []) {
			const target = schemaOf(variant)?.$ref;
			const name = target?.slice(COMPONENTS.length) ?? "";
			const property = schemas[name]?.properties?.[key];
			const value = property === undefined ? undefined : schemaOf(property)?.const;
			const tag = z.string().safeParse(value);

			if (target === undefined || !tag.success) {
				throw new Error(`Each variant of a union tagged by ${key} must be a named component.`);
			}

			mapping[tag.data] = target;
		}

		schema["discriminator"] = { propertyName: key, mapping };
	}
}

/** The JSON Schema of each of `components`, by name, with references between them. */
export function componentSchemas(io: Io, components: Component[]): Record<string, JsonSchema> {
	const registry = z.registry<{ id: string }>();

	for (const [id, schema] of components) {
		registry.add(schema, { id });
	}

	const { schemas } = z.toJSONSchema(registry, {
		io,
		target: "draft-2020-12",
		uri: (id) => `${COMPONENTS}${id}`,
		override: adjust(io),
	});

	// A component sits inside the document, which names the JSON Schema dialect once.
	const named = Object.fromEntries(
		Object.entries(schemas).map(([name, { $schema: _dialect, $id: _id, ...schema }]) => [
			name,
			schema,
		]),
	);

	mapTags(named);

	return named;
}

const textsSchema = z.object({
	title: z.string(),
	description: z.string(),
	tags: z.record(z.string(), z.string()),
	security: z.record(z.string(), z.string()),
	operations: z.record(z.string(), z.object({ summary: z.string(), description: z.string() })),
	parameters: z.record(z.string(), z.string()),
	headers: z.record(z.string(), z.string()),
	responses: z.record(z.string(), z.string()),
	schemas: z.record(z.string(), z.string()),
	/** Names the values of a response enum; `{values}` stands for the list. */
	knownValues: z.string(),
	/** A field's text wherever it appears, unless `propertiesOf` has one for its component. */
	properties: z.record(z.string(), z.string()),
	propertiesOf: z.record(z.string(), z.record(z.string(), z.string())),
	problems: z.record(z.string(), z.string()),
});

type Texts = z.output<typeof textsSchema>;

/** The text at `key` of `group`; a missing text stops the build, so nothing goes undescribed. */
function lookup<Text>(group: Record<string, Text>, path: string, key: string): Text {
	const text = group[key];

	if (text === undefined) {
		throw new Error(`The message catalog has no API text at ${path}.${key}.`);
	}

	return text;
}

/** Puts a description on each component and on each of its properties. */
function describeComponents(schemas: Record<string, JsonSchema>, texts: Texts): void {
	for (const [name, schema] of Object.entries(schemas)) {
		schema.description = lookup(texts.schemas, "schemas", name);

		for (const [property, value] of Object.entries(schema.properties ?? {})) {
			const described = schemaOf(value);

			if (described !== undefined) {
				described.description =
					texts.propertiesOf[name]?.[property] ?? lookup(texts.properties, "properties", property);
			}
		}
	}
}

/** Replaces the marked values of a response enum with a sentence in the text of the field. */
function nameKnownValues(schema: JsonSchema, texts: Texts): void {
	const values = z.array(z.number()).safeParse(schema[KNOWN_VALUES]);

	if (values.success) {
		const sentence = texts.knownValues.replace("{values}", values.data.join(", "));

		schema.description =
			schema.description === undefined ? sentence : `${schema.description} ${sentence}`;
		delete schema[KNOWN_VALUES];
	}

	for (const property of Object.values(schema.properties ?? {})) {
		const described = schemaOf(property);

		if (described !== undefined) {
			nameKnownValues(described, texts);
		}
	}

	const items = Array.isArray(schema.items) ? undefined : schema.items;
	const element = items === undefined ? undefined : schemaOf(items);

	if (element !== undefined) {
		nameKnownValues(element, texts);
	}
}

const SCHEDULE_PROBLEMS: ProblemCode[] = [
	"no_days",
	"range_reversed",
	"too_many_dates",
	"duplicate_day",
	"date_in_past",
	"out_of_day",
	"end_not_after_start",
	"not_on_slot_boundary",
];

type Secret = "adminSecret" | "participantToken";

type HeaderName = "ETag" | "Location" | "Retry-After" | "WWW-Authenticate";

type Operation = {
	id: string;
	method: "get" | "post" | "put" | "patch" | "delete";
	path: string;
	tag: "events" | "participants" | "description";
	secret?: Secret;
	query?: z.ZodObject;
	/** The component of the request body. */
	body?: string;
	success: { status: 200 | 201 | 204; body?: string; headers?: HeaderName[] };
	/** Answers `If-None-Match` with `304`. */
	conditional?: true;
	/** Refuses a change with `412` when `If-Match` names no current version. */
	ifMatch?: true;
	/** Codes this operation adds to those every operation of its kind can return. */
	problems: ProblemCode[];
};

const OPERATIONS: Operation[] = [
	{
		id: "createEvent",
		method: "post",
		path: "/events",
		tag: "events",
		body: "CreateEventRequest",
		success: { status: 201, body: "CreatedEvent", headers: ["Location"] },
		problems: SCHEDULE_PROBLEMS,
	},
	{
		id: "getEvent",
		method: "get",
		path: "/events/{id}",
		tag: "events",
		success: { status: 200, body: "Event", headers: ["ETag"] },
		conditional: true,
		problems: [],
	},
	{
		id: "updateEvent",
		method: "patch",
		path: "/events/{id}",
		tag: "events",
		secret: "adminSecret",
		body: "UpdateEventRequest",
		success: { status: 200, body: "Event", headers: ["ETag"] },
		ifMatch: true,
		problems: [...SCHEDULE_PROBLEMS, "field_locked", "confirmation_required", "event_changed"],
	},
	{
		id: "deleteEvent",
		method: "delete",
		path: "/events/{id}",
		tag: "events",
		secret: "adminSecret",
		success: { status: 204 },
		problems: [],
	},
	{
		id: "pickFinal",
		method: "put",
		path: "/events/{id}/final",
		tag: "events",
		secret: "adminSecret",
		body: "FinalRequest",
		success: { status: 200, body: "Event", headers: ["ETag"] },
		ifMatch: true,
		problems: ["final_not_in_event", "final_date_wrong_weekday", "date_in_past", "event_changed"],
	},
	{
		id: "clearFinal",
		method: "delete",
		path: "/events/{id}/final",
		tag: "events",
		secret: "adminSecret",
		success: { status: 200, body: "Event", headers: ["ETag"] },
		ifMatch: true,
		problems: ["event_changed"],
	},
	{
		id: "getWindows",
		method: "get",
		path: "/events/{id}/windows",
		tag: "events",
		query: windowsQuerySchema,
		success: { status: 200, body: "Windows", headers: ["ETag"] },
		conditional: true,
		problems: [],
	},
	{
		id: "join",
		method: "post",
		path: "/events/{id}/participants",
		tag: "participants",
		body: "JoinRequest",
		success: { status: 200, body: "Joined" },
		problems: [
			"invalid_name",
			"invalid_password",
			"event_full",
			"password_required",
			"wrong_password",
			"no_password",
			"name_exists",
			"name_unknown",
			"too_many_attempts",
		],
	},
	{
		id: "removeParticipant",
		method: "delete",
		path: "/events/{id}/participants/{participantId}",
		tag: "participants",
		secret: "adminSecret",
		success: { status: 204 },
		problems: ["not_found"],
	},
	{
		id: "getMe",
		method: "get",
		path: "/events/{id}/participants/me",
		tag: "participants",
		secret: "participantToken",
		success: { status: 200, body: "Participant" },
		problems: [],
	},
	{
		id: "leave",
		method: "delete",
		path: "/events/{id}/participants/me",
		tag: "participants",
		secret: "participantToken",
		success: { status: 204 },
		problems: [],
	},
	{
		id: "saveAvailability",
		method: "put",
		path: "/events/{id}/participants/me/availability",
		tag: "participants",
		secret: "participantToken",
		body: "AvailabilityRequest",
		success: { status: 200, body: "Participant" },
		problems: ["unknown_slot"],
	},
	{
		id: "setPassword",
		method: "put",
		path: "/events/{id}/participants/me/password",
		tag: "participants",
		secret: "participantToken",
		body: "SetPasswordRequest",
		success: { status: 204 },
		problems: [
			"invalid_password",
			"password_required",
			"wrong_password",
			"no_password",
			"too_many_attempts",
		],
	},
	{
		id: "removePassword",
		method: "delete",
		path: "/events/{id}/participants/me/password",
		tag: "participants",
		secret: "participantToken",
		body: "RemovePasswordRequest",
		success: { status: 204 },
		problems: ["wrong_password", "no_password", "too_many_attempts"],
	},
	{
		id: "getOpenApi",
		method: "get",
		path: "/openapi.json",
		tag: "description",
		success: { status: 200 },
		problems: [],
	},
];

/** The codes every operation of this kind can return, besides its own. */
function kindProblems(operation: Operation): ProblemCode[] {
	const codes: ProblemCode[] = ["secret_in_query", "internal_error"];

	if (operation.body !== undefined) {
		codes.push("invalid_request", "unsupported_media_type", "payload_too_large");
	}

	if (operation.query !== undefined) {
		codes.push("invalid_request");
	}

	if (operation.secret !== undefined) {
		codes.push("unauthorized", "wrong_secret_kind");
	} else if (operation.path.includes("{")) {
		codes.push("not_found");
	}

	return codes;
}

/** The codes an operation can return, in status order. */
function problemCodes(operation: Operation): ProblemCode[] {
	return [...new Set([...kindProblems(operation), ...operation.problems])].toSorted(
		(left, right) => PROBLEM_STATUS[left] - PROBLEM_STATUS[right] || left.localeCompare(right),
	);
}

/** The problem codes of each operation by its id, which the reference page links to. */
export const OPERATION_PROBLEMS: ReadonlyMap<string, ProblemCode[]> = new Map(
	OPERATIONS.map((operation) => [operation.id, problemCodes(operation)]),
);

type Parameter = {
	name: string;
	in: "path" | "query" | "header";
	required: boolean;
	description: string;
	schema: JsonSchema;
};

const PUBLIC_ID: JsonSchema = {
	type: "string",
	pattern: `^[${PUBLIC_ID_ALPHABET}]{${PUBLIC_ID_LENGTH}}$`,
};

function parameters(operation: Operation, texts: Texts): Parameter[] {
	const text = (name: string) => lookup(texts.parameters, "parameters", name);

	const inPath = [...operation.path.matchAll(/\{(\w+)\}/gu)].map(([, name = ""]): Parameter => ({
		name,
		in: "path",
		required: true,
		description: text(name),
		schema: PUBLIC_ID,
	}));

	const queryProperties =
		operation.query === undefined
			? {}
			: (z.toJSONSchema(operation.query, { io: "output", override: adjust("output") }).properties ??
				{});

	const inQuery = Object.entries(queryProperties).flatMap(([name, value]): Parameter[] => {
		const schema = schemaOf(value);

		return schema === undefined
			? []
			: [{ name, in: "query", required: false, description: text(name), schema }];
	});

	const header = (name: "If-None-Match" | "If-Match"): Parameter => ({
		name,
		in: "header",
		required: false,
		description: text(name),
		schema: { type: "string" },
	});

	const conditional = [
		...(operation.conditional === true ? [header("If-None-Match")] : []),
		...(operation.ifMatch === true ? [header("If-Match")] : []),
	];

	return [...inPath, ...inQuery, ...conditional];
}

type Header = { description: string; schema: JsonSchema };

type MediaType = "application/json" | "application/problem+json";

type ResponseObject = {
	description: string;
	headers?: Partial<Record<HeaderName, Header>>;
	content?: Partial<Record<MediaType, { schema: Reference | JsonSchema }>>;
};

function headers(names: HeaderName[], texts: Texts): Partial<Record<HeaderName, Header>> {
	return Object.fromEntries(
		names.map((name) => [
			name,
			{ description: lookup(texts.headers, "headers", name), schema: { type: "string" } },
		]),
	);
}

function successResponse(operation: Operation, texts: Texts): ResponseObject {
	const { status, body, headers: names = [] } = operation.success;

	const response: ResponseObject = {
		description: lookup(texts.responses, "responses", operation.id),
	};

	if (names.length > 0) {
		response.headers = headers(names, texts);
	}

	if (body !== undefined) {
		response.content = { "application/json": { schema: ref(body) } };
	} else if (status !== 204) {
		response.content = { "application/json": { schema: { type: "object" } } };
	}

	return response;
}

/** The headers the problems of `codes`, which share `status`, carry. */
function problemHeaders(status: number, codes: ProblemCode[]): HeaderName[] {
	switch (status) {
		case 401:
			return ["WWW-Authenticate"];
		case 412:
			return ["ETag"];
		case 429:
			return ["Retry-After"];
		default:
			return codes.includes("confirmation_required") ? ["ETag"] : [];
	}
}

/** Responses by HTTP status. */
type Responses = Record<`${number}`, ResponseObject>;

/** The responses of an operation: its success and one problem response per status. */
function responses(operation: Operation, texts: Texts): Responses {
	const answers: Responses = {
		[`${operation.success.status}`]: successResponse(operation, texts),
	};

	if (operation.conditional === true) {
		answers["304"] = {
			description: lookup(texts.responses, "responses", "notModified"),
			headers: headers(["ETag"], texts),
		};
	}

	for (const [status, codes] of Map.groupBy(
		problemCodes(operation),
		(code) => PROBLEM_STATUS[code],
	)) {
		const response: ResponseObject = {
			description: codes
				.map((code) => `\`${code}\`: ${lookup(texts.problems, "problems", code)}`)
				.join("\n\n"),
			content: { "application/problem+json": { schema: ref("Problem") } },
		};

		const names = problemHeaders(status, codes);

		if (names.length > 0) {
			response.headers = headers(names, texts);
		}

		answers[`${status}`] = response;
	}

	return answers;
}

type OperationObject = {
	operationId: string;
	summary: string;
	description: string;
	tags: string[];
	security: Partial<Record<Secret, []>>[];
	parameters?: Parameter[];
	requestBody?: {
		required: true;
		content: Partial<Record<MediaType, { schema: Reference }>>;
	};
	responses: Responses;
};

function operationObject(operation: Operation, texts: Texts): OperationObject {
	const { summary, description } = lookup(texts.operations, "operations", operation.id);
	const inputs = parameters(operation, texts);

	const object: OperationObject = {
		operationId: operation.id,
		summary,
		description,
		tags: [operation.tag],
		security: operation.secret === undefined ? [] : [{ [operation.secret]: [] }],
		responses: responses(operation, texts),
	};

	if (inputs.length > 0) {
		object.parameters = inputs;
	}

	if (operation.body !== undefined) {
		object.requestBody = {
			required: true,
			content: { "application/json": { schema: ref(operation.body) } },
		};
	}

	return object;
}

type SecurityScheme = { type: "http"; scheme: "bearer"; description: string };

export type OpenApiDocument = {
	openapi: "3.1.1";
	info: {
		title: string;
		version: string;
		description: string;
		license: { name: string; identifier: string };
	};
	servers: { url: string }[];
	tags: { name: string; description: string }[];
	paths: Record<string, Partial<Record<Operation["method"], OperationObject>>>;
	components: {
		schemas: Record<string, JsonSchema>;
		securitySchemes: Record<Secret, SecurityScheme>;
	};
};

const CATALOGS = { cs, en } satisfies Record<Locale, typeof en>;

/** The OpenAPI 3.1 document of `/api/v1`, described in `locale`. */
export function openApiDocument(locale: Locale): OpenApiDocument {
	const texts = textsSchema.parse(CATALOGS[locale].ApiReference);
	const output = componentSchemas("output", OUTPUT_COMPONENTS);
	const input = componentSchemas("input", INPUT_COMPONENTS);
	const schemas = { ...output, ...input };

	if (Object.keys(schemas).length !== Object.keys(output).length + Object.keys(input).length) {
		throw new Error("A request component and a response component share a name.");
	}

	describeComponents(schemas, texts);

	for (const schema of Object.values(output)) {
		nameKnownValues(schema, texts);
	}

	const paths: OpenApiDocument["paths"] = {};

	for (const operation of OPERATIONS) {
		paths[operation.path] = {
			...paths[operation.path],
			[operation.method]: operationObject(operation, texts),
		};
	}

	const scheme = (secret: Secret): SecurityScheme => ({
		type: "http",
		scheme: "bearer",
		description: lookup(texts.security, "security", secret),
	});

	return {
		openapi: "3.1.1",
		info: {
			title: texts.title,
			version: "1",
			description: texts.description,
			license: { name: "AGPL-3.0-only", identifier: "AGPL-3.0-only" },
		},
		servers: [{ url: "/api/v1" }],
		tags: Object.entries(texts.tags).map(([name, description]) => ({ name, description })),
		paths,
		components: {
			schemas,
			securitySchemes: {
				adminSecret: scheme("adminSecret"),
				participantToken: scheme("participantToken"),
			},
		},
	};
}
