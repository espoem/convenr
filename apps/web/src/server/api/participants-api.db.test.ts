import { beforeEach, describe, expect, it } from "vitest";

import { PUT as saveAvailability } from "@/app/api/v1/events/[id]/participants/me/availability/route";
import {
	DELETE as removePassword,
	PUT as setPassword,
} from "@/app/api/v1/events/[id]/participants/me/password/route";
import { DELETE as leave, GET as readMe } from "@/app/api/v1/events/[id]/participants/me/route";
import { POST as join } from "@/app/api/v1/events/[id]/participants/route";
import { GET as readEvent } from "@/app/api/v1/events/[id]/route";
import { GET as readWindows } from "@/app/api/v1/events/[id]/windows/route";
import { db } from "@/db/client";
import { participants } from "@/db/schema";
import { isPublicId } from "@/domain/public-id";

import { joinLinked } from "../participants";
import { freshAccount, resetTestDatabase } from "../test-events";
import {
	type AvailabilityRequest,
	eventSchema,
	joinedSchema,
	participantSchema,
	windowsSchema,
} from "./schemas";
import {
	bodyOf,
	call,
	createdEvent,
	FIRST_DAY,
	FIVE,
	joined,
	pragueEvenings,
	pragueSlot,
	refusalOf,
	SIX,
} from "./test-client";

// Password hashing is slow on purpose, and slower on a loaded machine.
const PASSWORD_TIMEOUT = 30_000;

beforeEach(async () => {
	await resetTestDatabase();
});

describe("joining", () => {
	it("returns the participant by public id and a token that no cache keeps", async () => {
		const { id } = await createdEvent();
		const response = await call(join, { id }, { method: "POST", body: { name: " Jana " } });

		expect(response.headers.get("Cache-Control")).toBe("no-store");

		const { participant, participantToken } = await bodyOf(response, joinedSchema);

		expect(participant).toMatchObject({ name: "Jana", availability: [] });
		expect(isPublicId(participant.id)).toBe(true);
		expect(participantToken).toMatch(/^cvp_[\w-]{43}$/u);
	});

	it("points at a name that is not allowed and refuses an unknown event", async () => {
		const { id } = await createdEvent();

		expect(
			await refusalOf(await call(join, { id }, { method: "POST", body: { name: "  " } })),
		).toMatchObject({
			status: 422,
			code: "invalid_name",
			errors: [{ pointer: "/name", code: "invalid_name" }],
		});
		expect(
			await refusalOf(
				await call(join, { id: "abcdefghijkm" }, { method: "POST", body: { name: "Jana" } }),
			),
		).toMatchObject({ status: 404, code: "not_found" });
	});

	it(
		"asks for the password of a name that has one",
		async () => {
			const { id } = await createdEvent();

			await joined(id, "Jana", "tajne");

			const response = await call(join, { id }, { method: "POST", body: { name: "jana" } });

			expect(await refusalOf(response)).toMatchObject({
				status: 403,
				code: "password_required",
				errors: [{ pointer: "/password", code: "password_required" }],
			});
		},
		PASSWORD_TIMEOUT,
	);
});

/** A request body as a client sends it, misspelt fields included. */
type SentBody = Record<string, string>;

function joinWith(id: string, body: SentBody) {
	return call(join, { id }, { method: "POST", path: `/events/${id}/participants`, body });
}

describe("a join under a name linked to an account", () => {
	it("is refused at the name, whatever password it sends", async () => {
		const { id } = await createdEvent();
		const jana = await freshAccount("jana");

		await joinLinked(id, "Jana", { kind: "new", password: "tajne" }, jana);

		expect(await refusalOf(await joinWith(id, { name: "jana", password: "tajne" }))).toMatchObject({
			status: 409,
			code: "name_in_account",
			errors: [{ pointer: "/name", code: "name_in_account" }],
		});
	});
});

