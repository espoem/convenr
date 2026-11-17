// Generates apps/web/src/app/tokens.css from the token block in DESIGN.md.
// Usage: nub apps/web/scripts/generate-theme.ts [--check]
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

const tokenGroup = z.record(z.string(), z.string());

const tokensSchema = z.object({
	color: tokenGroup,
	font: z.object({ display: z.string(), body: z.string(), mono: z.string() }),
	radius: z.object({ base: z.string() }),
	size: tokenGroup,
});

type Tokens = z.infer<typeof tokensSchema>;

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const designPath = join(repositoryRoot, "DESIGN.md");
const outputPath = join(repositoryRoot, "apps/web/src/app/tokens.css");

// Which convenr color token feeds each variable the shadcn components read.
const shadcnColors = {
	background: "background",
	foreground: "ink",
	card: "surface",
	"card-foreground": "ink",
	popover: "surface",
	"popover-foreground": "ink",
	primary: "action",
	"primary-foreground": "on-action",
	secondary: "heat-0",
	"secondary-foreground": "ink",
	muted: "heat-0",
	"muted-foreground": "ink-muted",
	accent: "heat-1",
	"accent-foreground": "ink",
	destructive: "action-active",
	border: "line",
	input: "earth",
	ring: "earth",
} satisfies Record<string, string>;

function readTokens(): Tokens {
	const design = readFileSync(designPath, "utf8");
	const block = /```json tokens\n([\s\S]*?)\n```/.exec(design);

	if (!block?.[1]) {
		throw new Error("DESIGN.md has no ```json tokens block");
	}

	return tokensSchema.parse(JSON.parse(block[1]));
}

function render(tokens: Tokens): string {
	const lines: string[] = [
		"/* Generated from DESIGN.md by apps/web/scripts/generate-theme.ts. Do not edit. */",
		"",
		":root {",
	];

	for (const [name, value] of Object.entries(tokens.color)) {
		lines.push(`  --cv-${name}: ${value};`);
	}

	for (const [name, value] of Object.entries(tokens.size)) {
		lines.push(`  --cv-${name}: ${value};`);
	}

	lines.push("");

	for (const [variable, token] of Object.entries(shadcnColors)) {
		if (tokens.color[token] === undefined) {
			throw new Error(`DESIGN.md does not define the color token "${token}"`);
		}

		lines.push(`  --${variable}: var(--cv-${token});`);
	}

	lines.push(`  --radius: ${tokens.radius.base};`);
	lines.push("}", "", "@theme inline {");

	for (const name of Object.keys(tokens.color)) {
		lines.push(`  --color-${name}: var(--cv-${name});`);
	}

	lines.push(`  --font-sans: ${tokens.font.body};`);
	lines.push(`  --font-heading: ${tokens.font.display};`);
	lines.push(`  --font-mono: ${tokens.font.mono};`);
	lines.push("}", "");

	return lines.join("\n");
}

const css = render(readTokens());

if (process.argv.includes("--check")) {
	const current = readFileSync(outputPath, "utf8");

	if (current !== css) {
		console.error("apps/web/src/app/tokens.css is out of date. Run: mise run theme");
		process.exit(1);
	}
} else {
	writeFileSync(outputPath, css);
}
