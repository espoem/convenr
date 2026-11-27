import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const REPOSITORY = join(import.meta.dirname, "../../..");
const OXLINT_BIN = join(REPOSITORY, "node_modules/.bin/oxlint");
const PLUGIN_PATH = join(REPOSITORY, "tools/oxlint/convenr/index.ts");

type LintResult = { status: number; output: string };

function lintSnippet(source: string): LintResult {
	const dir = mkdtempSync(join(tmpdir(), "convenr-oxlint-"));
	const config = join(dir, "oxlintrc.json");
	const file = join(dir, "fixture.tsx");

	writeFileSync(
		config,
		JSON.stringify({
			plugins: [],
			jsPlugins: [{ name: "convenr", specifier: PLUGIN_PATH }],
			rules: { "convenr/no-external-assets": "error" },
		}),
	);
	writeFileSync(file, source);

	try {
		const result = spawnSync(OXLINT_BIN, ["--config", config, file], {
			cwd: REPOSITORY,
			encoding: "utf8",
		});

		return {
			status: result.status ?? 1,
			output: `${result.stdout}${result.stderr}`,
		};
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

describe("convenr/no-external-assets", () => {
	it("allows local assets and external anchor links", () => {
		const result = lintSnippet(`export function Valid() {
	return (
		<div>
			<a href="https://example.com">External site</a>
			<link rel="icon" href="/icon.svg" />
			<img src="/icon.svg" alt="" />
		</div>
	);
}
`);

		expect(result.status).toBe(0);
	});

	it.each([
		["https image src", `<img src="https://cdn.example.com/a.png" alt="" />`],
		["http script src", `<script src="http://cdn.example.com/a.js" />`],
		["protocol-relative img src", `<img src="//cdn.example.com/a.png" alt="" />`],
		[
			"external stylesheet link",
			`<link rel="stylesheet" href="https://fonts.googleapis.com/css2" />`,
		],
		["template literal script src", "<script src={`https://cdn.example.com/${id}`} />"],
	])("rejects %s", (_label, element) => {
		const result = lintSnippet(`export function Invalid({ id }: { id: string }) {
	return <div>{id ? ${element} : null}</div>;
}
`);

		expect(result.status).not.toBe(0);
		expect(result.output).toContain("no-external-assets");
	});
});
