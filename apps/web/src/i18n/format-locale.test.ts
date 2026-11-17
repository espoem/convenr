import { describe, expect, it } from "vitest";

import { formatLocale } from "./format-locale";

describe("T5 format locale", () => {
  it("formats Czech pages in Czech whatever the browser asks for", () => {
    expect(formatLocale("cs", "en-US,en;q=0.9")).toBe("cs");
  });

  it("follows the browser's English variant on English pages", () => {
    expect(formatLocale("en", "en-gb,en;q=0.9")).toBe("en-GB");
    expect(formatLocale("en", "de-DE,en;q=0.5")).toBe("en");
    expect(formatLocale("en", null)).toBe("en");
    expect(formatLocale("en", "en-!!")).toBe("en");
  });
});
