// Generates apps/web/src/app/tokens.css from the token block in DESIGN.md and measures every
// contrast that DESIGN.md states, for the light and the dark theme.
// Usage: nub apps/web/scripts/generate-theme.ts [--check | --contrast]
//   --check     fail when tokens.css is out of date
//   --contrast  print the measured contrasts, to copy into DESIGN.md after a palette change
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

const tokenGroup = z.record(z.string(), z.string());

const tokensSchema = z.object({
	color: tokenGroup,
	"color-dark": tokenGroup,
	font: z.object({ display: z.string(), body: z.string(), mono: z.string() }),
	radius: z.object({ base: z.string() }),
	size: tokenGroup,
});

type Tokens = z.infer<typeof tokensSchema>;

type Colors = Tokens["color"];

// `fg` as a pair states that the better of the two reaches `min`, as for a mark drawn in two colors.
const contrastSchema = z.array(
	z.object({
		fg: z.union([z.string(), z.tuple([z.string(), z.string()])]),
		bg: z.string(),
		min: z.number(),
		light: z.number(),
		dark: z.number(),
	}),
);

type Contrast = z.infer<typeof contrastSchema>[number];

const repositoryRoot = join(import.meta.dirname, "..", "..", "..");
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

const design = readFileSync(designPath, "utf8");

function block<Block>(language: string, schema: z.ZodType<Block>): Block {
	const body = new RegExp(`\`\`\`json ${language}\\n([\\s\\S]*?)\\n\`\`\``, "u").exec(design)?.[1];

	if (body === undefined) {
		throw new Error(`DESIGN.md has no \`\`\`json ${language} block`);
	}

	return schema.parse(JSON.parse(body));
}

/** The hex value of a color token; a value that names another token of the theme follows it. */
function hex(colors: Colors, name: string): string {
	const value = colors[name];

	if (value === undefined) {
		throw new Error(`DESIGN.md does not define the color token "${name}"`);
	}

	return value.startsWith("#") ? value : hex(colors, value);
}

/** A color value as CSS: a reference to another token becomes its variable. */
function cssValue(value: string): string {
	return value.startsWith("#") ? value : `var(--cv-${value})`;
}

function luminance(color: string): number {
	const [red = 0, green = 0, blue = 0] = [1, 3, 5].map((start) => {
		const channel = Number.parseInt(color.slice(start, start + 2), 16) / 255;

		return channel <= 0.040_45 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
	});

	return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** The WCAG contrast ratio of two colors, rounded to two decimals as DESIGN.md states it. */
function ratio(first: string, second: string): number {
	const lighter = Math.max(luminance(first), luminance(second));

	const darker = Math.min(luminance(first), luminance(second));

	return Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100;
}

function measure(colors: Colors, contrast: Contrast): number {
	const background = hex(colors, contrast.bg);

	const foregrounds = [contrast.fg].flat();

	return Math.max(...foregrounds.map((name) => ratio(hex(colors, name), background)));
}

function render(tokens: Tokens): string {
	const lines: string[] = [
		"/* Generated from DESIGN.md by apps/web/scripts/generate-theme.ts. Do not edit. */",
		"",
		":root {",
		"  color-scheme: light;",
	];

	for (const [name, value] of Object.entries(tokens.color)) {
		lines.push(`  --cv-${name}: ${cssValue(value)};`);
	}

	for (const [name, value] of Object.entries(tokens.size)) {
		lines.push(`  --cv-${name}: ${value};`);
	}

	lines.push("");

	for (const [variable, token] of Object.entries(shadcnColors)) {
		hex(tokens.color, token);
		lines.push(`  --${variable}: var(--cv-${token});`);
	}

	lines.push(`  --radius: ${tokens.radius.base};`, "}", "");

	// The device setting chooses the theme unless the visitor picked one, which the server
	// writes on the root element.
	const dark = [
		"  color-scheme: dark;",
		...Object.entries(tokens["color-dark"]).map(
			([name, value]) => `  --cv-${name}: ${cssValue(value)};`,
		),
	];

	lines.push(
		"@media (prefers-color-scheme: dark) {",
		'  :root:not([data-theme="light"]) {',
		...dark.map((line) => `  ${line}`),
		"  }",
		"}",
		"",
		':root[data-theme="dark"] {',
		...dark,
		"}",
		"",
		"@theme inline {",
	);

	for (const name of Object.keys(tokens.color)) {
		lines.push(`  --color-${name}: var(--cv-${name});`);
	}

	lines.push(
		`  --font-sans: ${tokens.font.body};`,
		`  --font-heading: ${tokens.font.display};`,
		`  --font-mono: ${tokens.font.mono};`,
		"}",
		"",
	);

	return lines.join("\n");
}

/** Every way the tokens and the stated contrasts disagree. */
function problems(tokens: Tokens, contrasts: Contrast[]): string[] {
	const found: string[] = [];

	const lightNames = Object.keys(tokens.color).toSorted().join();

	if (Object.keys(tokens["color-dark"]).toSorted().join() !== lightNames) {
		found.push("color and color-dark must define the same tokens");
	}

	for (const contrast of contrasts) {
		const label = `${String(contrast.fg)} on ${contrast.bg}`;

		for (const theme of ["light", "dark"] as const) {
			const measured = measure(theme === "light" ? tokens.color : tokens["color-dark"], contrast);

			if (measured !== contrast[theme]) {
				found.push(
					`${label} (${theme}): DESIGN.md states ${contrast[theme]}, measured ${measured}`,
				);
			}

			if (measured < contrast.min) {
				found.push(`${label} (${theme}): ${measured} is below ${contrast.min}`);
			}
		}
	}

	return found;
}

const tokens = block("tokens", tokensSchema);

const contrasts = block("contrast", contrastSchema);

if (process.argv.includes("--contrast")) {
	for (const contrast of contrasts) {
		console.log(
			JSON.stringify({
				...contrast,
				light: measure(tokens.color, contrast),
				dark: measure(tokens["color-dark"], contrast),
			}),
		);
	}

	process.exit(0);
}

const found = problems(tokens, contrasts);

if (found.length > 0) {
	console.error(`DESIGN.md disagrees with its tokens:\n${found.join("\n")}`);
	process.exit(1);
}

const css = render(tokens);

if (process.argv.includes("--check")) {
	if (readFileSync(outputPath, "utf8") !== css) {
		console.error("apps/web/src/app/tokens.css is out of date. Run: mise run theme");
		process.exit(1);
	}
} else {
	writeFileSync(outputPath, css);
}
