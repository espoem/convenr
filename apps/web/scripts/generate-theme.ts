// Generates apps/web/src/app/tokens.css from the token block in DESIGN.md.
// Usage: nub scripts/generate-theme.ts [--check]
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type Tokens = {
  color: Record<string, string>;
  font: Record<string, string>;
  radius: Record<string, string>;
  size: Record<string, string>;
};

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const designPath = join(root, "DESIGN.md");
const outputPath = join(root, "apps/web/src/app/tokens.css");

// Which convenr token feeds each variable the shadcn components read.
const shadcnColors: Record<string, string> = {
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
};

function readTokens(): Tokens {
  const design = readFileSync(designPath, "utf8");
  const block = /```json tokens\n([\s\S]*?)\n```/.exec(design);
  if (!block?.[1]) {
    throw new Error("DESIGN.md has no ```json tokens block");
  }
  return JSON.parse(block[1]) as Tokens;
}

function requireToken(group: Record<string, string>, name: string): string {
  const value = group[name];
  if (value === undefined) {
    throw new Error(`DESIGN.md does not define the token "${name}"`);
  }
  return value;
}

function render(tokens: Tokens): string {
  const lines: string[] = [
    "/* Generated from DESIGN.md by scripts/generate-theme.ts. Do not edit. */",
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
    requireToken(tokens.color, token);
    lines.push(`  --${variable}: var(--cv-${token});`);
  }
  lines.push(`  --radius: ${requireToken(tokens.radius, "base")};`);
  lines.push("}", "", "@theme inline {");
  for (const name of Object.keys(tokens.color)) {
    lines.push(`  --color-${name}: var(--cv-${name});`);
  }
  lines.push(`  --font-sans: ${requireToken(tokens.font, "body")};`);
  lines.push(`  --font-heading: ${requireToken(tokens.font, "display")};`);
  lines.push(`  --font-mono: ${requireToken(tokens.font, "mono")};`);
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
