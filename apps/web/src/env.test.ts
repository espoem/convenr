import { describe, expect, it } from "vitest";

import { parseEnv } from "./env";

describe("parseEnv", () => {
	it("accepts a postgres URL", () => {
		const url = "postgres://user:secret@db:5432/convenr";
		expect(parseEnv({ DATABASE_URL: url }).DATABASE_URL).toBe(url);
	});

	it("accepts the postgresql scheme", () => {
		expect(() => parseEnv({ DATABASE_URL: "postgresql://user@localhost/convenr" })).not.toThrow();
	});

	it("rejects a missing database URL", () => {
		expect(() => parseEnv({})).toThrow(/DATABASE_URL/u);
	});

	it("reads the retention period as days or never", () => {
		const url = "postgres://user@localhost/convenr";

		expect(parseEnv({ DATABASE_URL: url }).RETENTION_DAYS).toBe(90);
		expect(parseEnv({ DATABASE_URL: url, RETENTION_DAYS: "30" }).RETENTION_DAYS).toBe(30);
		expect(parseEnv({ DATABASE_URL: url, RETENTION_DAYS: "never" }).RETENTION_DAYS).toBe("never");
		expect(() => parseEnv({ DATABASE_URL: url, RETENTION_DAYS: "0" })).toThrow(/RETENTION_DAYS/u);
	});

	it("streams changes by default and reads the live update timings", () => {
		const url = "postgres://user@localhost/convenr";
		const defaults = parseEnv({ DATABASE_URL: url });

		expect(defaults.LIVE_UPDATES).toBe("push");
		expect(defaults.LIVE_POLL_SECONDS).toBe(15);
		expect(defaults.LIVE_STREAM_SECONDS).toBe(300);
		expect(defaults.LIVE_IDLE_MINUTES).toBe(30);
		expect(defaults.DATABASE_LISTEN_URL).toBeUndefined();

		const poll = parseEnv({
			DATABASE_URL: url,
			LIVE_UPDATES: "poll",
			LIVE_POLL_SECONDS: "5",
			LIVE_IDLE_MINUTES: "10",
		});

		expect(poll.LIVE_UPDATES).toBe("poll");
		expect(poll.LIVE_POLL_SECONDS).toBe(5);
		expect(poll.LIVE_IDLE_MINUTES).toBe(10);
		expect(() => parseEnv({ DATABASE_URL: url, LIVE_UPDATES: "stream" })).toThrow(/LIVE_UPDATES/u);
		expect(() => parseEnv({ DATABASE_URL: url, LIVE_POLL_SECONDS: "0" })).toThrow(
			/LIVE_POLL_SECONDS/u,
		);
	});

	it("rejects a URL for another database", () => {
		expect(() => parseEnv({ DATABASE_URL: "mysql://user@localhost/convenr" })).toThrow(
			/DATABASE_URL/u,
		);
	});

	describe("accounts", () => {
		const url = "postgres://user@localhost/convenr";

		const all = {
			DATABASE_URL: url,
			SMTP_URL: "smtp://mail.example.org:587",
			MAIL_FROM: "convenr <hello@example.org>",
			AUTH_SECRET: "s".repeat(32),
			PUBLIC_URL: "https://convenr.example.org",
		};

		it("are off without their settings", () => {
			expect(parseEnv({ DATABASE_URL: url }).accounts).toEqual({ kind: "off" });
		});

		it("are on with all of their settings", () => {
			expect(parseEnv(all).accounts).toMatchObject({
				kind: "on",
				mailFrom: "convenr <hello@example.org>",
				publicUrl: new URL("https://convenr.example.org"),
			});
		});

		it("refuse to start with only some of their settings, naming the missing ones", () => {
			const { AUTH_SECRET: _secret, PUBLIC_URL: _url, ...some } = all;

			expect(() => parseEnv(some)).toThrow(/AUTH_SECRET, PUBLIC_URL/u);
		});

		it("refuse a short secret", () => {
			expect(() => parseEnv({ ...all, AUTH_SECRET: "short" })).toThrow(/AUTH_SECRET/u);
		});

		it("offer each provider whose pair of settings is complete", () => {
			const github = { GITHUB_CLIENT_ID: "id", GITHUB_CLIENT_SECRET: "secret" };

			expect(parseEnv(all).accounts).toMatchObject({ providers: [] });
			expect(parseEnv({ ...all, ...github }).accounts).toMatchObject({
				providers: [{ provider: "github", clientId: "id", clientSecret: "secret" }],
			});
			expect(parseEnv({ DATABASE_URL: url, ...github }).accounts).toEqual({ kind: "off" });
		});

		it("refuse to start with half of a provider's pair, naming the missing one", () => {
			expect(() => parseEnv({ ...all, GOOGLE_CLIENT_ID: "id" })).toThrow(/GOOGLE_CLIENT_SECRET/u);
			expect(() => parseEnv({ ...all, GITHUB_CLIENT_SECRET: "secret" })).toThrow(
				/GITHUB_CLIENT_ID/u,
			);
		});
	});
});
