import { describe, expect, it } from "vitest";
import { z } from "zod";

import cs from "../../messages/cs.json";
import en from "../../messages/en.json";
import { routing } from "./routing";

type Entry = { kind: "text"; path: string; text: string } | { kind: "group"; entries: Entry[] };

// A catalog is a tree of groups whose leaves are message texts.
function catalogSchema(prefix: string): z.ZodType<Entry> {
  return z.union([
    z.string().transform((text): Entry => ({ kind: "text", path: prefix, text })),
    z.record(z.string(), z.unknown()).transform((group): Entry => ({
      kind: "group",
      entries: Object.entries(group).map(([key, value]) =>
        catalogSchema(prefix === "" ? key : `${prefix}.${key}`).parse(value),
      ),
    })),
  ]);
}

function texts(entry: Entry): { path: string; text: string }[] {
  return entry.kind === "text" ? [entry] : entry.entries.flatMap(texts);
}

// English is the reference catalog; Czech must have the same shape.
type Catalog = typeof en;

function parseCatalog(catalog: Catalog): { path: string; text: string }[] {
  return texts(catalogSchema("").parse(catalog)).toSorted((left, right) =>
    left.path.localeCompare(right.path),
  );
}

function paths(catalog: Catalog): string[] {
  return parseCatalog(catalog).map((message) => message.path);
}

describe("message catalogs", () => {
  it("has one catalog per supported language", () => {
    expect(routing.locales.toSorted()).toEqual(["cs", "en"]);
  });

  it("defines the same keys in Czech and English", () => {
    expect(paths(cs)).toEqual(paths(en));
  });

  it("leaves no message empty", () => {
    for (const catalog of [cs, en]) {
      const empty = parseCatalog(catalog).filter((message) => message.text.trim() === "");

      expect(empty).toEqual([]);
    }
  });
});
