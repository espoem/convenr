import { describe, expect, it } from "vitest";

import cs from "../../messages/cs.json";
import en from "../../messages/en.json";

import { routing } from "./routing";

type Messages = { [key: string]: string | Messages };

function keyPaths(messages: Messages, prefix = ""): string[] {
  return Object.entries(messages)
    .flatMap(([key, value]) =>
      typeof value === "string" ? [`${prefix}${key}`] : keyPaths(value, `${prefix}${key}.`),
    )
    .toSorted();
}

describe("message catalogs", () => {
  it("has one catalog per supported language", () => {
    expect(routing.locales.toSorted()).toEqual(["cs", "en"]);
  });

  it("defines the same keys in Czech and English", () => {
    expect(keyPaths(cs)).toEqual(keyPaths(en));
  });

  it("leaves no message empty", () => {
    for (const catalog of [cs, en]) {
      const empty = keyPaths(catalog).filter((path) => {
        const value = path
          .split(".")
          .reduce<string | Messages | undefined>(
            (node, key) => (typeof node === "object" ? node[key] : undefined),
            catalog,
          );
        return typeof value !== "string" || value.trim() === "";
      });
      expect(empty).toEqual([]);
    }
  });
});