describe("the password of a join", () => {
	it(
		"refuses a new password for a used name and a current one for a new name, at their fields",
		async () => {
			const { id } = await createdEvent();

			await joined(id, "Jana", "tajne");
			await joined(id, "Petr");

			expect(
				await refusalOf(await joinWith(id, { name: "jana", newPassword: "jine" })),
			).toMatchObject({
				type: "https://convenr.party/problems/name_exists",
				status: 409,
				code: "name_exists",
				errors: [{ pointer: "/newPassword", code: "name_exists" }],
			});
			expect(await refusalOf(await joinWith(id, { name: "Eva", password: "tajne" }))).toMatchObject(
				{
					status: 409,
					code: "name_unknown",
					errors: [{ pointer: "/password", code: "name_unknown" }],
				},
			);
			expect(
				await refusalOf(await joinWith(id, { name: "Petr", password: "tajne" })),
			).toMatchObject({ status: 409, code: "no_password", errors: [{ pointer: "/password" }] });
			expect(
				await refusalOf(await joinWith(id, { name: "Eva", newPassword: "abc" })),
			).toMatchObject({
				status: 422,
				code: "invalid_password",
				errors: [{ pointer: "/newPassword", code: "invalid_password" }],
			});
			expect((await joinWith(id, { name: "jana", password: "tajne" })).status).toBe(200);
		},
		PASSWORD_TIMEOUT,
	);

	it("refuses both password fields at once and a field the schema does not name", async () => {
		const { id } = await createdEvent();

		expect(
			await refusalOf(await joinWith(id, { name: "Eva", password: "a", newPassword: "b" })),
		).toMatchObject({
			status: 400,
			code: "invalid_request",
			errors: [{ pointer: "/newPassword", code: "not_allowed" }],
		});
		expect(await refusalOf(await joinWith(id, { name: "Eva", pasword: "tajne" }))).toMatchObject({
			status: 400,
			code: "invalid_request",
			errors: [{ pointer: "/pasword", code: "not_allowed" }],
		});
		expect(await db().select().from(participants)).toEqual([]);
	});
});

describe("participant token", () => {
	it("gives the same 401 for a missing token, a wrong one and an event that does not exist", async () => {
		const { id } = await createdEvent();

		const answers = await Promise.all(
			[
				call(readMe, { id }),
				call(readMe, { id }, { secret: "cvp_wrong" }),
				call(readMe, { id: "abcdefghijkm" }, { secret: "cvp_wrong" }),
			].map(async (pending) => {
				const response = await pending;

				return [response.status, response.headers.get("WWW-Authenticate"), await response.text()];
			}),
		);

		expect(answers[0]?.slice(0, 2)).toEqual([401, "Bearer"]);
		expect(new Set(answers.map((answer) => JSON.stringify(answer))).size).toBe(1);
	});

	it("answers a path id that cannot exist like a wrong token", async () => {
		const { id } = await createdEvent();
		const { token } = await joined(id, "Jana");

		const answers = await Promise.all(
			[
				call(readMe, { id: "not-an-id" }, { secret: token }),
				call(readMe, { id: "abcdefghijkm" }, { secret: token }),
			].map(async (pending) => {
				const response = await pending;

				return [response.status, await response.text()];
			}),
		);

		expect(answers[0]?.[0]).toBe(401);
		expect(answers[0]).toEqual(answers[1]);
	});

	it("refuses an admin secret with wrong_secret_kind", async () => {
		const { id, adminSecret } = await createdEvent();

		expect(await refusalOf(await call(readMe, { id }, { secret: adminSecret }))).toMatchObject({
			status: 403,
			code: "wrong_secret_kind",
		});
	});
});

