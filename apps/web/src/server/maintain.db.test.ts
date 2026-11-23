import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { POST } from "@/app/api/maintenance/route";
import { db } from "@/db/client";
import { authSessions, authVerifications, emailCounts, events } from "@/db/schema";
import { env } from "@/env";

import { createEvent } from "./events";
import { maintain } from "./maintain";
import { creationTime, freshAccount, pragueEvenings } from "./test-events";

const now = Temporal.Instant.from("2027-03-10T12:00:00Z");

function maintenanceRequest(authorization: string | null): Request {
	const headers = new Headers();

	if (authorization !== null) {
		headers.set("authorization", authorization);
	}

	return new Request("http://localhost:3000/api/maintenance", { method: "POST", headers });
}

beforeEach(async () => {
	await db().delete(events);
	await db().delete(emailCounts);
});

describe("the maintenance pass", () => {
	it("deletes expired sessions and sign-in links and email counts older than a day", async () => {
		const jana = await freshAccount("jana");

		const expired = now.toString();
		const later = now.add({ hours: 1 }).toString();

		// Better Auth's tables take `Date` values, so the rows go in as SQL.
		await db().execute(sql`
			insert into auth_sessions (id, token, user_id, expires_at) values
				(${`${jana}-old`}, ${`${jana}-old`}, ${jana}, ${expired}::timestamptz),
				(${`${jana}-new`}, ${`${jana}-new`}, ${jana}, ${later}::timestamptz)`);
		await db().execute(sql`
			insert into auth_verifications (id, identifier, value, expires_at) values
				(${`${jana}-old`}, ${jana}, 'a', ${expired}::timestamptz),
				(${`${jana}-new`}, ${jana}, 'b', ${later}::timestamptz)`);
		await db()
			.insert(emailCounts)
			.values([
				{ key: "all", hour: now.subtract({ hours: 25 }).toString(), count: 1 },
				{ key: "all", hour: now.subtract({ hours: 24 }).toString(), count: 1 },
			]);

		await maintain(now);

		const sessions = await db()
			.select({ id: authSessions.id })
			.from(authSessions)
			.where(eq(authSessions.userId, jana));

		const links = await db()
			.select({ id: authVerifications.id })
			.from(authVerifications)
			.where(eq(authVerifications.identifier, jana));

		const counts = await db().select({ hour: emailCounts.hour }).from(emailCounts);

		expect(sessions).toEqual([{ id: `${jana}-new` }]);
		expect(links).toEqual([{ id: `${jana}-new` }]);
		expect(counts).toHaveLength(1);
	});
});

describe("POST /api/maintenance", () => {
	it("runs the pass for the bearer of the maintenance secret and answers the count", async () => {
		const created = await createEvent(pragueEvenings, creationTime);

		expect(created.ok).toBe(true);

		const response = await POST(maintenanceRequest(`Bearer ${env().MAINTENANCE_SECRET}`));

		expect(response.status).toBe(200);
		// The test event lies in 2027, so nothing expired yet.
		expect(await response.json()).toEqual({ deleted: 0, sent: 0 });
	});

	it("refuses a missing or wrong secret without running the pass", async () => {
		const answers = await Promise.all(
			[null, "Bearer wrong", `Basic ${env().MAINTENANCE_SECRET}`].map((authorization) =>
				POST(maintenanceRequest(authorization)),
			),
		);

		expect(answers.map((response) => response.status)).toEqual([401, 401, 401]);
	});
});
