import { defineConfig } from "@hey-api/openapi-ts";

// This package exists only because the generator needs the TypeScript 6 compiler API, while
// packages/sdk-ts uses TypeScript 7. Once @hey-api/openapi-ts supports TypeScript 7, move the
// generator into packages/sdk-ts and remove this package.

export default defineConfig({
	input: "../../apps/web/openapi.json",
	// Node.js resolves ES module imports only with their file extension.
	output: { path: "../sdk-ts/src/generated", module: { extension: ".js" } },
	plugins: [
		// The document's server is the relative `/api/v1`; a client names its instance's address.
		{ name: "@hey-api/client-fetch", baseUrl: false },
		"@hey-api/typescript",
		"@hey-api/sdk",
	],
});
