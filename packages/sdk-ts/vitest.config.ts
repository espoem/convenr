import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		projects: [
			{ extends: true, test: { name: "unit", include: ["src/**/*.test.ts"] } },
			{
				// Needs a running instance at CONVENR_URL: `mise run sdk:acceptance` starts one.
				extends: true,
				test: { name: "acceptance", include: ["acceptance/**/*.test.ts"] },
			},
		],
	},
});