describe("availability", () => {
	it("replaces the availability as a whole and returns it in time order", async () => {
		const { id } = await createdEvent();
		const { token, participantId } = await joined(id, "Jana");

		const save = (availability: unknown[]) =>
			call(saveAvailability, { id }, { method: "PUT", secret: token, body: { availability } });

		await save([FIVE]);

		expect(await bodyOf(await save([SIX, FIVE, SIX]), participantSchema)).toEqual({
			id: participantId,
			name: "Jana",
			availability: [FIVE, SIX],
			ifNeedBe: [],
		});
		expect(await bodyOf(await call(readMe, { id }, { secret: token }), participantSchema)).toEqual({
			id: participantId,
			name: "Jana",
			availability: [FIVE, SIX],
			ifNeedBe: [],
		});
	});

	it("reads a slot's start with any offset and answers it in UTC with Z", async () => {
		const { id } = await createdEvent();
		const { token } = await joined(id, "Jana");

		// Python's isoformat writes UTC as +00:00; another offset names the same instant too.
		const fiveUtc =
			Temporal.Instant.from(FIVE.start).toZonedDateTimeISO("UTC").toString().slice(0, 19) +
			"+00:00";

		const sixPrague = Temporal.Instant.from(SIX.start)
			.toZonedDateTimeISO("Europe/Prague")
			.toString()
			.replace("[Europe/Prague]", "");

		const sent = [{ start: fiveUtc }, { start: sixPrague }];

		const response = await call(
			saveAvailability,
			{ id },
			{ method: "PUT", secret: token, body: { availability: sent } },
		);

		expect((await bodyOf(response, participantSchema)).availability).toEqual([FIVE, SIX]);
	});

	it("keeps if-need-be slots in the availability and lists them apart", async () => {
		const { id } = await createdEvent();
		const { token } = await joined(id, "Jana");

		const save = (body: AvailabilityRequest) =>
			call(saveAvailability, { id }, { method: "PUT", secret: token, body });

		expect(
			await bodyOf(await save({ availability: [FIVE, SIX], ifNeedBe: [SIX] }), participantSchema),
		).toMatchObject({ availability: [FIVE, SIX], ifNeedBe: [SIX] });

		// A client that knows no levels saves what it read, and the level stays.
		expect(await bodyOf(await save({ availability: [SIX] }), participantSchema)).toMatchObject({
			availability: [SIX],
			ifNeedBe: [SIX],
		});

		expect(
			await bodyOf(await save({ availability: [SIX], ifNeedBe: [] }), participantSchema),
		).toMatchObject({ availability: [SIX], ifNeedBe: [] });
	});

	it("refuses a slot at if need be that the availability leaves out, pointing at it", async () => {
		const { id } = await createdEvent();
		const { token } = await joined(id, "Jana");

		const response = await call(
			saveAvailability,
			{ id },
			{ method: "PUT", secret: token, body: { availability: [FIVE], ifNeedBe: [FIVE, SIX] } },
		);

		expect(response.status).toBe(400);
		expect(await refusalOf(response)).toMatchObject({
			code: "invalid_request",
			errors: [{ pointer: "/ifNeedBe/1", code: "if_need_be_not_available" }],
		});
	});

	it("refuses a slot the event does not have, pointing at it", async () => {
		const { id } = await createdEvent();
		const { token } = await joined(id, "Jana");

		const response = await call(
			saveAvailability,
			{ id },
			{
				method: "PUT",
				secret: token,
				body: {
					availability: [FIVE, { weekday: 1, minute: 1020 }, pragueSlot(FIRST_DAY, "17:30")],
				},
			},
		);

		expect(await refusalOf(response)).toMatchObject({
			status: 422,
			code: "unknown_slot",
			errors: [
				{ pointer: "/availability/1", code: "unknown_slot" },
				{ pointer: "/availability/2", code: "unknown_slot" },
			],
		});
	});
});

