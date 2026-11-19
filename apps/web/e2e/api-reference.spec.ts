import { expect, test } from "@playwright/test";

import {
	fieldAnchor,
	problemAnchor,
	schemaAnchor,
} from "../src/components/api-reference/schema-type";
import { FIELD_CODES } from "../src/server/api/field-codes";
import { PROBLEM_STATUS } from "../src/server/api/http";
import { openApiDocument } from "../src/server/api/openapi";

test.describe("API reference", () => {
	test.use({ javaScriptEnabled: false });

	test("shows every endpoint, schema and problem code without scripts", async ({ page }) => {
		await page.goto("/en/api");

		await expect(page.getByRole("heading", { level: 1, name: "convenr API" })).toBeVisible();
		await expect(page.getByRole("heading", { name: "Create an event" })).toBeVisible();
		await expect(page.getByText("POST /api/v1/events", { exact: true })).toBeVisible();
		await expect(page.locator("#schema-DatesSchedule")).toBeVisible();
		await expect(page.locator("#problem-wrong_secret_kind")).toContainText(
			"This endpoint takes the other kind of secret.",
		);

		await page.getByRole("link", { name: "wrong_secret_kind" }).first().click();
		await expect(page).toHaveURL(/#problem-wrong_secret_kind$/u);
	});

	test("is written in Czech under the Czech prefix", async ({ page }) => {
		await page.goto("/cs/api");

		await expect(page.getByRole("heading", { name: "Vytvořit událost" })).toBeVisible();
		await expect(page.locator("#problem-wrong_secret_kind")).toContainText(
			"Tento koncový bod přijímá druhý druh tajného údaje.",
		);
	});

	for (const locale of ["en", "cs"] as const) {
		test(`has an anchor for every operation, schema, problem code and field code in ${locale}`, async ({
			page,
		}) => {
			const document = openApiDocument(locale);

			const expected = [
				...Object.values(document.paths).flatMap((methods) =>
					Object.values(methods).map((operation) => operation.operationId),
				),
				...Object.keys(document.components.schemas).map((name) => schemaAnchor(name)),
				...Object.keys(PROBLEM_STATUS).map((code) => problemAnchor(code)),
				...FIELD_CODES.map((code) => fieldAnchor(code)),
			];

			await page.goto(`/${locale}/api`);

			const present = await page
				.locator("[id]")
				.evaluateAll((elements) => elements.map((element) => element.id));

			expect(expected.length).toBeGreaterThan(40);
			expect(expected.filter((id) => !present.includes(id))).toEqual([]);
		});
	}

	test("resolves the type of a problem to the code's description", async ({ page }) => {
		await page.goto("/problems/not_found");

		await expect(page).toHaveURL(/\/en\/api#problem-not_found$/u);
		await expect(page.locator("#problem-not_found")).toBeVisible();
	});

	test("does not resolve an unknown problem code", async ({ page }) => {
		const response = await page.goto("/en/problems/no_such_code");

		expect(response?.status()).toBe(404);
	});
});
