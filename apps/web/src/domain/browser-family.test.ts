import { describe, expect, it } from "vitest";

import { browserFamily } from "./browser-family";

describe("browserFamily", () => {
	it("names the browser and the system, nothing more", () => {
		expect(
			browserFamily("Mozilla/5.0 (Android 15; Mobile; rv:140.0) Gecko/140.0 Firefox/140.0"),
		).toBe("Firefox, Android");
		expect(
			browserFamily(
				"Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
			),
		).toBe("Safari, iOS");
		expect(
			browserFamily(
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0",
			),
		).toBe("Edge, Windows");
		expect(
			browserFamily(
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
			),
		).toBe("Chrome, macOS");
	});

	it("gives nothing for an unknown or missing user agent", () => {
		expect(browserFamily("curl/8.10.1")).toBeNull();
		expect(browserFamily(null)).toBeNull();
	});
});
