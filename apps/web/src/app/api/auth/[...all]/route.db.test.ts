import { afterEach, describe, expect, it, vi } from "vitest";

import { auth } from "@/server/auth";

import { GET } from "./route";

class QueryFailed extends Error {}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("a refusal of Better Auth", () => {
	it("keeps its status and code and is not logged as a failure", async () => {
		const logged = vi.spyOn(console, "error");

		const response = await GET(
			new Request("http://localhost:3000/api/auth/passkey/generate-register-options"),
		);

		expect(response.status).toBe(401);
		expect(await response.json()).toMatchObject({ code: "UNAUTHORIZED" });
		expect(logged).not.toHaveBeenCalled();
	});
});

describe("an unexpected error of Better Auth", () => {
	it("is logged by its class name only", async () => {
		const context = await auth()?.$context;

		if (context === undefined) {
			throw new Error("The database tests run with accounts on.");
		}

		vi.spyOn(context.internalAdapter, "findVerificationValue").mockRejectedValue(
			new QueryFailed("select from auth_verifications where token = 'secret'"),
		);

		const logged = vi.spyOn(console, "error");

		const response = await GET(
			new Request("http://localhost:3000/api/auth/magic-link/verify?token=secret"),
		);

		expect(response.status).toBe(500);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(logged.mock.calls).toEqual([["A sign-in request failed with QueryFailed."]]);
	});
});