describe("password and leaving", () => {
	it(
		"sets a password with the token alone, then needs it to remove it",
		async () => {
			const { id } = await createdEvent();
			const { token } = await joined(id, "Jana");

			const set = await call(
				setPassword,
				{ id },
				{
					method: "PUT",
					secret: token,
					body: { newPassword: "prvni" },
				},
			);

			expect(set.status).toBe(204);

			const wrong = await call(
				removePassword,
				{ id },
				{
					method: "DELETE",
					secret: token,
					body: { currentPassword: "spatne" },
				},
			);

			expect(await refusalOf(wrong)).toMatchObject({
				status: 403,
				code: "wrong_password",
				errors: [{ pointer: "/currentPassword", code: "wrong_password" }],
			});

			const removed = await call(
				removePassword,
				{ id },
				{
					method: "DELETE",
					secret: token,
					body: { currentPassword: "prvni" },
				},
			);

			expect(removed.status).toBe(204);

			const again = await call(
				removePassword,
				{ id },
				{
					method: "DELETE",
					secret: token,
					body: { currentPassword: "prvni" },
				},
			);

			expect(await refusalOf(again)).toMatchObject({ status: 409, code: "no_password" });
		},
		PASSWORD_TIMEOUT,
	);

	it(
		"points at the field each password refusal concerns",
		async () => {
			const { id } = await createdEvent();
			const { token } = await joined(id, "Jana");

			const put = (body: SentBody) =>
				call(setPassword, { id }, { method: "PUT", secret: token, body });

			expect(await refusalOf(await put({ newPassword: "abc" }))).toMatchObject({
				status: 422,
				errors: [{ pointer: "/newPassword", code: "invalid_password" }],
			});
			expect(
				await refusalOf(await put({ newPassword: "prvni", currentPassword: "nic" })),
			).toMatchObject({
				status: 409,
				code: "no_password",
				errors: [{ pointer: "/currentPassword", code: "no_password" }],
			});
			expect(await refusalOf(await put({ password: "prvni" }))).toMatchObject({
				status: 400,
				errors: [
					{ pointer: "/newPassword", code: "required" },
					{ pointer: "/password", code: "not_allowed" },
				],
			});
			expect((await put({ newPassword: "prvni" })).status).toBe(204);
			expect(await refusalOf(await put({ newPassword: "druhe" }))).toMatchObject({
				status: 403,
				errors: [{ pointer: "/currentPassword", code: "password_required" }],
			});
		},
		PASSWORD_TIMEOUT,
	);

	it("leaves the event, after which the token is unknown", async () => {
		const { id } = await createdEvent();
		const { token } = await joined(id, "Jana");

		expect((await call(leave, { id }, { method: "DELETE", secret: token })).status).toBe(204);
		expect((await call(readMe, { id }, { secret: token })).status).toBe(401);
	});
});

describe("a whole round", () => {
	it("creates, joins two, saves both, and reads the same overlap as the best window", async () => {
		const { id } = await createdEvent({
			...pragueEvenings,
			schedule: {
				mode: "dates",
				dates: [FIRST_DAY.toString()],
				dailyStart: "17:00",
				dailyEnd: "19:00",
				slotMinutes: 60,
			},
		});

		const jana = await joined(id, "Jana");
		const petr = await joined(id, "Petr");

		const save = (token: string, availability: unknown[]) =>
			call(saveAvailability, { id }, { method: "PUT", secret: token, body: { availability } });

		expect((await save(jana.token, [FIVE, SIX])).status).toBe(200);
		expect((await save(petr.token, [SIX])).status).toBe(200);

		const event = await bodyOf(await call(readEvent, { id }), eventSchema);

		expect(event.schedule).toMatchObject({ mode: "dates", dates: [FIRST_DAY.toString()] });

		const [first, second] = event.participants;

		const overlap = first?.availability.filter(
			(slot) =>
				second?.availability.some((other) => JSON.stringify(other) === JSON.stringify(slot)) ===
				true,
		);

		const best = await bodyOf(await call(readWindows, { id }), windowsSchema);

		expect(best.windows[0]?.slots).toEqual(overlap);
		expect(best.windows[0]?.participantIds).toEqual([jana.participantId, petr.participantId]);
	});

	it("names a weekday event's slots by weekday and minute, never by date", async () => {
		const { id, event } = await createdEvent({
			...pragueEvenings,
			schedule: {
				mode: "weekdays",
				weekdays: [3, 1],
				dailyStart: "17:00",
				dailyEnd: "18:00",
				slotMinutes: 30,
			},
		});

		const { token } = await joined(id, "Jana");

		expect(event.schedule.slots).toEqual([
			{ weekday: 1, minute: 1020 },
			{ weekday: 1, minute: 1050 },
			{ weekday: 3, minute: 1020 },
			{ weekday: 3, minute: 1050 },
		]);
		expect(event.retention.kind).toBe("until");

		await call(
			saveAvailability,
			{ id },
			{
				method: "PUT",
				secret: token,
				body: {
					availability: [
						{ weekday: 3, minute: 1020 },
						{ weekday: 3, minute: 1050 },
					],
				},
			},
		);

		expect((await bodyOf(await call(readWindows, { id }), windowsSchema)).windows).toMatchObject([
			{
				slots: [
					{ weekday: 3, minute: 1020 },
					{ weekday: 3, minute: 1050 },
				],
				minutes: 60,
			},
		]);
	});
});
