import { describe, expect, it } from "vitest";
import { z } from "zod";

import { componentSchemas, openApiDocument } from "./openapi";

const document = openApiDocument();

const json = `${JSON.stringify(document, null, "\t")}\n`;

const documentSchema = z.object({
	paths: z.record(z.string(), z.record(z.string(), z.object({ operationId: z.string() }))),
	components: z.object({ schemas: z.record(z.string(), z.record(z.string(), z.unknown())) }),
});

const { paths, components } = documentSchema.parse(document);

describe("the OpenAPI document", () => {
	// `mise run openapi` writes the copy; CI fails when the copy is out of date.
	it("matches the committed copy", async () => {
		await expect(json).toMatchFileSnapshot("../../../openapi.json");
	});

	it("describes every endpoint of the API", () => {
		const operations = Object.entries(paths).flatMap(([path, methods]) =>
			Object.keys(methods).map((method) => `${method.toUpperCase()} /api/v1${path}`),
		);

		expect(operations.toSorted()).toEqual(
			[
				"POST /api/v1/events",
				"GET /api/v1/events/{id}",
				"PATCH /api/v1/events/{id}",
				"DELETE /api/v1/events/{id}",
				"GET /api/v1/events/{id}/windows",
				"POST /api/v1/events/{id}/participants",
				"DELETE /api/v1/events/{id}/participants/{participantId}",
				"GET /api/v1/events/{id}/participants/me",
				"DELETE /api/v1/events/{id}/participants/me",
				"PUT /api/v1/events/{id}/participants/me/availability",
				"PUT /api/v1/events/{id}/participants/me/password",
				"DELETE /api/v1/events/{id}/participants/me/password",
				"GET /api/v1/openapi.json",
			].toSorted(),
		);
	});

	it("tags the schedule by mode, with a mapping to each variant", () => {
		expect(components.schemas["Schedule"]?.["discriminator"]).toEqual({
			propertyName: "mode",
			mapping: {
				dates: "#/components/schemas/DatesSchedule",
				range: "#/components/schemas/RangeSchedule",
				weekdays: "#/components/schemas/WeekdaysSchedule",
			},
		});

		expect(components.schemas["ScheduleInput"]?.["discriminator"]).toEqual({
			propertyName: "mode",
			mapping: {
				dates: "#/components/schemas/DatesScheduleInput",
				range: "#/components/schemas/RangeScheduleInput",
				weekdays: "#/components/schemas/WeekdaysScheduleInput",
			},
		});
	});

	it("lets a response carry fields a client does not know and a request only its own", () => {
		expect(components.schemas["Event"]).not.toHaveProperty("additionalProperties");
		expect(components.schemas["Problem"]).not.toHaveProperty("additionalProperties");
		expect(components.schemas["CreateEventRequest"]?.["additionalProperties"]).toBe(false);
		expect(components.schemas["DatesScheduleInput"]?.["additionalProperties"]).toBe(false);
	});

	it("stops at a check that JSON Schema cannot express", () => {
		const refined = z.object({ name: z.string().refine((name) => name !== "admin") });

		expect(() => componentSchemas("input", [["Refined", refined]])).toThrow(/custom check/u);
	});

	it("stops at a tagged union whose variant is not a named component", () => {
		const union = z.discriminatedUnion("kind", [z.object({ kind: z.literal("a") })]);

		expect(() => componentSchemas("output", [["Union", union]])).toThrow(/named component/u);
	});
});
