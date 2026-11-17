import { expect, test } from "@playwright/test";

// ADR 0003 item 9.
test.describe("security headers", () => {
	test("sends a strict policy with a fresh nonce and blocks no script of the page", async ({
		page,
	}) => {
		const violations: string[] = [];

		page.on("console", (message) => {
			if (message.type() === "error" && message.text().includes("Content Security Policy")) {
				violations.push(message.text());
			}
		});

		const first = await page.goto("/cs");
		const second = await page.request.get("/cs");
		const policy = first?.headers()["content-security-policy"] ?? "";

		expect(policy).toMatch(/script-src 'self' 'nonce-[\w+/=]+' 'strict-dynamic'/u);
		expect(policy).toContain("frame-ancestors 'none'");
		expect(second.headers()["content-security-policy"]).not.toBe(policy);
		expect(first?.headers()["referrer-policy"]).toBe("no-referrer");
		expect(first?.headers()["cache-control"]).toContain("no-store");

		// A button that only works after hydration proves the page's scripts ran.
		await page
			.getByRole("navigation", { name: "Jazyk" })
			.getByRole("link", { name: "English" })
			.click();
		await expect(page).toHaveURL(/\/en$/u);
		expect(violations).toEqual([]);
	});
});
