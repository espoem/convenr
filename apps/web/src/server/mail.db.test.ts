import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { emailCounts } from "@/db/schema";

import { LINKS_PER_ADDRESS, takeEmailSlot } from "./mail";

const now = Temporal.Instant.from("2027-03-01T12:20:00Z");

beforeEach(async () => {
	await db().delete(emailCounts);
});

/** Takes a slot for each address in turn, as emails asked for one after another. */
async function takeEach(addresses: string[]): Promise<boolean[]> {
	const [first, ...rest] = addresses;

	if (first === undefined) {
		return [];
	}

	const taken = await takeEmailSlot(first, now);

	return [taken, ...(await takeEach(rest))];
}

const sameAddress = Array.from({ length: LINKS_PER_ADDRESS + 1 }, () => "Jana@example.org");

describe("the email limits", () => {
	it("allow a few links per address in an hour, and again in the next hour", async () => {
		expect(await takeEach(sameAddress)).toEqual([true, true, true, false]);
		// The same address in another case is the same address.
		expect(await takeEmailSlot("jana@example.org", now)).toBe(false);
		expect(await takeEmailSlot("jana@example.org", now.add({ hours: 1 }))).toBe(true);
	});

	it("stop every email once the instance's hourly total is reached", async () => {
		const addresses = ["a", "b", "c", "d", "e", "f"].map((name) => `${name}@example.org`);

		// The test instance allows 5 an hour.
		expect(await takeEach(addresses)).toEqual([true, true, true, true, true, false]);
		expect(await takeEmailSlot(null, now)).toBe(false);
	});

	it("store no address, only its HMAC and the instance total", async () => {
		await takeEmailSlot("jana@example.org", now);

		const rows = await db().select().from(emailCounts);

		expect(JSON.stringify(rows)).not.toContain("jana");
		expect(rows.map((row) => row.key)).toContain("all");
	});

	it("count nothing for an address that is refused", async () => {
		await takeEach(sameAddress);

		const [total] = await db().select().from(emailCounts).where(eq(emailCounts.key, "all"));

		expect(total?.count).toBe(LINKS_PER_ADDRESS);
	});
});
